import { describe, expect, it } from "vitest";
import { normalizeEvent } from "../src/events/index.js";
import { isBotActor, ruleKeys, shouldNotify } from "../src/events/policy.js";
import type { AppEvent } from "../src/events/index.js";

const repository = { name: "demo", full_name: "me/demo", owner: { login: "me" } };

function prEvent(action: string, senderType = "User"): AppEvent {
  return normalizeEvent("pull_request", {
    action,
    pull_request: {
      number: 3,
      title: "t",
      html_url: "https://x",
      user: { login: "me", type: "User" },
      base: { ref: "main" },
      head: { ref: "f", sha: "s" },
    },
    repository,
    sender: { login: "who", type: senderType },
  })!;
}

describe("shouldNotify", () => {
  it("규칙이 없으면 기본은 알림", () => {
    expect(shouldNotify(prEvent("opened"), new Map())).toBe(true);
  });

  it("ping은 기본 규칙으로 알림에서 제외", () => {
    const ping = normalizeEvent("ping", { zen: "hi" })!;
    expect(shouldNotify(ping)).toBe(false);
  });

  it("종류:동작 규칙이 종류 규칙보다 우선한다", () => {
    const rules = new Map([
      ["pull_request", false],
      ["pull_request:opened", true],
    ]);
    expect(shouldNotify(prEvent("opened"), rules)).toBe(true);
    expect(shouldNotify(prEvent("synchronize"), rules)).toBe(false);
  });

  it("종류 규칙은 그 종류의 모든 동작에 적용된다", () => {
    const rules = new Map([["pull_request", false]]);
    expect(shouldNotify(prEvent("closed"), rules)).toBe(false);
  });

  it("Bot이 일으킨 이벤트는 규칙과 상관없이 알림에서 제외", () => {
    const rules = new Map([["pull_request:opened", true]]);
    expect(shouldNotify(prEvent("opened", "Bot"), rules)).toBe(false);
  });

  it("Bot이 쓴 코멘트는 sender가 없어도 알림에서 제외", () => {
    const event = normalizeEvent("issue_comment", {
      action: "created",
      issue: { number: 1 },
      comment: { id: 1, body: "x", html_url: "https://x", user: { login: "app[bot]", type: "Bot" } },
      repository,
    })!;
    expect(isBotActor(event)).toBe(true);
    expect(shouldNotify(event, new Map())).toBe(false);
  });
});

describe("ruleKeys", () => {
  it("generic 이벤트는 이벤트 이름 키만 쓴다", () => {
    expect(ruleKeys(normalizeEvent("star", { action: "created" })!)).toEqual(["other:star"]);
  });

  it("전용 이벤트는 종류:동작, 종류 순서", () => {
    expect(ruleKeys(prEvent("opened"))).toEqual(["pull_request:opened", "pull_request"]);
  });
});
