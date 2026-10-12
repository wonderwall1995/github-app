import type { FastifyBaseLogger } from "fastify";
import type { AppEvent } from "../events/index.js";
import type { Sink, SinkMeta } from "./types.js";

/** 이벤트 하나를 등록된 모든 sink로 동시에 보낸다. */
export class SinkRouter {
  constructor(
    private readonly sinks: Sink[],
    private readonly log: FastifyBaseLogger,
  ) {}

  async dispatch(event: AppEvent, meta: SinkMeta): Promise<void> {
    const targets = this.sinks.filter((sink) => sink.accepts?.(event) ?? true);
    const results = await Promise.allSettled(targets.map((sink) => sink.send(event, meta)));

    const failures: Error[] = [];
    results.forEach((result, i) => {
      const sink = targets[i]!;
      if (result.status === "fulfilled") {
        this.log.info({ sink: sink.name, deliveryId: meta.deliveryId }, "sink 전송 완료");
      } else {
        this.log.error({ sink: sink.name, deliveryId: meta.deliveryId, err: result.reason }, "sink 전송 실패");
        failures.push(result.reason as Error);
      }
    });

    // 하나라도 실패하면 던져서 delivery를 풀어준다. GitHub에서 Redeliver하면 다시 시도할 수 있다.
    // 이미 성공한 sink에도 다시 가므로, 받는 쪽은 deliveryId로 중복을 걸러야 한다.
    if (failures.length > 0) {
      throw new AggregateError(failures, `${failures.length}개 sink 전송 실패`);
    }
  }
}
