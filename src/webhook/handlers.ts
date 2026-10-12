export interface WebhookEvent {
  /** X-GitHub-Event */
  name: string;
  /** X-GitHub-Delivery */
  deliveryId: string;
  payload: unknown;
}

export type WebhookHandler = (event: WebhookEvent) => Promise<void>;

/** 이벤트 이름별 핸들러 레지스트리. 이름이 맞는 핸들러가 없으면 "*" 핸들러가 받는다. */
export const handlers = new Map<string, WebhookHandler>();

/** webhook으로 직접 받든 Worker에서 가져오든 같은 규칙으로 핸들러를 고른다. */
export function resolveHandler(registry: Map<string, WebhookHandler>, name: string): WebhookHandler | undefined {
  return registry.get(name) ?? registry.get("*");
}
