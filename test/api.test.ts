import { describe, expect, it, vi } from "vitest";
import { REPLAY_WINDOW_SEC } from "../src/api/auth.js";
import { limitDiff, splitDiffByPath } from "../src/api/diff.js";
import { GitHubApiError } from "../src/github/auth.js";
import type { GitHubClient } from "../src/github/client.js";
import { buildServer } from "../src/server.js";
import { sign } from "../src/webhook/signature.js";

const SECRET = "api-secret";
const NOW = Date.parse("2026-10-13T00:00:00Z");

const DIFF = [
  "diff --git a/a.py b/a.py\n--- a/a.py\n+++ b/a.py\n@@ -1 +1,2 @@\n x\n+y\n",
  "diff --git a/b.py b/b.py\n--- a/b.py\n+++ b/b.py\n@@ -1 +1,2 @@\n x\n+z\n",
].join("");
const FILES = [
  { path: "a.py", status: "modified", additions: 1, deletions: 0 },
  { path: "b.py", status: "modified", additions: 1, deletions: 0 },
];
const SHA = "abc1421511aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function fakeGithub(overrides: Partial<Record<keyof GitHubClient, unknown>> = {}): GitHubClient {
  return {
    getPull: vi.fn(async () => ({ title: "T", body: "B", state: "open", baseRef: "main", headRef: "feat", headSha: "h".repeat(40) })),
    getPullFiles: vi.fn(async () => FILES),
    getPullDiff: vi.fn(async () => DIFF),
    getPullCommitShas: vi.fn(async () => [SHA, "d".repeat(40)]),
    getCommitFiles: vi.fn(async () => [FILES[0]]),
    getCommitDiff: vi.fn(async () => DIFF.split("diff --git a/b.py")[0]),
    createComment: vi.fn(async () => ({ url: "https://github.com/o/r/pull/3#issuecomment-1" })),
    ...overrides,
  } as unknown as GitHubClient;
}

function server(github: GitHubClient = fakeGithub(), extra: Record<string, unknown> = {}) {
  const { app } = buildServer(
    { logLevel: "silent", webhookSecret: undefined, hermesApiSecret: SECRET, apiAllowedOwners: [], ...extra },
    undefined,
    github,
  );
  return app;
}

async function call(app: ReturnType<typeof server>, path: string, payload: unknown, opts: { ts?: string; sig?: string; secret?: string } = {}) {
  const body = JSON.stringify(payload);
  const ts = opts.ts ?? String(Math.floor(Date.now() / 1000));
  const sig = opts.sig ?? sign(opts.secret ?? SECRET, `${ts}.${body}`);
  return app.inject({
    method: "POST",
    url: path,
    payload: body,
    headers: { "content-type": "application/json", "x-hermes-timestamp": ts, "x-hermes-signature": sig },
  });
}

describe("서명 검증", () => {
  it("올바른 서명은 통과한다", async () => {
    const res = await call(server(), "/api/pr", { repo: "o/r", pr: 3 });
    expect(res.statusCode).toBe(200);
  });

  it("서명이 틀리거나 없으면 401이고 GitHub을 호출하지 않는다", async () => {
    const github = fakeGithub();
    const app = server(github);
    expect((await call(app, "/api/pr", { repo: "o/r", pr: 3 }, { secret: "other" })).statusCode).toBe(401);
    expect((await call(app, "/api/pr", { repo: "o/r", pr: 3 }, { sig: "sha256=00" })).statusCode).toBe(401);
    const bare = await app.inject({ method: "POST", url: "/api/pr", payload: { repo: "o/r", pr: 3 } });
    expect(bare.statusCode).toBe(401);
    expect(github.getPull).not.toHaveBeenCalled();
  });

  it("바디를 바꾸면 서명이 맞지 않는다", async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = sign(SECRET, `${ts}.${JSON.stringify({ repo: "o/r", pr: 3 })}`);
    const res = await call(server(), "/api/pr", { repo: "o/r", pr: 4 }, { ts, sig });
    expect(res.statusCode).toBe(401);
  });

  it("오래되거나 미래의 요청은 거부한다 (재전송 방어)", async () => {
    const app = server();
    const old = String(Math.floor(Date.now() / 1000) - REPLAY_WINDOW_SEC - 10);
    const future = String(Math.floor(Date.now() / 1000) + REPLAY_WINDOW_SEC + 10);
    for (const ts of [old, future]) {
      const res = await call(app, "/api/pr", { repo: "o/r", pr: 3 }, { ts });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("stale_request");
    }
  });

  it("타임스탬프 형식이 잘못되면 거부한다", async () => {
    const res = await call(server(), "/api/pr", { repo: "o/r", pr: 3 }, { ts: "abc" });
    expect(res.statusCode).toBe(401);
  });

  it("키가 없으면 API가 열리지 않는다", async () => {
    const app = server(fakeGithub(), { hermesApiSecret: undefined });
    const res = await app.inject({ method: "POST", url: "/api/pr", payload: {} });
    expect(res.statusCode).toBe(404);
  });

  it("webhook 라우트와 함께 있어도 둘 다 동작한다", async () => {
    const { app } = buildServer(
      { logLevel: "silent", webhookSecret: "wh", hermesApiSecret: SECRET, apiAllowedOwners: [] },
      new Map(),
      fakeGithub(),
    );
    expect((await call(app, "/api/pr", { repo: "o/r", pr: 3 })).statusCode).toBe(200);
    const body = JSON.stringify({ zen: "x" });
    const res = await app.inject({
      method: "POST",
      url: "/webhook",
      payload: body,
      headers: { "content-type": "application/json", "x-hub-signature-256": sign("wh", body), "x-github-event": "ping", "x-github-delivery": "d1" },
    });
    expect(res.statusCode).toBeLessThan(300);
  });
});

describe("POST /api/pr", () => {
  it("PR 전체 정보와 diff를 돌려준다", async () => {
    const res = await call(server(), "/api/pr", { repo: "o/r", pr: 3 });
    const data = res.json();
    expect(data).toMatchObject({ repo: "o/r", pr: 3, scope: "pr", commit: null, title: "T", body: "B", base_ref: "main", truncated: false });
    expect(data.files.map((f: { path: string }) => f.path)).toEqual(["a.py", "b.py"]);
    expect(data.files.every((f: { diff_included: boolean }) => f.diff_included)).toBe(true);
    expect(data.diff).toContain("+y");
  });

  it("커밋을 주면 그 커밋의 diff만 돌려주고 접두어로 전체 SHA를 찾는다", async () => {
    const res = await call(server(), "/api/pr", { repo: "o/r", pr: 3, commit: "ABC1421511" });
    const data = res.json();
    expect(data.scope).toBe("commit");
    expect(data.commit).toBe(SHA);
    expect(data.files.map((f: { path: string }) => f.path)).toEqual(["a.py"]);
    expect(data.diff).not.toContain("b.py");
  });

  it("이 PR에 속하지 않은 커밋은 404이고 diff를 가져오지 않는다", async () => {
    const github = fakeGithub();
    const res = await call(server(github), "/api/pr", { repo: "o/r", pr: 3, commit: "eeeeeee" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("commit_not_in_pr");
    expect(github.getCommitDiff).not.toHaveBeenCalled();
  });

  it("입력 검증", async () => {
    const app = server();
    const bad = [
      {}, { repo: "x", pr: 1 }, { repo: "o/r" }, { repo: "o/r", pr: "3" }, { repo: "o/r", pr: 0 }, { repo: "o/r", pr: 1.5 },
      { repo: "o/r/../x", pr: 1 }, { repo: "o/r", pr: 1, commit: "xyz" }, { repo: "o/r", pr: 1, commit: "abc" },
      { repo: "o/r", pr: 1, commit: "--output=x" },
    ];
    for (const payload of bad) {
      expect((await call(app, "/api/pr", payload)).statusCode, JSON.stringify(payload)).toBe(400);
    }
  });

  it("허용된 소유자만 받는다", async () => {
    const app = server(fakeGithub(), { apiAllowedOwners: ["mine"] });
    expect((await call(app, "/api/pr", { repo: "other/r", pr: 1 })).statusCode).toBe(403);
    expect((await call(app, "/api/pr", { repo: "Mine/r", pr: 1 })).statusCode).toBe(200);
  });

  it("GitHub 오류를 상태에 맞게 바꾼다", async () => {
    for (const [status, expected] of [[404, 404], [403, 403], [500, 502]] as const) {
      const github = fakeGithub({ getPull: vi.fn(async () => { throw new GitHubApiError(status, "x"); }) });
      expect((await call(server(github), "/api/pr", { repo: "o/r", pr: 3 })).statusCode).toBe(expected);
    }
  });

  it("diff가 상한을 넘으면 뒤쪽 파일은 diff_included=false", async () => {
    const app = server(fakeGithub(), { });
    const small = buildServer({ logLevel: "silent", webhookSecret: undefined, hermesApiSecret: SECRET, apiAllowedOwners: [] }, undefined, fakeGithub());
    expect(small.app).toBeDefined();
    const files = FILES;
    const first = splitDiffByPath(DIFF).get("a.py")!;
    const limited = limitDiff(files, DIFF, first.length + 1);
    expect(limited.truncated).toBe(true);
    expect(limited.files.map((f) => f.diffIncluded)).toEqual([true, false]);
    expect(limited.diff).toBe(first);
    expect(app).toBeDefined();
  });
});

describe("diff 유틸", () => {
  it("경로별로 나눈다", () => {
    expect([...splitDiffByPath(DIFF).keys()]).toEqual(["a.py", "b.py"]);
  });

  it("GitHub이 diff를 생략한 파일은 diff_included=false", () => {
    const limited = limitDiff(FILES, splitDiffByPath(DIFF).get("a.py")!, 10_000);
    expect(limited.files.map((f) => f.diffIncluded)).toEqual([true, false]);
    expect(limited.truncated).toBe(true);
  });
});

describe("POST /api/comment", () => {
  const payload = { repo: "o/r", pr: 3, body: "보고서", deliveryId: "d-1" };

  it("코멘트를 게시한다", async () => {
    const github = fakeGithub();
    const res = await call(server(github), "/api/comment", payload);
    expect(res.json()).toEqual({ ok: true, url: "https://github.com/o/r/pull/3#issuecomment-1", duplicate: false });
    expect(github.createComment).toHaveBeenCalledWith("o/r", 3, "보고서");
  });

  it("같은 deliveryId는 한 번만 게시한다", async () => {
    const github = fakeGithub();
    const app = server(github);
    await call(app, "/api/comment", payload);
    const again = await call(app, "/api/comment", payload);
    expect(again.json().duplicate).toBe(true);
    expect(github.createComment).toHaveBeenCalledTimes(1);
  });

  it("동시에 같은 요청이 와도 한 번만 게시한다", async () => {
    const github = fakeGithub();
    const app = server(github);
    await Promise.all([call(app, "/api/comment", payload), call(app, "/api/comment", payload)]);
    expect(github.createComment).toHaveBeenCalledTimes(1);
  });

  it("실패하면 기록하지 않아 다시 시도할 수 있다", async () => {
    const create = vi.fn()
      .mockRejectedValueOnce(new GitHubApiError(500, "x"))
      .mockResolvedValueOnce({ url: "u" });
    const app = server(fakeGithub({ createComment: create }));
    expect((await call(app, "/api/comment", payload)).statusCode).toBe(502);
    expect((await call(app, "/api/comment", payload)).statusCode).toBe(200);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("입력 검증", async () => {
    const app = server();
    const bad = [
      { ...payload, body: "" }, { ...payload, body: "  " }, { ...payload, body: "a".repeat(60_001) },
      { ...payload, body: 3 }, { ...payload, deliveryId: "bad id" }, { ...payload, deliveryId: undefined },
      { ...payload, pr: -1 }, { ...payload, repo: "nope" },
    ];
    for (const p of bad) expect((await call(app, "/api/comment", p)).statusCode, JSON.stringify(p).slice(0, 60)).toBe(400);
  });

  it("서명 없이는 게시하지 않는다", async () => {
    const github = fakeGithub();
    const res = await call(server(github), "/api/comment", payload, { secret: "wrong" });
    expect(res.statusCode).toBe(401);
    expect(github.createComment).not.toHaveBeenCalled();
  });

  it("NOW 상수 사용 확인", () => {
    expect(NOW).toBeGreaterThan(0);
  });
});
