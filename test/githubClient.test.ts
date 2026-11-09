import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GitHubApiError, InstallationTokenProvider } from "../src/github/auth.js";
import { GitHubClient } from "../src/github/client.js";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function make(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return handler(String(url), init ?? {});
  }) as unknown as typeof fetch;
  const tokens = new InstallationTokenProvider({ appId: "1", privateKey, fetch: fetchFn, apiBase: "https://api.test" });
  const client = new GitHubClient({ appId: "1", privateKey, tokens, fetch: fetchFn, apiBase: "https://api.test" });
  return { client, calls, tokens };
}

const base = (url: string): Response | undefined => {
  if (url.endsWith("/installation")) return json({ id: 77 });
  if (url.endsWith("/access_tokens")) return json({ token: "tok", expires_at: new Date(Date.now() + 3600_000).toISOString() }, 201);
  return undefined;
};

describe("GitHubClient", () => {
  it("설치 ID를 찾고 캐시하며 토큰을 헤더에 쓴다", async () => {
    const { client, calls } = make((url) => base(url) ?? json({ title: "T", body: null, state: "open", base: { ref: "main" }, head: { ref: "f", sha: "s" } }));
    const a = await client.getPull("o/r", 3);
    await client.getPull("o/r", 3);
    expect(a).toMatchObject({ title: "T", body: "", baseRef: "main", headSha: "s" });
    expect(calls.filter((c) => c.url.endsWith("/installation"))).toHaveLength(1);
    const pull = calls.find((c) => c.url.endsWith("/pulls/3"))!;
    expect((pull.init.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });

  it("diff는 diff 미디어 타입으로 요청한다", async () => {
    const { client, calls } = make((url) => base(url) ?? new Response("diff --git a/x b/x\n"));
    expect(await client.getPullDiff("o/r", 3)).toContain("diff --git");
    const call = calls.find((c) => c.url.endsWith("/pulls/3"))!;
    expect((call.init.headers as Record<string, string>).accept).toBe("application/vnd.github.diff");
  });

  it("파일 목록은 페이지를 넘겨 가며 모은다", async () => {
    const page = (n: number) => Array.from({ length: n }, (_, i) => ({ filename: `f${i}`, status: "modified", additions: 1, deletions: 0 }));
    const { client, calls } = make((url) => {
      if (url.endsWith("&page=1")) return json(page(100));
      if (url.endsWith("&page=2")) return json(page(5));
      return base(url) ?? json([]);
    });
    expect(await client.getPullFiles("o/r", 3)).toHaveLength(105);
    expect(calls.filter((c) => c.url.includes("/files?")).length).toBe(2);
  });

  it("앱이 설치되지 않은 레포는 404 오류", async () => {
    const { client } = make(() => json({ message: "Not Found" }, 404));
    await expect(client.getPull("o/r", 3)).rejects.toMatchObject({ status: 404 });
  });

  it("401을 받으면 토큰을 새로 받아 한 번만 다시 시도한다", async () => {
    let first = true;
    const { client, calls } = make((url) => {
      const b = base(url);
      if (b) return b;
      if (first) { first = false; return json({ message: "Bad credentials" }, 401); }
      return json({ title: "T", body: "", state: "open", base: { ref: "m" }, head: { ref: "f", sha: "s" } });
    });
    expect((await client.getPull("o/r", 3)).title).toBe("T");
    expect(calls.filter((c) => c.url.endsWith("/access_tokens"))).toHaveLength(2);
  });

  it("계속 401이면 오류를 던진다", async () => {
    const { client } = make((url) => base(url) ?? json({}, 401));
    await expect(client.getPull("o/r", 3)).rejects.toBeInstanceOf(GitHubApiError);
  });

  it("파일 목록의 patch와 이전 경로를 함께 읽는다", async () => {
    const { client, calls } = make((url) => base(url) ?? json([
      { filename: "a.py", status: "modified", additions: 1, deletions: 0, patch: "@@ x" },
      { filename: "n.py", status: "renamed", additions: 0, deletions: 0, previous_filename: "o.py" },
      { filename: "big.json", status: "added", additions: 9, deletions: 0 },
    ]));
    const files = await client.getPullFilesPatched("o/r", 3);
    expect(files).toEqual([
      { path: "a.py", status: "modified", additions: 1, deletions: 0, patch: "@@ x" },
      { path: "n.py", status: "renamed", additions: 0, deletions: 0, previousPath: "o.py" },
      { path: "big.json", status: "added", additions: 9, deletions: 0 },
    ]);
    expect(calls.some((c) => c.url.includes("/pulls/3/files"))).toBe(true);
    expect(await client.getPullFiles("o/r", 3)).toHaveLength(3);
  });

  it("코멘트를 게시하고 URL을 돌려준다", async () => {
    const { client, calls } = make((url) => base(url) ?? json({ html_url: "https://x/c", id: 77 }, 201));
    expect(await client.createComment("o/r", 3, "안녕")).toEqual({ url: "https://x/c", id: 77 });
    const call = calls.find((c) => c.url.endsWith("/issues/3/comments"))!;
    expect(call.init.method).toBe("POST");
    expect(JSON.parse(call.init.body as string)).toEqual({ body: "안녕" });
  });

  describe("updateComment", () => {
    const own = { performed_via_github_app: { id: 1 }, issue_url: "https://api.github.com/repos/o/r/issues/3" };
    it("이 앱이 쓴 코멘트를 읽어 확인한 뒤 수정한다", async () => {
      const { client, calls } = make((url, init) => base(url)
        ?? (init?.method === "PATCH" ? json({ html_url: "https://x/c", id: 77 }) : json(own)));
      expect(await client.updateComment("o/r", 3, 77, "결과")).toEqual({ url: "https://x/c", id: 77 });
      const methods = calls.filter((c) => c.url.endsWith("/issues/comments/77")).map((c) => c.init.method ?? "GET");
      expect(methods).toEqual(["GET", "PATCH"]);
      const patch = calls.find((c) => c.init.method === "PATCH")!;
      expect(JSON.parse(patch.init.body as string)).toEqual({ body: "결과" });
    });

    it("다른 앱이나 사람이 쓴 코멘트는 수정하지 않는다", async () => {
      for (const other of [{ ...own, performed_via_github_app: null }, { ...own, performed_via_github_app: { id: 999 } }, {}]) {
        const { client, calls } = make((url) => base(url) ?? json(other));
        await expect(client.updateComment("o/r", 3, 77, "x")).rejects.toMatchObject({ status: 403 });
        expect(calls.some((c) => c.init.method === "PATCH")).toBe(false);
      }
    });

    it("다른 PR의 코멘트는 수정하지 않는다", async () => {
      const { client, calls } = make((url) => base(url) ?? json({ ...own, issue_url: "https://api.github.com/repos/o/r/issues/30" }));
      await expect(client.updateComment("o/r", 3, 77, "x")).rejects.toMatchObject({ status: 403 });
      expect(calls.some((c) => c.init.method === "PATCH")).toBe(false);
    });

    it("수정이 200이 아니면 오류", async () => {
      const { client } = make((url, init) => base(url) ?? (init?.method === "PATCH" ? json({}, 422) : json(own)));
      await expect(client.updateComment("o/r", 3, 77, "x")).rejects.toMatchObject({ status: 422 });
    });
  });

  it("코멘트 게시가 201이 아니면 오류", async () => {
    const { client } = make((url) => base(url) ?? json({ message: "no" }, 403));
    await expect(client.createComment("o/r", 3, "x")).rejects.toMatchObject({ status: 403 });
  });
});
