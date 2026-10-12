import type { FastifyBaseLogger } from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { AppEvent } from "../src/events/index.js";
import { registerEventHandlers } from "../src/events/register.js";
import { HttpSink } from "../src/sinks/http.js";
import { SinkRouter } from "../src/sinks/router.js";
import type { Sink } from "../src/sinks/types.js";
import { sign } from "../src/webhook/signature.js";
import type { WebhookHandler } from "../src/webhook/handlers.js";

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as FastifyBaseLogger;

const event: AppEvent = {
  kind: "comment",
  target: "issue",
  action: "created",
  repo: { owner: "me", name: "demo", fullName: "me/demo" },
  number: 1,
  commitSha: undefined,
  actor: undefined,
  commentId: 2,
  author: { login: "me", type: "User" },
  body: "테스트",
  url: "https://example.test/c",
  installationId: 9,
};
const meta = { deliveryId: "d-1" };

function fakeSink(name: string, impl: Sink["send"] = async () => {}, accepts?: Sink["accepts"]): Sink & { send: ReturnType<typeof vi.fn> } {
  return { name, accepts, send: vi.fn(impl) } as Sink & { send: ReturnType<typeof vi.fn> };
}

describe("HttpSink", () => {
  it("이벤트를 JSON으로 POST한다", async () => {
    const fetchFn = vi.fn(async () => new Response("ok", { status: 200 }));
    const sink = new HttpSink({ name: "http", url: "http://localhost:9999/in", fetch: fetchFn as unknown as typeof fetch });
    await sink.send(event, meta);

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:9999/in");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ deliveryId: "d-1", event });
    const headers = init.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["x-github-delivery"]).toBe("d-1");
    expect(headers["x-signature-256"]).toBeUndefined();
  });

  it("secret이 있으면 바디 서명 헤더를 붙인다", async () => {
    const fetchFn = vi.fn(async () => new Response("ok"));
    const sink = new HttpSink({ name: "http", url: "http://x", secret: "s3", fetch: fetchFn as unknown as typeof fetch });
    await sink.send(event, meta);

    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["x-signature-256"]).toBe(sign("s3", init.body as string));
  });

  it("2xx가 아니면 에러를 던진다", async () => {
    const fetchFn = vi.fn(async () => new Response("bad", { status: 500 }));
    const sink = new HttpSink({ name: "hermes", url: "http://x", fetch: fetchFn as unknown as typeof fetch });
    await expect(sink.send(event, meta)).rejects.toThrow(/hermes.*500/);
  });
});

describe("SinkRouter", () => {
  it("모든 sink로 보낸다", async () => {
    const a = fakeSink("a");
    const b = fakeSink("b");
    await new SinkRouter([a, b], log).dispatch(event, meta);
    expect(a.send).toHaveBeenCalledWith(event, meta);
    expect(b.send).toHaveBeenCalledWith(event, meta);
  });

  it("accepts가 false인 sink는 건너뛴다", async () => {
    const a = fakeSink("a", async () => {}, () => false);
    const b = fakeSink("b");
    await new SinkRouter([a, b], log).dispatch(event, meta);
    expect(a.send).not.toHaveBeenCalled();
    expect(b.send).toHaveBeenCalled();
  });

  it("sink가 없어도 에러 없이 끝난다", async () => {
    await expect(new SinkRouter([], log).dispatch(event, meta)).resolves.toBeUndefined();
  });

  it("하나가 실패해도 나머지는 전송하고, 마지막에 에러를 던진다", async () => {
    const bad = fakeSink("bad", async () => {
      throw new Error("down");
    });
    const good = fakeSink("good");
    await expect(new SinkRouter([bad, good], log).dispatch(event, meta)).rejects.toBeInstanceOf(AggregateError);
    expect(good.send).toHaveBeenCalled();
  });
});

describe("registerEventHandlers", () => {
  function setup() {
    const sink = fakeSink("s");
    const registry = new Map<string, WebhookHandler>();
    registerEventHandlers(registry, log, new SinkRouter([sink], log));
    return { sink, registry };
  }
  const payload = (userType: string) => ({
    action: "created",
    issue: { number: 1 },
    comment: { id: 2, body: "hi", html_url: "https://x", user: { login: "u", type: userType } },
    repository: { name: "demo", full_name: "me/demo", owner: { login: "me" } },
  });

  const run = (registry: Map<string, WebhookHandler>, name: string, body: unknown) =>
    registry.get("*")!({ name, deliveryId: "d1", payload: body });

  it("사용자 코멘트는 sink로 보낸다", async () => {
    const { sink, registry } = setup();
    await run(registry, "issue_comment", payload("User"));
    expect(sink.send).toHaveBeenCalledTimes(1);
  });

  it("Bot 코멘트는 수집만 하고 sink로 보내지 않는다", async () => {
    const { sink, registry } = setup();
    await run(registry, "issue_comment", payload("Bot"));
    expect(sink.send).not.toHaveBeenCalled();
  });

  it("전용 코드가 없는 이벤트도 수집해서 sink로 보낸다", async () => {
    const { sink, registry } = setup();
    await run(registry, "star", { action: "created", repository: payload("User").repository });
    expect(sink.send).toHaveBeenCalledTimes(1);
    expect(sink.send.mock.calls[0]![0]).toMatchObject({ kind: "other", name: "star" });
  });

  it("알림 규칙이 꺼진 이벤트(ping)는 수집만 한다", async () => {
    const { sink, registry } = setup();
    await run(registry, "ping", { zen: "hi" });
    expect(sink.send).not.toHaveBeenCalled();
  });

  it("객체가 아닌 payload는 보내지 않는다", async () => {
    const { sink, registry } = setup();
    await run(registry, "issue_comment", null);
    expect(sink.send).not.toHaveBeenCalled();
  });
});
