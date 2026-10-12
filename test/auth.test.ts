import { generateKeyPairSync, verify } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createAppJwt, GitHubApiError, InstallationTokenProvider, loadPrivateKey } from "../src/github/auth.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const NOW = Date.parse("2026-10-12T00:00:00Z");
const HOUR = 60 * 60 * 1000;

function tokenResponse(token: string, expiresAt: number, status = 201): Response {
  return new Response(JSON.stringify({ token, expires_at: new Date(expiresAt).toISOString() }), { status });
}

function makeProvider(fetchFn: typeof fetch, clock: { t: number }) {
  return new InstallationTokenProvider({
    appId: "12345",
    privateKey,
    fetch: fetchFn,
    now: () => clock.t,
    apiBase: "https://api.test",
  });
}

describe("createAppJwt", () => {
  it("RS256 서명과 claim(iss, iat, exp)이 올바르다", () => {
    const jwt = createAppJwt("12345", privateKey, NOW);
    const [h, p, s] = jwt.split(".") as [string, string, string];

    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    const nowSec = NOW / 1000;
    expect(claims).toEqual({ iss: "12345", iat: nowSec - 60, exp: nowSec + 540 });
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(600);

    expect(verify("RSA-SHA256", Buffer.from(`${h}.${p}`), publicKey, Buffer.from(s, "base64url"))).toBe(true);
  });
});

describe("loadPrivateKey", () => {
  it("PEM 파일을 읽는다 (PKCS#1, PKCS#8 모두)", () => {
    const dir = mkdtempSync(join(tmpdir(), "key-"));
    const pkcs1 = join(dir, "a.pem");
    const pkcs8 = join(dir, "b.pem");
    writeFileSync(pkcs1, privateKey.export({ type: "pkcs1", format: "pem" }));
    writeFileSync(pkcs8, privateKey.export({ type: "pkcs8", format: "pem" }));
    expect(loadPrivateKey(pkcs1).type).toBe("private");
    expect(loadPrivateKey(pkcs8).type).toBe("private");
  });

  it("파일이 없으면 경로가 들어간 에러를 낸다", () => {
    expect(() => loadPrivateKey("/no/such/key.pem")).toThrow(/\/no\/such\/key\.pem/);
  });

  it("PEM이 아니면 형식 에러를 낸다", () => {
    const file = join(mkdtempSync(join(tmpdir(), "key-")), "bad.pem");
    writeFileSync(file, "not a pem");
    expect(() => loadPrivateKey(file)).toThrow(/형식/);
  });
});

describe("InstallationTokenProvider", () => {
  it("올바른 URL과 헤더로 토큰을 요청한다", async () => {
    const fetchFn = vi.fn(async () => tokenResponse("tok-1", NOW + HOUR));
    const provider = makeProvider(fetchFn as unknown as typeof fetch, { t: NOW });

    expect(await provider.getToken(777)).toBe("tok-1");

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.test/app/installations/777/access_tokens");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    expect(headers.accept).toBe("application/vnd.github+json");
  });

  it("만료 전에는 캐시를 재사용한다", async () => {
    const fetchFn = vi.fn(async () => tokenResponse("tok-1", NOW + HOUR));
    const clock = { t: NOW };
    const provider = makeProvider(fetchFn as unknown as typeof fetch, clock);

    await provider.getToken(1);
    clock.t = NOW + 30 * 60 * 1000;
    expect(await provider.getToken(1)).toBe("tok-1");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("만료 5분 전부터는 새 토큰을 받는다", async () => {
    let n = 0;
    const fetchFn = vi.fn(async () => tokenResponse(`tok-${++n}`, clock.t + HOUR));
    const clock = { t: NOW };
    const provider = makeProvider(fetchFn as unknown as typeof fetch, clock);

    await provider.getToken(1);
    clock.t = NOW + HOUR - 5 * 60 * 1000 - 1;
    expect(await provider.getToken(1)).toBe("tok-1");
    clock.t = NOW + HOUR - 5 * 60 * 1000;
    expect(await provider.getToken(1)).toBe("tok-2");
  });

  it("installation 별로 캐시를 따로 둔다", async () => {
    let n = 0;
    const fetchFn = vi.fn(async () => tokenResponse(`tok-${++n}`, NOW + HOUR));
    const provider = makeProvider(fetchFn as unknown as typeof fetch, { t: NOW });
    expect(await provider.getToken(1)).toBe("tok-1");
    expect(await provider.getToken(2)).toBe("tok-2");
    expect(await provider.getToken(1)).toBe("tok-1");
  });

  it("동시 요청은 GitHub 호출 한 번으로 합친다", async () => {
    const fetchFn = vi.fn(async () => tokenResponse("tok-1", NOW + HOUR));
    const provider = makeProvider(fetchFn as unknown as typeof fetch, { t: NOW });
    const tokens = await Promise.all([provider.getToken(1), provider.getToken(1), provider.getToken(1)]);
    expect(tokens).toEqual(["tok-1", "tok-1", "tok-1"]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("invalidate 후에는 새 토큰을 받는다", async () => {
    let n = 0;
    const fetchFn = vi.fn(async () => tokenResponse(`tok-${++n}`, NOW + HOUR));
    const provider = makeProvider(fetchFn as unknown as typeof fetch, { t: NOW });
    await provider.getToken(1);
    provider.invalidate(1);
    expect(await provider.getToken(1)).toBe("tok-2");
  });

  it("발급 실패 시 상태 코드가 담긴 에러를 내고, 실패는 캐시하지 않는다", async () => {
    let fail = true;
    const fetchFn = vi.fn(async () =>
      fail ? new Response('{"message":"Bad credentials"}', { status: 401 }) : tokenResponse("tok-1", NOW + HOUR),
    );
    const provider = makeProvider(fetchFn as unknown as typeof fetch, { t: NOW });

    const err = await provider.getToken(1).catch((e) => e);
    expect(err).toBeInstanceOf(GitHubApiError);
    expect(err.status).toBe(401);

    fail = false;
    expect(await provider.getToken(1)).toBe("tok-1");
  });
});
