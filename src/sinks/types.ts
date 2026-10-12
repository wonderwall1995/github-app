import type { AppEvent } from "../events/index.js";

export interface SinkMeta {
  /** GitHub이 준 X-GitHub-Delivery. 받는 쪽에서 중복 제거에 쓸 수 있다. */
  deliveryId: string;
}

/** 이벤트를 내보내는 목적지. Hermes, Slack, Jenkins 등은 모두 이 인터페이스를 구현한다. */
export interface Sink {
  name: string;
  /** 생략하면 모든 이벤트를 받는다. 특정 이벤트만 보내고 싶을 때 쓴다. */
  accepts?(event: AppEvent): boolean;
  send(event: AppEvent, meta: SinkMeta): Promise<void>;
}
