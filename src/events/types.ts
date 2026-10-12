/** GitHub payload를 앱 내부에서 쓰는 형태로 바꾼 결과. 외부 payload 구조는 이 폴더 밖으로 새지 않는다. */

export interface RepoRef {
  owner: string;
  name: string;
  fullName: string;
}

export interface Author {
  login: string;
  /** "User" | "Bot" | "Organization" 등 GitHub이 주는 값 그대로 */
  type: string;
}

/** 모든 이벤트가 공통으로 가지는 값 */
interface Common {
  /** created | edited | opened | synchronize ... GitHub이 준 동작. 동작이 없는 이벤트(push)는 "pushed" */
  action: string;
  /** 이벤트를 일으킨 사람 (payload의 sender). 알림 판정에서 Bot 여부를 볼 때 쓴다. */
  actor: Author | undefined;
  installationId: number | undefined;
}

/** 코멘트가 달린 위치 */
export type CommentTarget = "issue" | "pull_request" | "pull_request_review" | "commit";

export interface CommentEvent extends Common {
  kind: "comment";
  target: CommentTarget;
  repo: RepoRef;
  /** 이슈 번호 또는 PR 번호. 커밋 코멘트에는 없다. */
  number: number | undefined;
  /** 커밋 코멘트일 때만 있다. */
  commitSha: string | undefined;
  commentId: number;
  author: Author;
  body: string;
  url: string;
}

export interface PullRequestEvent extends Common {
  kind: "pull_request";
  repo: RepoRef;
  number: number;
  title: string;
  author: Author;
  url: string;
  draft: boolean;
  merged: boolean;
  baseRef: string;
  headRef: string;
  headSha: string;
}

export interface PushCommit {
  id: string;
  message: string;
  author: string | undefined;
}

export interface PushEvent extends Common {
  kind: "push";
  repo: RepoRef;
  /** 예: refs/heads/main */
  ref: string;
  before: string;
  after: string;
  forced: boolean;
  deleted: boolean;
  compareUrl: string | undefined;
  pusher: string | undefined;
  /** GitHub payload에 담긴 커밋(최대 20개)만 들어 있다. */
  commits: PushCommit[];
}

export interface IssueEvent extends Common {
  kind: "issue";
  repo: RepoRef;
  number: number;
  title: string;
  body: string;
  author: Author;
  url: string;
  state: string;
  labels: string[];
}

export interface ReviewEvent extends Common {
  kind: "review";
  repo: RepoRef;
  prNumber: number;
  reviewId: number;
  /** approved | changes_requested | commented | dismissed */
  state: string;
  body: string;
  author: Author;
  url: string;
}

export interface WorkflowRunEvent extends Common {
  kind: "workflow_run";
  repo: RepoRef;
  runId: number;
  name: string;
  status: string;
  /** 끝나기 전에는 없다. success | failure | cancelled 등 */
  conclusion: string | undefined;
  headSha: string;
  headBranch: string;
  url: string;
  pullRequests: number[];
}

/** 전용 수집 코드가 없는 이벤트의 요약. "일단 다 수집"을 위한 기본 형태. */
export interface GenericEvent extends Common {
  kind: "other";
  /** X-GitHub-Event 값. 예: ping, star, release */
  name: string;
  repo: RepoRef | undefined;
}

export type AppEvent =
  | CommentEvent
  | PullRequestEvent
  | PushEvent
  | IssueEvent
  | ReviewEvent
  | WorkflowRunEvent
  | GenericEvent;
