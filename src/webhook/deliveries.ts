/**
 * X-GitHub-Delivery 기반 멱등 처리용 인메모리 저장소.
 * 처리 중이거나 완료된 delivery는 거절하고, 실패하면 풀어줘서 GitHub 재전송(Redeliver)을 다시 받을 수 있게 한다.
 */
export class DeliveryStore {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly ttlMs = 24 * 60 * 60 * 1000,
    private readonly maxEntries = 10_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** 처음 보는 delivery면 true(처리 시작), 이미 처리 중/완료면 false. */
  begin(id: string): boolean {
    this.prune();
    if (this.seen.has(id)) return false;
    this.seen.set(id, this.now());
    return true;
  }

  /** 처리 실패 시 호출. 같은 delivery의 재전송을 다시 받을 수 있게 된다. */
  fail(id: string): void {
    this.seen.delete(id);
  }

  private prune(): void {
    const cutoff = this.now() - this.ttlMs;
    for (const [id, at] of this.seen) {
      // Map은 삽입 순서를 유지하므로 오래된 것부터 지우다 멈춘다.
      if (at >= cutoff && this.seen.size <= this.maxEntries) break;
      this.seen.delete(id);
    }
  }
}
