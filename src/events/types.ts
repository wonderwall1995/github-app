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

/** 코멘트가 달린 위치 */
export type CommentTarget = "issue" | "pull_request" | "pull_request_review";

export interface CommentEvent {
  kind: "comment";
  target: CommentTarget;
  /** created | edited | deleted */
  action: string;
  repo: RepoRef;
  /** 이슈 번호 또는 PR 번호 */
  number: number;
  commentId: number;
  author: Author;
  body: string;
  url: string;
  installationId: number | undefined;
}

export type AppEvent = CommentEvent;
