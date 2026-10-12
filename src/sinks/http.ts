import { sign } from "../webhook/signature.js";
import type { AppEvent } from "../events/index.js";
import type { Sink, SinkMeta } from "./types.js";

export interface HttpSinkOptions {
  name: string;
  url: string;
  /** 있으면 바디의 HMAC-SHA256을 X-Signature-256 헤더로 붙인다. 받는 쪽이 검증할 수 있다. */
  secret?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/** 이벤트를 JSON으로 URL에 POST하는 범용 sink. */
export class HttpSink implements Sink {
  readonly name: string;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly opts: HttpSinkOptions) {
    this.name = opts.name;
    this.fetchFn = opts.fetch ?? fetch;
  }

  async send(event: AppEvent, meta: SinkMeta): Promise<void> {
    const body = JSON.stringify({ deliveryId: meta.deliveryId, event });
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-github-delivery": meta.deliveryId,
    };
    if (this.opts.secret) headers["x-signature-256"] = sign(this.opts.secret, body);

    const res = await this.fetchFn(this.opts.url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(this.opts.timeoutMs ?? 5000),
    });
    if (!res.ok) {
      throw new Error(`${this.name} 전송 실패: HTTP ${res.status}`);
    }
  }
}
