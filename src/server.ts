import Fastify, { type FastifyInstance } from "fastify";
import type { Config } from "./config.js";
import { JobQueue } from "./queue.js";
import { handlers as defaultHandlers, type WebhookHandler } from "./webhook/handlers.js";
import { registerWebhook } from "./webhook/route.js";

export interface BuiltServer {
  app: FastifyInstance;
  queue: JobQueue;
}

export function buildServer(
  config: Pick<Config, "logLevel" | "webhookSecret">,
  handlers: Map<string, WebhookHandler> = defaultHandlers,
): BuiltServer {
  const app = Fastify({
    logger:
      config.logLevel === "silent"
        ? false
        : { level: config.logLevel, transport: { target: "pino-pretty" } },
  });

  const queue = new JobQueue((err) => app.log.error({ err }, "webhook job failed"));

  app.get("/healthz", async () => ({ status: "ok", queued: queue.size }));
  registerWebhook(app, { secret: config.webhookSecret, queue, handlers });

  return { app, queue };
}
