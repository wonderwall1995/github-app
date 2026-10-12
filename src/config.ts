export interface Config {
  port: number;
  host: string;
  logLevel: string;
  webhookSecret: string;
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3200),
    host: env.HOST ?? "127.0.0.1",
    logLevel: env.LOG_LEVEL ?? "info",
    webhookSecret: required(env, "GITHUB_WEBHOOK_SECRET"),
    appId: required(env, "GITHUB_APP_ID"),
    privateKeyPath: required(env, "GITHUB_APP_PRIVATE_KEY_PATH"),
    httpSinkUrl: optional(env, "HTTP_SINK_URL"),
    httpSinkSecret: optional(env, "HTTP_SINK_SECRET"),
  };
}
