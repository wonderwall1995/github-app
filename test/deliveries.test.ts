import { describe, expect, it } from "vitest";
import { DeliveryStore } from "../src/webhook/deliveries.js";

describe("DeliveryStore", () => {
  it("TTL이 지나면 만료되어 다시 받을 수 있다", () => {
    let t = 0;
    const store = new DeliveryStore(1000, 100, () => t);
    expect(store.begin("a")).toBe(true);
    t = 999;
    expect(store.begin("a")).toBe(false);
    t = 1001;
    expect(store.begin("a")).toBe(true);
  });

  it("최대 개수를 넘으면 오래된 것부터 버린다", () => {
    const store = new DeliveryStore(1_000_000, 2, () => 0);
    store.begin("a");
    store.begin("b");
    store.begin("c");
    store.begin("d"); // prune이 a를 제거
    expect(store.begin("a")).toBe(true);
    expect(store.begin("d")).toBe(false);
  });
});
