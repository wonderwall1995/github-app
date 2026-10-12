import { describe, expect, it } from "vitest";
import { createApp, MAX_BODY_BYTES, RETENTION_MS, type Env } from "../src/app.js";
import { sign } from "../src/signature.js";
import type { EventStore, NewEvent, StoredEvent } from "../src/store.js";

const SECRET = "hook-secret";
const TOKEN = "pull-token-123";
const NOW = 1_800_000_000_000;

/** 테스트용 메모리 보관소. D1과 같은 규칙(UNIQUE delivery_id, 오래된 순 조회)을 따른다. */
class MemoryStore implements EventStore {
  rows: StoredEvent[] = [];
  private nextId = 1;

  async insert(event: NewEvent): Promise<boolean> {
    if (this.rows.some((r) => r.deliveryId === event.deliveryId)) return false;
    this.rows.push({ id: this.nextId++, ...event });
    return true;
  }
  async list(limit: number): Promise<StoredEvent[]> {
    return this.rows.slice(0, limit);
  }
  async ack(ids: number[]): Promise<number> {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !ids.includes(r.id));
    return before - this.rows.length;
  }
  async purgeOlderThan(timestamp: number): Promise<number> {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => r.receivedAt >= timestamp);
    return before - this.rows.length;
  }
}

function setup(env: Partial<Env> = {}) {
  const store = new MemoryStore();
  const app = createApp(() => store, () => NOW);
  const fullEnv = { GITHUB_WEBHOOK_SECRET: SECRET, PULL_TOKEN: TOKEN, ...env } as Env;
  const request = (path: string, init?: RequestInit) => app.request(path, init, fullEnv);
  return { store, request };
}

async function postWebhook(
  request: ReturnType<typeof setup>["request"],
  body: unknown,
  opts: { delivery?: string; event?: string | null; signature?: string | null; raw?: string } = {},
) {
  const raw = opts.raw ?? JSON.stringify(body);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.event !== null) headers["x-github-event"] = opts.event ?? "issue_comment";
  headers["x-github-delivery"] = opts.delivery ?? "d-1";
  if (opts.signature !== null) headers["x-hub-signature-256"] = opts.signature ?? (await sign(SECRET, raw));
  return request("/webhook", { method: "POST", headers, body: raw });
}

const auth = { authorization: `Bearer ${TOKEN}` };

describe("POST /webhook", () => {
  it("올바른 서명이면 보관하고 202", async () => {
    const { store, request } = setup();
    const res = await postWebhook(request, { action: "created", body: "테스트" });
    expect(res.status).toBe(202);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ deliveryId: "d-1", name: "issue_comment", receivedAt: NOW });
    expect(JSON.parse(store.rows[0]!.payload)).toEqual({ action: "created", body: "테스트" });
  });

  it("서명이 없거나 틀리거나 변조되면 401이고 보관하지 않는다", async () => {
    const { store, request } = setup();
    expect((await postWebhook(request, {}, { signature: null })).status).toBe(401);
    expect((await postWebhook(request, {}, { signature: await sign("wrong", "{}") })).status).toBe(401);
    expect((await postWebhook(request, { a: 2 }, { signature: await sign(SECRET, JSON.stringify({ a: 1 })) })).status).toBe(401);
    for (const signature of ["deadbeef", "sha256=abcd", "sha256=" + "z".repeat(64), "sha1=abc"]) {
      expect((await postWebhook(request, {}, { signature })).status).toBe(401);
    }
    expect(store.rows).toHaveLength(0);
  });

  it("같은 delivery가 다시 오면 한 번만 보관하고 200", async () => {
    const { store, request } = setup();
    expect((await postWebhook(request, {}, { delivery: "x" })).status).toBe(202);
    const dup = await postWebhook(request, {}, { delivery: "x" });
    expect(dup.status).toBe(200);
    expect(await dup.json()).toMatchObject({ duplicate: true });
    expect(store.rows).toHaveLength(1);
  });

  it("서명이 틀린 요청은 delivery를 소모하지 않는다", async () => {
    const { store, request } = setup();
    await postWebhook(request, {}, { delivery: "x", signature: "sha256=" + "0".repeat(64) });
    expect((await postWebhook(request, {}, { delivery: "x" })).status).toBe(202);
    expect(store.rows).toHaveLength(1);
  });

  it("GitHub 헤더가 없으면 400", async () => {
    const { request } = setup();
    expect((await postWebhook(request, {}, { event: null })).status).toBe(400);
  });

  it("JSON이 아닌 바디는 400", async () => {
    const { request } = setup();
    expect((await postWebhook(request, null, { raw: "not json" })).status).toBe(400);
  });

  it("너무 큰 바디는 서명 검증 전에 413", async () => {
    const { store, request } = setup();
    const big = JSON.stringify({ pad: "x".repeat(MAX_BODY_BYTES) });
    expect((await postWebhook(request, null, { raw: big, signature: null })).status).toBe(413);
    expect(store.rows).toHaveLength(0);
  });
});

describe("GET /events", () => {
  it("토큰 없이는 거절한다", async () => {
    const { request } = setup();
    expect((await request("/events")).status).toBe(401);
    expect((await request("/events", { headers: { authorization: "Bearer wrong" } })).status).toBe(401);
    expect((await request("/events", { headers: { authorization: TOKEN } })).status).toBe(401);
  });

  it("서버에 토큰이 설정되지 않았으면 모두 거절한다", async () => {
    const { request } = setup({ PULL_TOKEN: "" });
    expect((await request("/events", { headers: { authorization: "Bearer " } })).status).toBe(503);
  });

  it("오래된 순서로 돌려주고 payload는 객체로 푼다", async () => {
    const { request } = setup();
    await postWebhook(request, { n: 1 }, { delivery: "a" });
    await postWebhook(request, { n: 2 }, { delivery: "b", event: "push" });
    const res = await request("/events", { headers: auth });
    expect(res.status).toBe(200);
    const { events } = (await res.json()) as { events: Array<Record<string, unknown>> };
    expect(events.map((e) => e.deliveryId)).toEqual(["a", "b"]);
    expect(events[1]).toMatchObject({ name: "push", payload: { n: 2 } });
  });

  it("limit를 지킨다 (잘못된 값은 기본값)", async () => {
    const { request } = setup();
    for (const id of ["a", "b", "c"]) await postWebhook(request, {}, { delivery: id });
    const two = (await (await request("/events?limit=2", { headers: auth })).json()) as { events: unknown[] };
    expect(two.events).toHaveLength(2);
    const bad = (await (await request("/events?limit=abc", { headers: auth })).json()) as { events: unknown[] };
    expect(bad.events).toHaveLength(3);
  });

  it("가져가기만 해서는 지워지지 않는다 (ack 전에는 다시 받는다)", async () => {
    const { request } = setup();
    await postWebhook(request, {}, { delivery: "a" });
    await request("/events", { headers: auth });
    const again = (await (await request("/events", { headers: auth })).json()) as { events: unknown[] };
    expect(again.events).toHaveLength(1);
  });
});

describe("POST /events/ack", () => {
  const ack = (request: ReturnType<typeof setup>["request"], body: unknown, headers: Record<string, string> = auth) =>
    request("/events/ack", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  it("토큰이 없으면 거절한다", async () => {
    const { request } = setup();
    expect((await ack(request, { ids: [1] }, {})).status).toBe(401);
  });

  it("가져간 이벤트를 지운다", async () => {
    const { store, request } = setup();
    await postWebhook(request, {}, { delivery: "a" });
    await postWebhook(request, {}, { delivery: "b" });
    const res = await ack(request, { ids: [1] });
    expect(await res.json()).toEqual({ acked: 1 });
    expect(store.rows.map((r) => r.deliveryId)).toEqual(["b"]);
  });

  it("잘못된 입력은 400", async () => {
    const { request } = setup();
    expect((await ack(request, { ids: "1" })).status).toBe(400);
    expect((await ack(request, { ids: [1.5] })).status).toBe(400);
    expect((await ack(request, { ids: ["1"] })).status).toBe(400);
    expect((await ack(request, { ids: Array.from({ length: 101 }, (_, i) => i) })).status).toBe(400);
    const notJson = await request("/events/ack", { method: "POST", headers: auth, body: "nope" });
    expect(notJson.status).toBe(400);
  });

  it("확인할 때 보관 기간이 지난 이벤트도 정리한다", async () => {
    const { store, request } = setup();
    store.rows.push({ id: 99, deliveryId: "old", name: "x", payload: "{}", receivedAt: NOW - RETENTION_MS - 1 });
    await ack(request, { ids: [] });
    expect(store.rows).toHaveLength(0);
  });

  it("지운 delivery를 GitHub이 Redeliver하면 다시 받는다", async () => {
    const { store, request } = setup();
    await postWebhook(request, {}, { delivery: "a" });
    await ack(request, { ids: [1] });
    expect((await postWebhook(request, {}, { delivery: "a" })).status).toBe(202);
    expect(store.rows).toHaveLength(1);
  });
});

describe("GET /healthz", () => {
  it("인증 없이 응답한다", async () => {
    const { request } = setup();
    expect((await request("/healthz")).status).toBe(200);
  });
});
