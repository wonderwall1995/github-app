import { num, obj, readActor, readAuthor, readInstallationId, readRepo, str } from "../payload.js";
import type { CommentEvent } from "../types.js";

/** commit_comment 이벤트. 커밋 페이지에 직접 다는 코멘트. 이슈/PR 번호가 없고 커밋 SHA가 있다. */
export function collectCommitComment(payload: unknown): CommentEvent | undefined {
  const p = obj(payload);
  if (!p) return undefined;

  const comment = obj(p.comment);
  const action = str(p.action);
  const repo = readRepo(p);
  const commentId = num(comment?.id);
  const author = readAuthor(comment?.user);
  const body = str(comment?.body);
  const url = str(comment?.html_url);
  const commitSha = str(comment?.commit_id);
  if (!action || !repo || commentId === undefined || !author || body === undefined || !url || !commitSha) {
    return undefined;
  }

  return {
    kind: "comment",
    target: "commit",
    action,
    repo,
    number: undefined,
    commitSha,
    commentId,
    author,
    body,
    url,
    actor: readActor(p),
    installationId: readInstallationId(p),
  };
}
