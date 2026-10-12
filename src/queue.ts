export type Job = () => Promise<void>;

/** 요청 처리와 분리해 백그라운드에서 순차 실행하는 인메모리 큐. */
export class JobQueue {
  private tail: Promise<void> = Promise.resolve();
  private pending = 0;

  constructor(private readonly onError: (err: unknown) => void) {}

  enqueue(job: Job): void {
    this.pending++;
    this.tail = this.tail
      .then(job)
      .catch(this.onError)
      .finally(() => {
        this.pending--;
      });
  }

  /** 큐가 비워질 때까지 대기 (종료/테스트용). */
  async drain(): Promise<void> {
    await this.tail;
  }

  get size(): number {
    return this.pending;
  }
}
