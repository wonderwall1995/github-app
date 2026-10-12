import { bool, num, obj, readActor, readAuthor, readInstallationId, readRepo, str } from "../payload.js";
import type { PullRequestEvent } from "../types.js";

/**
 * pull_request 이벤트. opened(생성), synchronize(커밋 추가), closed(닫힘/머지), ready_for_review 등.
 * 커밋이 추가되면 headSha가 바뀐다.
 */
export function collectPullRequest(payload: unknown): PullRequestEvent | undefined {
  const p = obj(payload);
  if (!p) return undefined;

  const pr = obj(p.pull_request);
  const action = str(p.action);
  const repo = readRepo(p);
  const number = num(pr?.number);
  const title = str(pr?.title);
  const author = readAuthor(pr?.user);
  const url = str(pr?.html_url);
  const baseRef = str(obj(pr?.base)?.ref);
  const headRef = str(obj(pr?.head)?.ref);
  const headSha = str(obj(pr?.head)?.sha);
  if (!action || !repo || number === undefined || title === undefined || !author || !url || !baseRef || !headRef || !headSha) {
    return undefined;
  }

  return {
    kind: "pull_request",
    action,
    repo,
    number,
    title,
    author,
    url,
    draft: bool(pr?.draft) ?? false,
    merged: bool(pr?.merged) ?? false,
    baseRef,
    headRef,
    headSha,
    actor: readActor(p),
    installationId: readInstallationId(p),
  };
}
