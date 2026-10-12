/**
 * webhook: GitHub이 이 서버로 직접 webhook을 보낸다 (공개 URL 필요).
 * worker:  Cloudflare Worker가 webhook을 대신 받아 두고, 이 서버가 주기적으로 가져간다 (공개 URL 불필요).
 */
export type EventSource = "webhook" | "worker";

export interface Config {
  port: number;
  host: string;
  logLevel: string;
  eventSource: EventSource;
  /** eventSource=webhook일 때만 있다. */
  webhookSecret: string | undefined;
  /** eventSource=worker일 때만 있다. */
  worker: { url: string; pullToken: string; pollIntervalMs: number } | undefined;
  appId: string;
  privateKeyPath: string;
  /** 범용 HTTP sink. URL이 없으면 sink 없이 로그만 남긴다. */
  httpSinkUrl: string | undefined;
  httpSinkSecret: string | undefined;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is required (.env 참고)`);
  return value;
}

/** 빈 문자열은 "설정 안 함"으로 취급한다. */
function optional(env: NodeJS.ProcessEnv, name: string): string | undefined {
  return env[name] || undefined;
}

function parseEventSource(value: string | undefined): EventSource {
  if (value === undefined || value === "") return "webhook";
  if (value === "webhook" || value === "worker") return value;
  throw new Error(`EVENT_SOURCE must be "webhook" or "worker" (got "${value}")`);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const eventSource = parseEventSource(env.EVENT_SOURCE);

  const pollIntervalMs = Number(env.WORKER_POLL_INTERVAL_MS ?? 20_000);
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 1000) {
    throw new Error("WORKER_POLL_INTERVAL_MS must be a number of at least 1000");
  }

  return {
    port: Number(env.PORT ?? 3200),
    host: env.HOST ?? "127.0.0.1",
    logLevel: env.LOG_LEVEL ?? "info",
    eventSource,
    webhookSecret: eventSource === "webhook" ? required(env, "GITHUB_WEBHOOK_SECRET") : undefined,
    worker:
      eventSource === "worker"
        ? {
            url: required(env, "WORKER_URL").replace(/\/+$/, ""),
            pullToken: required(env, "WORKER_PULL_TOKEN"),
            pollIntervalMs,
          }
        : undefined,
    appId: required(env, "GITHUB_APP_ID"),
    privateKeyPath: required(env, "GITHUB_APP_PRIVATE_KEY_PATH"),
    httpSinkUrl: optional(env, "HTTP_SINK_URL"),
    httpSinkSecret: optional(env, "HTTP_SINK_SECRET"),
  };
}
