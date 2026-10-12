import type { FastifyBaseLogger } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { WorkerPoller } from "../src/source/workerPoller.js";
import type { WebhookEvent } from "../src/webhook/handlers.js";

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as FastifyBaseLogger;

interface Pulled {
  id: number;
  deliveryId: string;
  name: string;
  payload: unknown;
}

/** Worker를 흉내 내는 fetch. ack 요청이 오면 해당 이벤트를 지운다. */
function fakeWorker(initial: Pulled[], opts: { failAck?: boolean; failPull?: boolean } = {}) {
  const queue = [...initial];
  const calls: Array<{ method: string; path: string; auth: string | null }> = [];
  const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    calls.push({ method: init?.method ?? "GET", path: url.pathname + url.search, auth: headers.get("authorization") });

    if (url.pathname === "/events" && (init?.method ?? "GET") === "GET") {
      if (opts.failPull) return new Response("down", { status: 503 });
      const limit = Number(url.searchParams.get("limit"));
      return Response.json({ events: queue.slice(0, limit) });
    }
    if (url.pathname === "/events/ack" && init?.method === "POST") {
      if (opts.failAck) return new Response("down", { status: 500 });
      const { ids } = JSON.parse(init.body as string) as { ids: number[] };
      for (const id of ids) {
        const i = queue.findIndex((e) => e.id === id);
        if (i >= 0) queue.splice(i, 1);
      }
      return Response.json({ acked: ids.length });
    }
    return new Response("not found", { status: 404 });
  });
  return { queue, calls, fetchFn: fetchFn as unknown as typeof fetch };
}

const ev = (id: number, name = "issue_comment"): Pulled => ({
  id,
  deliveryId: `d-${id}`,
  name,
  payload: { n: id },
});

function makePoller(worker: ReturnType<typeof fakeWorker>, handle: (e: WebhookEvent) => Promise<void>) {
  return new WorkerPoller({
    url: "https://gate.test",
    pullToken: "tok",
    intervalMs: 20_000,
    handle,
    log,
    fetch: worker.fetchFn,
    sleep: async () => {},
  });
}

describe("WorkerPoller.pollOnce", () => {
  it("가져온 이벤트를 처리하고 ack한다", async () => {
    const worker = fakeWorker([ev(1), ev(2)]);
    const handled: WebhookEvent[] = [];
    const result = await makePoller(worker, async (e) => void handled.push(e)).pollOnce();

    expect(result).toEqual({ pulled: 2, handled: 2 });
    expect(handled).toEqual([
      { name: "issue_comment", deliveryId: "d-1", payload: { n: 1 } },
      { name: "issue_comment", deliveryId: "d-2", payload: { n: 2 } },
    ]);
    expect(worker.queue).toHaveLength(0);
  });

  it("모든 요청에 Bearer 토큰을 붙인다", async () => {
    const worker = fakeWorker([ev(1)]);
    await makePoller(worker, async () => {}).pollOnce();
    expect(worker.calls.every((c) => c.auth === "Bearer tok")).toBe(true);
    expect(worker.calls.map((c) => c.method + " " + c.path)).toEqual(["GET /events?limit=20", "POST /events/ack"]);
  });

  it("이벤트가 없으면 ack 요청을 보내지 않는다", async () => {
    const worker = fakeWorker([]);
    expect(await makePoller(worker, async () => {}).pollOnce()).toEqual({ pulled: 0, handled: 0 });
    expect(worker.calls).toHaveLength(1);
  });

  it("처리에 실패한 이벤트는 ack하지 않고 다음에 다시 시도한다", async () => {
    const worker = fakeWorker([ev(1), ev(2)]);
    let attempts = 0;
    const poller = makePoller(worker, async (e) => {
      if (e.deliveryId === "d-1" && ++attempts === 1) throw new Error("sink down");
    });

    expect(await poller.pollOnce()).toEqual({ pulled: 2, handled: 1 });
    expect(worker.queue.map((e) => e.id)).toEqual([1]);

    expect(await poller.pollOnce()).toEqual({ pulled: 1, handled: 1 });
    expect(attempts).toBe(2);
    expect(worker.queue).toHaveLength(0);
  });

  it("ack가 실패해서 다시 받은 이벤트는 재처리하지 않고 ack만 한다", async () => {
    const worker = fakeWorker([ev(1)], { failAck: true });
    let count = 0;
    const poller = makePoller(worker, async () => void count++);

    await expect(poller.pollOnce()).rejects.toThrow(/ack|HTTP 500/);
    expect(worker.queue).toHaveLength(1);

    const retry = fakeWorker([ev(1)]);
    // 같은 poller 인스턴스(= 같은 프로세스)가 같은 이벤트를 다시 받는 상황
    (poller as unknown as { fetchFn: typeof fetch }).fetchFn = retry.fetchFn;
    expect(await poller.pollOnce()).toEqual({ pulled: 1, handled: 1 });
    expect(count).toBe(1);
    expect(retry.queue).toHaveLength(0);
  });

  it("Worker가 오류를 주면 던진다", async () => {
    const worker = fakeWorker([], { failPull: true });
    await expect(makePoller(worker, async () => {}).pollOnce()).rejects.toThrow(/HTTP 503/);
  });
});

describe("WorkerPoller 반복 실행", () => {
  it("start 후 stop하면 루프가 끝난다", async () => {
    const worker = fakeWorker([ev(1)]);
    const handled: string[] = [];
    const poller = new WorkerPoller({
      url: "https://gate.test",
      pullToken: "tok",
      intervalMs: 20_000,
      handle: async (e) => void handled.push(e.deliveryId),
      log,
      fetch: worker.fetchFn,
      // 첫 대기에서 멈춰 둔다 (stop의 abort로 풀린다)
      sleep: (_ms, signal) => new Promise((resolve) => signal.addEventListener("abort", () => resolve())),
    });
    poller.start();
    await vi.waitFor(() => expect(handled).toEqual(["d-1"]));
    await poller.stop();
    expect(worker.queue).toHaveLength(0);
  });

  it("실패하면 점점 간격을 늘려서 재시도한다", async () => {
    const worker = fakeWorker([], { failPull: true });
    const waits: number[] = [];
    let poller!: WorkerPoller;
    poller = new WorkerPoller({
      url: "https://gate.test",
      pullToken: "tok",
      intervalMs: 20_000,
      handle: async () => {},
      log,
      fetch: worker.fetchFn,
      sleep: async (ms) => {
        waits.push(ms);
        if (waits.length === 4) void poller.stop();
      },
    });
    poller.start();
    await vi.waitFor(() => expect(waits.length).toBeGreaterThanOrEqual(4));
    await poller.stop();
    expect(waits.slice(0, 4)).toEqual([40_000, 80_000, 160_000, 300_000]);
  });
});

describe("loadConfig 수신 방식", () => {
  const base = { GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY_PATH: "k.pem" };

  it("기본은 webhook이고 secret이 필요하다", () => {
    expect(() => loadConfig({ ...base })).toThrow(/GITHUB_WEBHOOK_SECRET/);
    const c = loadConfig({ ...base, GITHUB_WEBHOOK_SECRET: "s" });
    expect(c).toMatchObject({ eventSource: "webhook", webhookSecret: "s", worker: undefined });
  });

  it("worker 방식은 webhook secret 없이 Worker 주소와 토큰이 필요하다", () => {
    expect(() => loadConfig({ ...base, EVENT_SOURCE: "worker" })).toThrow(/WORKER_URL/);
    expect(() => loadConfig({ ...base, EVENT_SOURCE: "worker", WORKER_URL: "https://g.test" })).toThrow(
      /WORKER_PULL_TOKEN/,
    );
    const c = loadConfig({
      ...base,
      EVENT_SOURCE: "worker",
      WORKER_URL: "https://g.test///",
      WORKER_PULL_TOKEN: "t",
    });
    expect(c.webhookSecret).toBeUndefined();
    expect(c.worker).toEqual({ url: "https://g.test", pullToken: "t", pollIntervalMs: 20_000 });
  });

  it("알 수 없는 수신 방식과 너무 짧은 확인 간격은 거절한다", () => {
    expect(() => loadConfig({ ...base, EVENT_SOURCE: "carrier-pigeon" })).toThrow(/EVENT_SOURCE/);
    expect(() =>
      loadConfig({ ...base, EVENT_SOURCE: "worker", WORKER_URL: "u", WORKER_PULL_TOKEN: "t", WORKER_POLL_INTERVAL_MS: "10" }),
    ).toThrow(/WORKER_POLL_INTERVAL_MS/);
  });
});
