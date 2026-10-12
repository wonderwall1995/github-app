export interface NewEvent {
  deliveryId: string;
  name: string;
  /** JSON 문자열 그대로 */
  payload: string;
  receivedAt: number;
}

export interface StoredEvent extends NewEvent {
  id: number;
}

/**
 * 이벤트 보관소. Worker 코드는 이 인터페이스만 안다.
 * 지금은 D1이고, 나중에 Postgres 등으로 바꿀 때 이 인터페이스를 구현하는 클래스만 새로 만들면 된다.
 */
export interface EventStore {
  /** 새로 저장했으면 true, 같은 deliveryId가 이미 있어서 무시했으면 false */
  insert(event: NewEvent): Promise<boolean>;
  /** 오래된 순서로 최대 limit개 */
  list(limit: number): Promise<StoredEvent[]>;
  /** 가져간 이벤트를 지운다. 지운 개수를 돌려준다. */
  ack(ids: number[]): Promise<number>;
  /** 기준 시각보다 오래된 이벤트를 지운다. */
  purgeOlderThan(timestamp: number): Promise<number>;
}

interface Row {
  id: number;
  delivery_id: string;
  name: string;
  payload: string;
  received_at: number;
}

export class D1EventStore implements EventStore {
  constructor(private readonly db: D1Database) {}

  async insert(event: NewEvent): Promise<boolean> {
    const result = await this.db
      .prepare("INSERT OR IGNORE INTO events (delivery_id, name, payload, received_at) VALUES (?, ?, ?, ?)")
      .bind(event.deliveryId, event.name, event.payload, event.receivedAt)
      .run();
    return result.meta.changes === 1;
  }

  async list(limit: number): Promise<StoredEvent[]> {
    const { results } = await this.db
      .prepare("SELECT id, delivery_id, name, payload, received_at FROM events ORDER BY id ASC LIMIT ?")
      .bind(limit)
      .all<Row>();
    return results.map((r) => ({
      id: r.id,
      deliveryId: r.delivery_id,
      name: r.name,
      payload: r.payload,
      receivedAt: r.received_at,
    }));
  }

  async ack(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;
    const stmt = this.db.prepare("DELETE FROM events WHERE id = ?");
    const results = await this.db.batch(ids.map((id) => stmt.bind(id)));
    return results.reduce((sum, r) => sum + r.meta.changes, 0);
  }

  async purgeOlderThan(timestamp: number): Promise<number> {
    const result = await this.db.prepare("DELETE FROM events WHERE received_at < ?").bind(timestamp).run();
    return result.meta.changes;
  }
}
