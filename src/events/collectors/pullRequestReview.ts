import { num, obj, readActor, readAuthor, readInstallationId, readRepo, str } from "../payload.js";
import type { ReviewEvent } from "../types.js";

/** pull_request_review 이벤트. 리뷰 제출(승인, 변경 요청, 일반 코멘트), 수정, 기각. */
export function collectPullRequestReview(payload: unknown): ReviewEvent | undefined {
  const p = obj(payload);
  if (!p) return undefined;

  const review = obj(p.review);
  const action = str(p.action);
  const repo = readRepo(p);
  const prNumber = num(obj(p.pull_request)?.number);
  const reviewId = num(review?.id);
  const state = str(review?.state);
  const author = readAuthor(review?.user);
  const url = str(review?.html_url);
  if (!action || !repo || prNumber === undefined || reviewId === undefined || !state || !author || !url) {
    return undefined;
  }

  return {
    kind: "review",
    action,
    repo,
    prNumber,
    reviewId,
    state: state.toLowerCase(),
    // 본문 없이 승인만 한 리뷰는 body가 null로 온다.
    body: str(review?.body) ?? "",
    author,
    url,
    actor: readActor(p),
    installationId: readInstallationId(p),
  };
}
