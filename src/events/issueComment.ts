import { num, obj, readAuthor, readInstallationId, readRepo, str } from "./payload.js";
import type { CommentEvent } from "./types.js";

/**
 * issue_comment 이벤트. 이슈 코멘트와 PR 대화 코멘트가 모두 이 이벤트로 온다.
 * issue.pull_request 필드가 있으면 PR 코멘트다.
 */
export function normalizeIssueComment(payload: unknown): CommentEvent | undefined {
  const p = obj(payload);
  if (!p) return undefined;

  const issue = obj(p.issue);
  const comment = obj(p.comment);
  const action = str(p.action);
  const repo = readRepo(p);
  const number = num(issue?.number);
  const commentId = num(comment?.id);
  const author = readAuthor(comment?.user);
  const body = str(comment?.body);
  const url = str(comment?.html_url);
  if (!action || !repo || number === undefined || commentId === undefined || !author || body === undefined || !url) {
    return undefined;
  }

  return {
    kind: "comment",
    target: issue?.pull_request ? "pull_request" : "issue",
    action,
    repo,
    number,
    commentId,
    author,
    body,
    url,
    installationId: readInstallationId(p),
  };
}
