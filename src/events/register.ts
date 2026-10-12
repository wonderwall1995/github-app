import type { FastifyBaseLogger } from "fastify";
import type { SinkRouter } from "../sinks/router.js";
import type { WebhookHandler } from "../webhook/handlers.js";
import { normalizeEvent } from "./index.js";
import { ruleKeys, shouldNotify } from "./policy.js";

/**
 * 모든 GitHub 이벤트를 받는 핸들러를 등록한다. 흐름은 세 단계다.
 *   1. 수집: 정규화해서 기록한다 (지금은 로그).
 *   2. 판정: policy.ts 규칙으로 알림 여부를 정한다.
 *   3. 전달: 알림 대상이면 sink로 보낸다.
 */
export function registerEventHandlers(
  registry: Map<string, WebhookHandler>,
  log: FastifyBaseLogger,
  router: SinkRouter,
): void {
  // "*"는 이름이 맞는 전용 핸들러가 없을 때 쓰는 기본 핸들러다 (webhook/route.ts 참고).
  registry.set("*", async ({ name, deliveryId, payload }) => {
    const event = normalizeEvent(name, payload);
    if (!event) {
      log.warn({ name, deliveryId }, "payload가 객체가 아니라 무시");
      return;
    }

    log.info({ deliveryId, event }, "이벤트 수집");

    if (!shouldNotify(event)) {
      log.debug({ deliveryId, rule: ruleKeys(event)[0] }, "수집만 하고 알림은 보내지 않음");
      return;
    }
    await router.dispatch(event, { deliveryId });
  });
}
