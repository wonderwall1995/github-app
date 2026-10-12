import { loadConfig } from "./config.js";
import { loadPrivateKey } from "./github/auth.js";
import { registerEventHandlers } from "./events/register.js";
import { buildServer } from "./server.js";
import { HttpSink } from "./sinks/http.js";
import { SinkRouter } from "./sinks/router.js";
import type { Sink } from "./sinks/types.js";
import { WorkerPoller } from "./source/workerPoller.js";
import { handlers, resolveHandler } from "./webhook/handlers.js";

const config = loadConfig();
// 키 파일이 없거나 형식이 틀리면 서버를 띄우기 전에 바로 실패시킨다.
loadPrivateKey(config.privateKeyPath);

const { app, queue } = buildServer(config);

const sinks: Sink[] = [];
if (config.httpSinkUrl) {
  sinks.push(new HttpSink({ name: "http", url: config.httpSinkUrl, secret: config.httpSinkSecret }));
}
app.log.info({ eventSource: config.eventSource, sinks: sinks.map((s) => s.name) }, "수신 방식과 활성화된 sink");
registerEventHandlers(handlers, app.log, new SinkRouter(sinks, app.log));

const poller = config.worker
  ? new WorkerPoller({
      url: config.worker.url,
      pullToken: config.worker.pullToken,
      intervalMs: config.worker.pollIntervalMs,
      log: app.log,
      handle: async (event) => {
        await resolveHandler(handlers, event.name)?.(event);
      },
    })
  : undefined;

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "shutting down");
  await poller?.stop();
  await app.close();
  await queue.drain();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ port: config.port, host: config.host });
poller?.start();
