import type { FastifyBaseLogger } from "fastify";
import type { WebhookHandler } from "../webhook/handlers.js";
import { normalizeEvent, supportedEvents } from "./index.js";

/**
 * 지원하는 GitHub 이벤트를 정규화해서 로그로 남기는 핸들러를 등록한다.
 * sink가 생기기 전까지는 GitHub에서 PR이나 코멘트를 만들어 동작을 눈으로 확인하는 용도다.
 */
export function registerEventHandlers(registry: Map<string, WebhookHandler>, log: FastifyBaseLogger): void {
  for (const name of supportedEvents) {
    registry.set(name, async ({ deliveryId, payload }) => {
      const event = normalizeEvent(name, payload);
      if (!event) {
        log.warn({ name, deliveryId }, "payload를 정규화하지 못해 무시");
        return;
      }
      // 앱이 직접 쓴 코멘트에 반응하면 무한 루프가 생길 수 있어 Bot은 무시한다.
      if (event.author.type === "Bot") {
        log.debug({ name, deliveryId, author: event.author.login }, "Bot 코멘트 무시");
        return;
      }
      log.info({ deliveryId, event }, "코멘트 이벤트 수신");
    });
  }
}
