import type { FastifyBaseLogger } from "fastify";
import { DeliveryStore } from "../webhook/deliveries.js";
import type { WebhookEvent } from "../webhook/handlers.js";

const BATCH = 20;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

export interface WorkerPollerOptions {
  /** Worker 주소. 끝의 / 는 없어야 한다. */
  url: string;
  pullToken: string;
  intervalMs: number;
  /** 이벤트 하나를 처리한다. 던지면 그 이벤트는 ack하지 않고 다음 확인 때 다시 받는다. */
  handle: (event: WebhookEvent) => Promise<void>;
  log: FastifyBaseLogger;
  fetch?: typeof fetch;
  /** 테스트에서 대기 시간을 줄이기 위한 주입점 */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

interface PulledEvent {
  id: number;
  deliveryId: string;
  name: string;
  payload: unknown;
}

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Cloudflare Worker에 쌓인 이벤트를 주기적으로 가져와 처리한다.
 * 노트북이 Worker로 요청을 보내기만 하므로, 인터넷에서 노트북으로 들어오는 길이 없다.
 *
 * 전달은 "최소 한 번"이다. 처리에 성공한 이벤트만 ack하고, ack가 실패하면 다음에 같은 이벤트를 다시 받는다.
 * 다시 받은 이벤트가 두 번 처리되지 않도록 deliveryId로 중복을 걸러낸다.
 */
export class WorkerPoller {
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  private readonly seen = new DeliveryStore();
  private readonly abort = new AbortController();
  private loop: Promise<void> | undefined;

  constructor(private readonly opts: WorkerPollerOptions) {
    this.fetchFn = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  start(): void {
    this.loop ??= this.run();
  }

  async stop(): Promise<void> {
    this.abort.abort();
    await this.loop;
  }

  /** 한 번 확인하고 처리한 이벤트 수와 가져온 이벤트 수를 돌려준다. 테스트에서 직접 호출한다. */
  async pollOnce(): Promise<{ pulled: number; handled: number }> {
    const events = await this.pull();
    const acked: number[] = [];

    for (const event of events) {
      // 이미 처리했는데 ack만 실패했던 이벤트는 다시 처리하지 않고 ack만 한다.
      if (!this.seen.begin(event.deliveryId)) {
        acked.push(event.id);
        continue;
      }
      try {
        await this.opts.handle({ name: event.name, deliveryId: event.deliveryId, payload: event.payload });
        acked.push(event.id);
      } catch (err) {
        this.seen.fail(event.deliveryId);
        this.opts.log.error({ err, deliveryId: event.deliveryId }, "이벤트 처리 실패, 다음 확인 때 다시 시도");
      }
    }

    if (acked.length > 0) await this.ack(acked);
    return { pulled: events.length, handled: acked.length };
  }

  private async run(): Promise<void> {
    const { signal } = this.abort;
    let failures = 0;
    this.opts.log.info({ url: this.opts.url, intervalMs: this.opts.intervalMs }, "Worker 이벤트 가져오기 시작");

    while (!signal.aborted) {
      let wait = this.opts.intervalMs;
      try {
        const { pulled } = await this.pollOnce();
        failures = 0;
        // 한 번에 다 못 가져왔으면 기다리지 않고 바로 이어서 가져온다.
        if (pulled >= BATCH) wait = 0;
      } catch (err) {
        failures++;
        // Worker에 닿지 못할 때(인터넷 끊김 등)는 점점 간격을 늘려서 재시도한다.
        wait = Math.min(this.opts.intervalMs * 2 ** failures, MAX_BACKOFF_MS);
        this.opts.log.error({ err, failures, retryInMs: wait }, "Worker에서 이벤트를 가져오지 못함");
      }
      if (wait > 0) await this.sleep(wait, signal);
    }
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await this.fetchFn(`${this.opts.url}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${this.opts.pullToken}`, ...init.headers },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Worker 응답 오류: ${init.method ?? "GET"} ${path} -> HTTP ${res.status}`);
    return res;
  }

  private async pull(): Promise<PulledEvent[]> {
    const res = await this.request(`/events?limit=${BATCH}`);
    const body = (await res.json()) as { events?: PulledEvent[] };
    return body.events ?? [];
  }

  private async ack(ids: number[]): Promise<void> {
    await this.request("/events/ack", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });
  }
}
