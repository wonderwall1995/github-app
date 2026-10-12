export interface Config {
  port: number;
  host: string;
  logLevel: string;
  webhookSecret: string;
  appId: string;
  privateKeyPath: string;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is required (.env 참고)`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? "127.0.0.1",
    logLevel: env.LOG_LEVEL ?? "info",
    webhookSecret: required(env, "GITHUB_WEBHOOK_SECRET"),
    appId: required(env, "GITHUB_APP_ID"),
    privateKeyPath: required(env, "GITHUB_APP_PRIVATE_KEY_PATH"),
  };
}
