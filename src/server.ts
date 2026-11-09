import Fastify, { type FastifyInstance } from "fastify";
import type { Config } from "./config.js";
import { JobQueue } from "./queue.js";
import { registerApi } from "./api/routes.js";
import type { GitHubClient } from "./github/client.js";
import { handlers as defaultHandlers, type WebhookHandler } from "./webhook/handlers.js";
import { registerWebhook } from "./webhook/route.js";

export interface BuiltServer {
  app: FastifyInstance;
  queue: JobQueue;
}

export function buildServer(
  config: Pick<Config, "logLevel" | "webhookSecret"> & Partial<Pick<Config, "hermesApiSecret" | "apiAllowedOwners">>,
  handlers: Map<string, WebhookHandler> = defaultHandlers,
  github?: GitHubClient,
): BuiltServer {
  const app = Fastify({
    logger:
      config.logLevel === "silent"
        ? false
        : { level: config.logLevel, transport: { target: "pino-pretty" } },
  });

  const queue = new JobQueue((err) => app.log.error({ err }, "webhook job failed"));

  app.get("/healthz", async () => ({ status: "ok", queued: queue.size }));
  // Worker에서 가져오는 방식(secret 없음)에서는 이 서버가 webhook을 직접 받지 않는다.
  if (config.webhookSecret) {
    registerWebhook(app, { secret: config.webhookSecret, queue, handlers });
  }

  // Hermes API는 키와 GitHub 클라이언트가 모두 있을 때만 연다.
  if (config.hermesApiSecret && github) {
    registerApi(app, { secret: config.hermesApiSecret, github, allowedOwners: config.apiAllowedOwners });
  }

  return { app, queue };
}
