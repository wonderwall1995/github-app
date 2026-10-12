import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";

const API_BASE = "https://api.github.com";
/** 만료 직전에 쓰다가 401을 받지 않도록, 만료 5분 전부터는 새 토큰을 받는다. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export function loadPrivateKey(path: string): KeyObject {
  let pem: string;
  try {
    pem = readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(`GitHub App private key를 읽을 수 없다: ${path} (${(err as Error).message})`);
  }
  try {
    return createPrivateKey(pem);
  } catch {
    throw new Error(`GitHub App private key 형식이 올바르지 않다: ${path}`);
  }
}

const b64url = (input: Buffer | string): string => Buffer.from(input).toString("base64url");

/** App 인증용 JWT(RS256). GitHub 제한은 최대 10분이라 9분만 쓰고, 시계 오차에 대비해 iat를 60초 앞당긴다. */
export function createAppJwt(appId: string, key: KeyObject, nowMs: number = Date.now()): string {
  const nowSec = Math.floor(nowMs / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iat: nowSec - 60, exp: nowSec + 9 * 60, iss: appId }));
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), key);
  return `${header}.${payload}.${b64url(signature)}`;
}

export interface InstallationTokenOptions {
  appId: string;
  privateKey: KeyObject;
  fetch?: typeof fetch;
  now?: () => number;
  apiBase?: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** installation 별 access token을 발급하고, 만료 전까지 캐시해서 재사용한다. */
export class InstallationTokenProvider {
  private readonly cache = new Map<number, CachedToken>();
  private readonly inflight = new Map<number, Promise<string>>();
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private readonly apiBase: string;

  constructor(private readonly opts: InstallationTokenOptions) {
    this.fetchFn = opts.fetch ?? fetch;
    this.now = opts.now ?? Date.now;
    this.apiBase = opts.apiBase ?? API_BASE;
  }

  async getToken(installationId: number): Promise<string> {
    const cached = this.cache.get(installationId);
    if (cached && cached.expiresAt - REFRESH_MARGIN_MS > this.now()) return cached.token;

    // 동시에 여러 요청이 와도 GitHub 호출은 installation 당 한 번만 한다.
    let pending = this.inflight.get(installationId);
    if (!pending) {
      pending = this.issue(installationId).finally(() => this.inflight.delete(installationId));
      this.inflight.set(installationId, pending);
    }
    return pending;
  }

  /** API가 401을 돌려줬을 때 호출해서, 다음 getToken이 새 토큰을 받게 한다. */
  invalidate(installationId: number): void {
    this.cache.delete(installationId);
  }

  private async issue(installationId: number): Promise<string> {
    const jwt = createAppJwt(this.opts.appId, this.opts.privateKey, this.now());
    const res = await this.fetchFn(`${this.apiBase}/app/installations/${installationId}/access_tokens`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${jwt}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "github-app",
      },
    });
    if (res.status !== 201) {
      // 응답 바디에는 토큰이 없으므로 에러 메시지에 포함해도 안전하다.
      throw new GitHubApiError(res.status, `installation token 발급 실패 (${res.status}): ${await res.text()}`);
    }
    const body = (await res.json()) as { token: string; expires_at: string };
    this.cache.set(installationId, { token: body.token, expiresAt: Date.parse(body.expires_at) });
    return body.token;
  }
}
