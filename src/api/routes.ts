import type { FastifyInstance, FastifyReply } from "fastify";
import { GitHubApiError } from "../github/auth.js";
import type { GitHubClient } from "../github/client.js";
import { verifyHermesRequest } from "./auth.js";
import { limitDiff } from "./diff.js";

/** diff 본문 상한(문자 수). Hermes 쪽에서 한 번 더 줄인다. */
export const MAX_DIFF_CHARS = 1_000_000;
export const MAX_COMMENT_CHARS = 60_000;
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const COMMIT_PATTERN = /^[0-9a-fA-F]{7,40}$/;
const DELIVERY_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;

export interface ApiOptions {
  secret: string;
  github: GitHubClient;
  /** 비어 있으면 앱이 설치된 모든 레포를 허용한다. */
  allowedOwners?: string[];
  now?: () => number;
  maxDiffChars?: number;
}

type Body = Record<string, unknown>;

function fail(reply: FastifyReply, status: number, error: string, message: string) {
  return reply.code(status).send({ error, message });
}

function upstream(reply: FastifyReply, err: unknown) {
  if (err instanceof GitHubApiError) {
    if (err.status === 404) return fail(reply, 404, "not_found", "GitHub에서 찾을 수 없거나 앱이 설치되지 않았다");
    if (err.status === 403) return fail(reply, 403, "forbidden", "GitHub이 접근을 거부했다 (앱 권한 확인)");
    return fail(reply, 502, "github_error", `GitHub 오류 (${err.status})`);
  }
  return fail(reply, 502, "github_error", "GitHub 호출 중 오류가 났다");
}

/** Hermes가 부르는 API. 서명이 맞는 요청만 처리한다. */
export function registerApi(app: FastifyInstance, opts: ApiOptions): void {
  const now = opts.now ?? Date.now;
  const maxDiff = opts.maxDiffChars ?? MAX_DIFF_CHARS;
  const posted = new Map<string, { url: string; at: number }>();
  const inflight = new Map<string, Promise<{ url: string }>>();

  // webhook 라우트의 원본 바디 파서와 겹치지 않도록 별도 범위에서 등록한다.
  void app.register(async (scope) => {
    // 부모(webhook)가 같은 형식의 파서를 등록했으면 자식 범위에도 물려받으므로, 먼저 지우고 이 범위용으로 다시 등록한다.
    scope.removeContentTypeParser("application/json");
    scope.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
      (req as unknown as { rawBody: Buffer }).rawBody = body as Buffer;
      try {
        done(null, JSON.parse((body as Buffer).toString("utf8")));
      } catch (err) {
        (err as { statusCode?: number }).statusCode = 400;
        done(err as Error, undefined);
      }
    });

    scope.addHook("preHandler", async (req, reply) => {
      const raw = (req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0);
      const ts = req.headers["x-hermes-timestamp"];
      const sig = req.headers["x-hermes-signature"];
      const verdict = verifyHermesRequest(
        opts.secret,
        raw,
        typeof ts === "string" ? ts : undefined,
        typeof sig === "string" ? sig : undefined,
        now(),
      );
      if (verdict === "bad_signature") return fail(reply, 401, "invalid_signature", "서명이 올바르지 않다");
      if (verdict === "stale") return fail(reply, 401, "stale_request", "요청 시각이 허용 범위를 벗어났다");
    });

    const readRepo = (body: Body, reply: FastifyReply): string | undefined => {
      const repo = body.repo;
      if (typeof repo !== "string" || !REPO_PATTERN.test(repo)) {
        fail(reply, 400, "invalid_input", "repo는 owner/name 형식이어야 한다");
        return undefined;
      }
      const owner = repo.split("/")[0]!.toLowerCase();
      if (opts.allowedOwners?.length && !opts.allowedOwners.includes(owner)) {
        fail(reply, 403, "owner_not_allowed", "허용되지 않은 레포 소유자다");
        return undefined;
      }
      return repo;
    };
    const readPr = (body: Body, reply: FastifyReply): number | undefined => {
      const pr = body.pr;
      if (typeof pr !== "number" || !Number.isInteger(pr) || pr < 1 || pr > 10_000_000) {
        fail(reply, 400, "invalid_input", "pr는 양의 정수여야 한다");
        return undefined;
      }
      return pr;
    };

    scope.post("/api/pr", async (req, reply) => {
      const body = (req.body ?? {}) as Body;
      const repo = readRepo(body, reply);
      if (!repo) return reply;
      const pr = readPr(body, reply);
      if (pr === undefined) return reply;
      const commit = body.commit;
      if (commit !== undefined && commit !== null && (typeof commit !== "string" || !COMMIT_PATTERN.test(commit))) {
        return fail(reply, 400, "invalid_input", "commit은 7~40자 16진수여야 한다");
      }

      try {
        const pull = await opts.github.getPull(repo, pr);
        let sha: string | null = null;
        let files;
        let diff: string;
        if (typeof commit === "string") {
          const prefix = commit.toLowerCase();
          const shas = await opts.github.getPullCommitShas(repo, pr);
          sha = shas.find((s) => s.startsWith(prefix)) ?? null;
          if (!sha) return fail(reply, 404, "commit_not_in_pr", "이 PR에 속한 커밋이 아니다");
          [files, diff] = await Promise.all([
            opts.github.getCommitFiles(repo, sha),
            opts.github.getCommitDiff(repo, sha),
          ]);
        } else {
          [files, diff] = await Promise.all([opts.github.getPullFiles(repo, pr), opts.github.getPullDiff(repo, pr)]);
        }
        const limited = limitDiff(files, diff, maxDiff);
        return {
          repo,
          pr,
          scope: sha ? "commit" : "pr",
          commit: sha,
          title: pull.title,
          body: pull.body,
          state: pull.state,
          base_ref: pull.baseRef,
          head_ref: pull.headRef,
          head_sha: pull.headSha,
          files: limited.files.map((f) => ({
            path: f.path,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
            diff_included: f.diffIncluded,
          })),
          diff: limited.diff,
          truncated: limited.truncated,
        };
      } catch (err) {
        req.log.warn({ err, repo, pr }, "PR 조회 실패");
        return upstream(reply, err);
      }
    });

    scope.post("/api/comment", async (req, reply) => {
      const body = (req.body ?? {}) as Body;
      const repo = readRepo(body, reply);
      if (!repo) return reply;
      const pr = readPr(body, reply);
      if (pr === undefined) return reply;
      const text = body.body;
      if (typeof text !== "string" || text.trim() === "" || text.length > MAX_COMMENT_CHARS) {
        return fail(reply, 400, "invalid_input", `body는 1~${MAX_COMMENT_CHARS}자 문자열이어야 한다`);
      }
      const deliveryId = body.deliveryId;
      if (typeof deliveryId !== "string" || !DELIVERY_PATTERN.test(deliveryId)) {
        return fail(reply, 400, "invalid_input", "deliveryId 형식이 올바르지 않다");
      }

      // 같은 deliveryId는 한 번만 게시한다. 만료된 기록은 지나가며 정리한다.
      for (const [id, entry] of posted) if (now() - entry.at > DEDUPE_TTL_MS) posted.delete(id);
      const key = `${repo}#${pr}:${deliveryId}`;
      const done = posted.get(key);
      if (done) return { ok: true, url: done.url, duplicate: true };
      try {
        let pending = inflight.get(key);
        if (!pending) {
          pending = opts.github.createComment(repo, pr, text).finally(() => inflight.delete(key));
          inflight.set(key, pending);
        }
        const result = await pending;
        posted.set(key, { url: result.url, at: now() });
        return { ok: true, url: result.url, duplicate: false };
      } catch (err) {
        req.log.warn({ err, repo, pr }, "코멘트 게시 실패");
        return upstream(reply, err);
      }
    });
  });
}
