import { createAppJwt, GitHubApiError, type InstallationTokenProvider } from "./auth.js";
import type { KeyObject } from "node:crypto";

const API_BASE = "https://api.github.com";
const MAX_PAGES = 30;

export interface GitHubClientOptions {
  appId: string;
  privateKey: KeyObject;
  tokens: InstallationTokenProvider;
  fetch?: typeof fetch;
  now?: () => number;
  apiBase?: string;
}

export interface PullInfo {
  title: string;
  body: string;
  state: string;
  baseRef: string;
  headRef: string;
  headSha: string;
}

export interface FileInfo {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

/** 파일 목록 응답에 들어 있는 파일별 diff(patch)까지 담은 정보. patch가 없으면 GitHub이 생략한 것이다. */
export interface PatchedFile extends FileInfo {
  patch?: string;
  previousPath?: string;
}

interface RawFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
  previous_filename?: string;
}

const toPatched = (f: RawFile): PatchedFile => ({
  path: f.filename,
  status: f.status,
  additions: f.additions,
  deletions: f.deletions,
  ...(typeof f.patch === "string" ? { patch: f.patch } : {}),
  ...(f.previous_filename ? { previousPath: f.previous_filename } : {}),
});

interface ApiOptions {
  method?: string;
  accept?: string;
  body?: unknown;
}

/** GitHub REST API를 installation 토큰으로 호출한다. 이 파일은 읽기와 코멘트 게시, 이 앱이 쓴 코멘트의 수정만 한다. */
export class GitHubClient {
  private readonly installations = new Map<string, number>();
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private readonly apiBase: string;

  constructor(private readonly opts: GitHubClientOptions) {
    this.fetchFn = opts.fetch ?? fetch;
    this.now = opts.now ?? Date.now;
    this.apiBase = opts.apiBase ?? API_BASE;
  }

  private headers(token: string, accept: string): Record<string, string> {
    return {
      authorization: `Bearer ${token}`,
      accept,
      "x-github-api-version": "2022-11-28",
      "user-agent": "github-app",
    };
  }

  /** 앱이 설치되지 않은 레포면 GitHubApiError(404)를 던진다. */
  async installationId(repo: string): Promise<number> {
    const cached = this.installations.get(repo);
    if (cached !== undefined) return cached;
    const jwt = createAppJwt(this.opts.appId, this.opts.privateKey, this.now());
    const res = await this.fetchFn(`${this.apiBase}/repos/${repo}/installation`, {
      headers: this.headers(jwt, "application/vnd.github+json"),
    });
    if (res.status !== 200) {
      throw new GitHubApiError(res.status, `installation 조회 실패 (${res.status})`);
    }
    const body = (await res.json()) as { id: number };
    this.installations.set(repo, body.id);
    return body.id;
  }

  private async call(repo: string, path: string, opts: ApiOptions = {}): Promise<Response> {
    const installation = await this.installationId(repo);
    for (let attempt = 0; ; attempt++) {
      const token = await this.opts.tokens.getToken(installation);
      const res = await this.fetchFn(`${this.apiBase}${path}`, {
        method: opts.method ?? "GET",
        headers: {
          ...this.headers(token, opts.accept ?? "application/vnd.github+json"),
          ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
      // 토큰이 만료되었으면 한 번만 새 토큰으로 다시 시도한다.
      if (res.status === 401 && attempt === 0) {
        this.opts.tokens.invalidate(installation);
        continue;
      }
      return res;
    }
  }

  private async json<T>(repo: string, path: string): Promise<T> {
    const res = await this.call(repo, path);
    if (res.status !== 200) throw new GitHubApiError(res.status, `GitHub 호출 실패 ${path} (${res.status})`);
    return (await res.json()) as T;
  }

  private async text(repo: string, path: string, accept: string): Promise<string> {
    const res = await this.call(repo, path, { accept });
    if (res.status !== 200) throw new GitHubApiError(res.status, `GitHub 호출 실패 ${path} (${res.status})`);
    return await res.text();
  }

  private async pages<T>(repo: string, path: string): Promise<T[]> {
    const all: T[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const items = await this.json<T[]>(repo, `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
      all.push(...items);
      if (items.length < 100) break;
    }
    return all;
  }

  async getPull(repo: string, pr: number): Promise<PullInfo> {
    const data = await this.json<{
      title: string;
      body: string | null;
      state: string;
      base: { ref: string };
      head: { ref: string; sha: string };
    }>(repo, `/repos/${repo}/pulls/${pr}`);
    return {
      title: data.title,
      body: data.body ?? "",
      state: data.state,
      baseRef: data.base.ref,
      headRef: data.head.ref,
      headSha: data.head.sha,
    };
  }

  async getPullFiles(repo: string, pr: number): Promise<FileInfo[]> {
    return (await this.getPullFilesPatched(repo, pr)).map(({ path, status, additions, deletions }) => ({
      path,
      status,
      additions,
      deletions,
    }));
  }

  /** 파일 목록과 파일별 patch를 한 번에 받는다. 전체 diff를 따로 받지 않아도 된다. */
  async getPullFilesPatched(repo: string, pr: number): Promise<PatchedFile[]> {
    return (await this.pages<RawFile>(repo, `/repos/${repo}/pulls/${pr}/files`)).map(toPatched);
  }

  getPullDiff(repo: string, pr: number): Promise<string> {
    return this.text(repo, `/repos/${repo}/pulls/${pr}`, "application/vnd.github.diff");
  }

  async getPullCommitShas(repo: string, pr: number): Promise<string[]> {
    const commits = await this.pages<{ sha: string }>(repo, `/repos/${repo}/pulls/${pr}/commits`);
    return commits.map((c) => c.sha.toLowerCase());
  }

  async getCommitFiles(repo: string, sha: string): Promise<FileInfo[]> {
    const data = await this.json<{ files?: { filename: string; status: string; additions: number; deletions: number }[] }>(
      repo,
      `/repos/${repo}/commits/${sha}`,
    );
    return (data.files ?? []).map((f) => ({
      path: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
    }));
  }

  async getCommitFilesPatched(repo: string, sha: string): Promise<PatchedFile[]> {
    const data = await this.json<{ files?: RawFile[] }>(repo, `/repos/${repo}/commits/${sha}`);
    return (data.files ?? []).map(toPatched);
  }

  getCommitDiff(repo: string, sha: string): Promise<string> {
    return this.text(repo, `/repos/${repo}/commits/${sha}`, "application/vnd.github.diff");
  }

  async createComment(repo: string, pr: number, body: string): Promise<{ url: string; id: number }> {
    const res = await this.call(repo, `/repos/${repo}/issues/${pr}/comments`, { method: "POST", body: { body } });
    if (res.status !== 201) throw new GitHubApiError(res.status, `코멘트 게시 실패 (${res.status})`);
    const data = (await res.json()) as { html_url: string; id: number };
    return { url: data.html_url, id: data.id };
  }

  /**
   * 이 앱이 쓴 코멘트만 수정한다. 다른 사람이나 다른 앱이 쓴 코멘트와 다른 PR의 코멘트는 403으로 거부한다.
   * 수정 대상을 먼저 읽어 작성 앱(performed_via_github_app)과 PR 번호를 확인한다.
   */
  async updateComment(repo: string, pr: number, commentId: number, body: string): Promise<{ url: string; id: number }> {
    const path = `/repos/${repo}/issues/comments/${commentId}`;
    const current = await this.json<{ performed_via_github_app?: { id?: number } | null; issue_url?: string }>(repo, path);
    const ownApp = String(current.performed_via_github_app?.id ?? "") === this.opts.appId;
    const samePr = (current.issue_url ?? "").endsWith(`/issues/${pr}`);
    if (!ownApp || !samePr) throw new GitHubApiError(403, "이 앱이 이 PR에 쓴 코멘트가 아니다");
    const res = await this.call(repo, path, { method: "PATCH", body: { body } });
    if (res.status !== 200) throw new GitHubApiError(res.status, `코멘트 수정 실패 (${res.status})`);
    const data = (await res.json()) as { html_url: string; id: number };
    return { url: data.html_url, id: data.id };
  }
}
