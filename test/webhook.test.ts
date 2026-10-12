import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";
import type { WebhookEvent, WebhookHandler } from "../src/webhook/handlers.js";
import { sign } from "../src/webhook/signature.js";

const secret = "test-secret";
const config = { logLevel: "silent", webhookSecret: secret };

function post(
  app: ReturnType<typeof buildServer>["app"],
  body: unknown,
  opts: { delivery?: string; event?: string | null; signature?: string | null } = {},
) {
  const raw = JSON.stringify(body);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.event !== null) headers["x-github-event"] = opts.event ?? "ping";
  headers["x-github-delivery"] = opts.delivery ?? "abc-123";
  if (opts.signature !== null) headers["x-hub-signature-256"] = opts.signature ?? sign(secret, raw);
  return app.inject({ method: "POST", url: "/webhook", headers, payload: raw });
}

describe("POST /webhook", () => {
  it("핸들러 완료 전에 즉시 응답하고 이후 비동기로 처리한다", async () => {
    const received: WebhookEvent[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const handler: WebhookHandler = async (e) => {
      await gate;
      received.push(e);
    };
    const { app, queue } = buildServer(config, new Map([["ping", handler]]));

    const res = await post(app, { zen: "hi" });
    expect(res.statusCode).toBe(202);
    expect(received).toHaveLength(0);

    release();
    await queue.drain();
    expect(received).toEqual([{ name: "ping", deliveryId: "abc-123", payload: { zen: "hi" } }]);
    await app.close();
  });

  it("한글 등 멀티바이트 바디도 원본 바이트 기준으로 서명 검증한다", async () => {
    const { app } = buildServer(config, new Map());
    expect((await post(app, { body: "테스트 코멘트" })).statusCode).toBe(202);
    await app.close();
  });

  it("핸들러가 없는 이벤트는 무시하고 202를 반환한다", async () => {
    const { app } = buildServer(config, new Map());
    expect((await post(app, {})).statusCode).toBe(202);
    await app.close();
  });

  it("GitHub 헤더가 없으면 400", async () => {
    const { app } = buildServer(config, new Map());
    expect((await post(app, {}, { event: null })).statusCode).toBe(400);
    await app.close();
  });

  it("핸들러가 throw해도 서버는 살아있다", async () => {
    const boom: WebhookHandler = async () => {
      throw new Error("boom");
    };
    const { app, queue } = buildServer(config, new Map([["ping", boom]]));
    expect((await post(app, {})).statusCode).toBe(202);
    await queue.drain();
    expect((await app.inject({ method: "GET", url: "/healthz" })).statusCode).toBe(200);
    await app.close();
  });
});

describe("서명 검증", () => {
  it("서명 헤더가 없으면 401이고 핸들러를 실행하지 않는다", async () => {
    let called = false;
    const { app, queue } = buildServer(config, new Map([["ping", async () => void (called = true)]]));
    expect((await post(app, {}, { signature: null })).statusCode).toBe(401);
    await queue.drain();
    expect(called).toBe(false);
    await app.close();
  });

  it("다른 secret으로 만든 서명은 401", async () => {
    const { app } = buildServer(config, new Map());
    const bad = sign("wrong-secret", JSON.stringify({}));
    expect((await post(app, {}, { signature: bad })).statusCode).toBe(401);
    await app.close();
  });

  it("바디가 변조되면 401", async () => {
    const { app } = buildServer(config, new Map());
    const sig = sign(secret, JSON.stringify({ a: 1 }));
    expect((await post(app, { a: 2 }, { signature: sig })).statusCode).toBe(401);
    await app.close();
  });

  it("형식이 잘못된 서명(접두사 없음, 길이 불일치, 비 hex)은 throw 없이 401", async () => {
    const { app } = buildServer(config, new Map());
    for (const signature of ["deadbeef", "sha256=abcd", "sha256=zzzz", "sha1=abc"]) {
      expect((await post(app, {}, { signature })).statusCode).toBe(401);
    }
    await app.close();
  });
});

describe("X-GitHub-Delivery 멱등 처리", () => {
  it("같은 delivery가 다시 오면 한 번만 처리한다", async () => {
    let count = 0;
    const { app, queue } = buildServer(config, new Map([["ping", async () => void count++]]));
    expect((await post(app, {}, { delivery: "d1" })).statusCode).toBe(202);
    await queue.drain();
    const dup = await post(app, {}, { delivery: "d1" });
    expect(dup.statusCode).toBe(200);
    await queue.drain();
    expect(count).toBe(1);
    await app.close();
  });

  it("처리 중인 delivery의 중복도 막는다", async () => {
    let count = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { app, queue } = buildServer(
      config,
      new Map([["ping", async () => { count++; await gate; }]]),
    );
    await post(app, {}, { delivery: "d1" });
    expect((await post(app, {}, { delivery: "d1" })).statusCode).toBe(200);
    release();
    await queue.drain();
    expect(count).toBe(1);
    await app.close();
  });

  it("서로 다른 delivery는 각각 처리한다", async () => {
    let count = 0;
    const { app, queue } = buildServer(config, new Map([["ping", async () => void count++]]));
    await post(app, {}, { delivery: "d1" });
    await post(app, {}, { delivery: "d2" });
    await queue.drain();
    expect(count).toBe(2);
    await app.close();
  });

  it("처리에 실패한 delivery는 재전송(Redeliver) 시 다시 처리한다", async () => {
    let count = 0;
    const flaky: WebhookHandler = async () => {
      if (++count === 1) throw new Error("first attempt fails");
    };
    const { app, queue } = buildServer(config, new Map([["ping", flaky]]));
    await post(app, {}, { delivery: "d1" });
    await queue.drain();
    expect((await post(app, {}, { delivery: "d1" })).statusCode).toBe(202);
    await queue.drain();
    expect(count).toBe(2);
    await app.close();
  });

  it("서명이 틀린 요청은 delivery를 소모하지 않는다", async () => {
    let count = 0;
    const { app, queue } = buildServer(config, new Map([["ping", async () => void count++]]));
    await post(app, {}, { delivery: "d1", signature: "sha256=00" });
    expect((await post(app, {}, { delivery: "d1" })).statusCode).toBe(202);
    await queue.drain();
    expect(count).toBe(1);
    await app.close();
  });
});
