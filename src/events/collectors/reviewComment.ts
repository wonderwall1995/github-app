import { num, obj, readActor, readAuthor, readInstallationId, readRepo, str } from "../payload.js";
import type { CommentEvent } from "../types.js";

/** pull_request_review_comment 이벤트. PR diff의 특정 줄에 다는 리뷰 코멘트. */
export function collectReviewComment(payload: unknown): CommentEvent | undefined {
  const p = obj(payload);
  if (!p) return undefined;

  const comment = obj(p.comment);
  const action = str(p.action);
  const repo = readRepo(p);
  const number = num(obj(p.pull_request)?.number);
  const commentId = num(comment?.id);
  const author = readAuthor(comment?.user);
  const body = str(comment?.body);
  const url = str(comment?.html_url);
  if (!action || !repo || number === undefined || commentId === undefined || !author || body === undefined || !url) {
    return undefined;
  }

  return {
    kind: "comment",
    target: "pull_request_review",
    action,
    repo,
    number,
    commitSha: undefined,
    commentId,
    author,
    body,
    url,
    actor: readActor(p),
    installationId: readInstallationId(p),
  };
}
