import { collectCommitComment } from "./collectors/commitComment.js";
import { collectGeneric } from "./collectors/generic.js";
import { collectIssueComment } from "./collectors/issueComment.js";
import { collectIssues } from "./collectors/issues.js";
import { collectPullRequest } from "./collectors/pullRequest.js";
import { collectPullRequestReview } from "./collectors/pullRequestReview.js";
import { collectPush } from "./collectors/push.js";
import { collectReviewComment } from "./collectors/reviewComment.js";
import { collectWorkflowRun } from "./collectors/workflowRun.js";
import type { AppEvent } from "./types.js";

export type {
  AppEvent,
  Author,
  CommentEvent,
  CommentTarget,
  GenericEvent,
  IssueEvent,
  PullRequestEvent,
  PushEvent,
  RepoRef,
  ReviewEvent,
  WorkflowRunEvent,
} from "./types.js";

/** GitHub 이벤트 이름 -> 전용 수집 코드. 새 이벤트를 자세히 수집하려면 collectors/에 파일을 만들고 여기에 한 줄을 추가한다. */
const collectors = new Map<string, (payload: unknown) => AppEvent | undefined>([
  ["issue_comment", collectIssueComment],
  ["pull_request_review_comment", collectReviewComment],
  ["commit_comment", collectCommitComment],
  ["pull_request", collectPullRequest],
  ["pull_request_review", collectPullRequestReview],
  ["push", collectPush],
  ["issues", collectIssues],
  ["workflow_run", collectWorkflowRun],
]);

/** 전용 수집 코드가 있는 이벤트 이름 목록 */
export const detailedEvents = [...collectors.keys()];

/**
 * 이벤트를 앱 내부 형태로 바꾼다. 전용 코드가 없거나 payload가 기대와 다르면 generic 요약으로 수집한다.
 * payload가 객체가 아니면 undefined.
 */
export function normalizeEvent(name: string, payload: unknown): AppEvent | undefined {
  return collectors.get(name)?.(payload) ?? collectGeneric(name, payload);
}
