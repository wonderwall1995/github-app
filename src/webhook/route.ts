import type { FastifyInstance } from "fastify";
import type { JobQueue } from "../queue.js";
import { DeliveryStore } from "./deliveries.js";
import type { WebhookHandler } from "./handlers.js";
import { verifySignature } from "./signature.js";

declare module "fastify" {
  interface FastifyRequest {
    /** 서명 검증(X-Hub-Signature-256)용 원본 바디 */
    rawBody?: Buffer;
  }
}

export interface WebhookOptions {
  secret: string;
  queue: JobQueue;
  handlers: Map<string, WebhookHandler>;
  deliveries?: DeliveryStore;
}

export function registerWebhook(app: FastifyInstance, opts: WebhookOptions): void {
  const { secret, queue, handlers, deliveries = new DeliveryStore() } = opts;

  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
    req.rawBody = body as Buffer;
    try {
      done(null, JSON.parse((body as Buffer).toString("utf8")));
    } catch (err) {
      (err as { statusCode?: number }).statusCode = 400;
      done(err as Error, undefined);
    }
  });

  app.post("/webhook", async (req, reply) => {
    const signature = req.headers["x-hub-signature-256"];
    if (!req.rawBody || !verifySignature(secret, req.rawBody, typeof signature === "string" ? signature : undefined)) {
      return reply.code(401).send({ error: "invalid signature" });
    }

    const name = req.headers["x-github-event"];
    const deliveryId = req.headers["x-github-delivery"];
    if (typeof name !== "string" || typeof deliveryId !== "string") {
      return reply.code(400).send({ error: "missing github headers" });
    }

    if (!deliveries.begin(deliveryId)) {
      req.log.info({ name, deliveryId }, "duplicate delivery, ignored");
      return reply.code(200).send({ ok: true, duplicate: true });
    }

    const handler = handlers.get(name);
    if (handler) {
      queue.enqueue(async () => {
        try {
          await handler({ name, deliveryId, payload: req.body });
        } catch (err) {
          deliveries.fail(deliveryId);
          throw err;
        }
      });
    } else {
      req.log.info({ name, deliveryId, action: (req.body as { action?: unknown } | null)?.action }, "처리기 없는 이벤트 수신, 무시");
    }

    // 처리는 큐에서 비동기로. GitHub에는 즉시 응답한다.
    return reply.code(202).send({ ok: true });
  });
}
