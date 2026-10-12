import { normalizeIssueComment } from "./issueComment.js";
import { normalizeReviewComment } from "./reviewComment.js";
import type { AppEvent } from "./types.js";

export type { AppEvent, Author, CommentEvent, CommentTarget, RepoRef } from "./types.js";

/** GitHub 이벤트 이름별 정규화 함수. 새 이벤트를 지원하려면 여기에 한 줄을 추가한다. */
const normalizers: Record<string, (payload: unknown) => AppEvent | undefined> = {
  issue_comment: normalizeIssueComment,
  pull_request_review_comment: normalizeReviewComment,
};

export const supportedEvents = Object.keys(normalizers);

/** 지원하지 않는 이벤트이거나 payload가 이상하면 undefined. */
export function normalizeEvent(name: string, payload: unknown): AppEvent | undefined {
  return normalizers[name]?.(payload);
}
