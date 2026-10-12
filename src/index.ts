import { loadConfig } from "./config.js";
import { loadPrivateKey } from "./github/auth.js";
import { registerEventHandlers } from "./events/register.js";
import { buildServer } from "./server.js";
import { handlers } from "./webhook/handlers.js";

const config = loadConfig();
// 키 파일이 없거나 형식이 틀리면 서버를 띄우기 전에 바로 실패시킨다.
loadPrivateKey(config.privateKeyPath);

const { app, queue } = buildServer(config);
registerEventHandlers(handlers, app.log);

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "shutting down");
  await app.close();
  await queue.drain();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ port: config.port, host: config.host });
