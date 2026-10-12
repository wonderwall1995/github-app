import { Hono } from "hono";
import { safeEqual, verifySignature } from "./signature.js";
import { D1EventStore, type EventStore } from "./store.js";

export interface Env {
  DB: D1Database;
  /** GitHub App 설정의 Webhook secret */
  GITHUB_WEBHOOK_SECRET: string;
  /** 노트북이 이벤트를 가져갈 때 내는 토큰 */
  PULL_TOKEN: string;
}

/** webhook 바디 최대 크기. 넘으면 서명 검증 전에 거절한다. */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
/** 노트북이 가져가지 않은 이벤트를 보관하는 기간 */
export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PULL = 100;
const DEFAULT_PULL = 20;

type StoreFactory = (env: Env) => EventStore;

/** 문지기: GitHub webhook을 받아 검증하고 보관하고, 노트북이 인증 후 가져가게 한다. */
export function createApp(makeStore: StoreFactory = (env) => new D1EventStore(env.DB), now: () => number = Date.now) {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/healthz", (c) => c.json({ status: "ok" }));

  app.post("/webhook", async (c) => {
    const declared = Number(c.req.header("content-length") ?? 0);
    if (declared > MAX_BODY_BYTES) return c.json({ error: "payload too large" }, 413);

    const body = await c.req.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) return c.json({ error: "payload too large" }, 413);

    if (!(await verifySignature(c.env.GITHUB_WEBHOOK_SECRET, body, c.req.header("x-hub-signature-256") ?? null))) {
      return c.json({ error: "invalid signature" }, 401);
    }

    const name = c.req.header("x-github-event");
    const deliveryId = c.req.header("x-github-delivery");
    if (!name || !deliveryId) return c.json({ error: "missing github headers" }, 400);

    const payload = new TextDecoder().decode(body);
    try {
      JSON.parse(payload);
    } catch {
      return c.json({ error: "invalid json" }, 400);
    }

    const inserted = await makeStore(c.env).insert({ deliveryId, name, payload, receivedAt: now() });
    return c.json({ ok: true, duplicate: !inserted }, inserted ? 202 : 200);
  });

  // 아래 두 경로는 노트북만 쓴다. 토큰이 없거나 틀리면 거절한다.
  app.use("/events/*", requirePullToken);
  app.use("/events", requirePullToken);

  app.get("/events", async (c) => {
    const requested = Number(c.req.query("limit") ?? DEFAULT_PULL);
    const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), MAX_PULL) : DEFAULT_PULL;
    const events = await makeStore(c.env).list(limit);
    return c.json({
      events: events.map((e) => ({
        id: e.id,
        deliveryId: e.deliveryId,
        name: e.name,
        receivedAt: e.receivedAt,
        payload: JSON.parse(e.payload) as unknown,
      })),
    });
  });

  app.post("/events/ack", async (c) => {
    const body = (await c.req.json().catch(() => undefined)) as { ids?: unknown } | undefined;
    const ids = body?.ids;
    if (!Array.isArray(ids) || ids.length > MAX_PULL || !ids.every((id) => Number.isInteger(id))) {
      return c.json({ error: "ids must be an array of integers (max 100)" }, 400);
    }
    const store = makeStore(c.env);
    const acked = await store.ack(ids as number[]);
    // 노트북이 오래 꺼져 있었을 때 쌓인 이벤트가 무한히 남지 않게, 확인할 때 오래된 것도 정리한다.
    await store.purgeOlderThan(now() - RETENTION_MS);
    return c.json({ acked });
  });

  return app;
}

async function requirePullToken(
  c: import("hono").Context<{ Bindings: Env }>,
  next: import("hono").Next,
): Promise<Response | void> {
  const expected = c.env.PULL_TOKEN;
  // 토큰이 설정되지 않은 배포는 모두 거절한다 (실수로 열어두지 않기 위해).
  if (!expected) return c.json({ error: "pull token not configured" }, 503);

  const header = c.req.header("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!(await safeEqual(given, expected))) return c.json({ error: "unauthorized" }, 401);
  await next();
}
