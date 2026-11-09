/** 보고서 보관소. EventStore처럼 Worker 코드는 이 인터페이스만 안다. */
export interface ReportStore {
  /** 같은 token이 있으면 덮어쓴다. */
  put(token: string, body: string, createdAt: number, expiresAt: number): Promise<void>;
  /** 만료되지 않은 보고서만 돌려준다. */
  get(token: string, now: number): Promise<string | null>;
  /** 만료된 보고서를 지우고 지운 개수를 돌려준다. */
  purgeExpired(now: number): Promise<number>;
}

export class D1ReportStore implements ReportStore {
  constructor(private readonly db: D1Database) {}

  async put(token: string, body: string, createdAt: number, expiresAt: number): Promise<void> {
    await this.db
      .prepare("INSERT OR REPLACE INTO reports (token, body, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .bind(token, body, createdAt, expiresAt)
      .run();
  }

  async get(token: string, now: number): Promise<string | null> {
    const row = await this.db
      .prepare("SELECT body FROM reports WHERE token = ? AND expires_at > ?")
      .bind(token, now)
      .first<{ body: string }>();
    return row?.body ?? null;
  }

  async purgeExpired(now: number): Promise<number> {
    const result = await this.db.prepare("DELETE FROM reports WHERE expires_at <= ?").bind(now).run();
    return result.meta.changes;
  }
}
