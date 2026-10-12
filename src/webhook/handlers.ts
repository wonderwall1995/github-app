export interface WebhookEvent {
  /** X-GitHub-Event */
  name: string;
  /** X-GitHub-Delivery */
  deliveryId: string;
  payload: unknown;
}

export type WebhookHandler = (event: WebhookEvent) => Promise<void>;

/** 이벤트 이름별 핸들러 레지스트리. 이후 issue_comment, pull_request 등을 여기에 등록한다. */
export const handlers = new Map<string, WebhookHandler>();
