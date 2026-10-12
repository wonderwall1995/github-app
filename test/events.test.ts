import { describe, expect, it } from "vitest";
import { normalizeEvent, supportedEvents } from "../src/events/index.js";

const repository = { name: "demo", full_name: "me/demo", owner: { login: "me" } };
const comment = {
  id: 55,
  body: "hello",
  html_url: "https://github.com/me/demo/issues/7#issuecomment-55",
  user: { login: "me", type: "User" },
};

describe("issue_comment", () => {
  it("이슈 코멘트를 target=issue로 정규화한다", () => {
    const event = normalizeEvent("issue_comment", {
      action: "created",
      issue: { number: 7 },
      comment,
      repository,
      installation: { id: 999 },
    });
    expect(event).toEqual({
      kind: "comment",
      target: "issue",
      action: "created",
      repo: { owner: "me", name: "demo", fullName: "me/demo" },
      number: 7,
      commentId: 55,
      author: { login: "me", type: "User" },
      body: "hello",
      url: comment.html_url,
      installationId: 999,
    });
  });

  it("issue.pull_request가 있으면 target=pull_request", () => {
    const event = normalizeEvent("issue_comment", {
      action: "edited",
      issue: { number: 8, pull_request: { url: "x" } },
      comment,
      repository,
    });
    expect(event?.target).toBe("pull_request");
    expect(event?.action).toBe("edited");
    expect(event?.installationId).toBeUndefined();
  });

  it("빈 코멘트 본문도 유효하다", () => {
    const event = normalizeEvent("issue_comment", {
      action: "created",
      issue: { number: 1 },
      comment: { ...comment, body: "" },
      repository,
    });
    expect(event?.body).toBe("");
  });

  it("Bot 작성자를 구분할 수 있다", () => {
    const event = normalizeEvent("issue_comment", {
      action: "created",
      issue: { number: 1 },
      comment: { ...comment, user: { login: "my-app[bot]", type: "Bot" } },
      repository,
    });
    expect(event?.author.type).toBe("Bot");
  });

  it("필수 필드가 없으면 undefined", () => {
    expect(normalizeEvent("issue_comment", { action: "created" })).toBeUndefined();
    expect(normalizeEvent("issue_comment", null)).toBeUndefined();
    expect(normalizeEvent("issue_comment", "str")).toBeUndefined();
  });
});

describe("pull_request_review_comment", () => {
  it("target=pull_request_review로 정규화한다", () => {
    const event = normalizeEvent("pull_request_review_comment", {
      action: "created",
      pull_request: { number: 12 },
      comment: { ...comment, id: 77 },
      repository,
    });
    expect(event).toMatchObject({ target: "pull_request_review", number: 12, commentId: 77 });
  });

  it("pull_request가 없으면 undefined", () => {
    expect(
      normalizeEvent("pull_request_review_comment", { action: "created", comment, repository }),
    ).toBeUndefined();
  });
});

describe("normalizeEvent", () => {
  it("지원하지 않는 이벤트는 undefined", () => {
    expect(normalizeEvent("push", {})).toBeUndefined();
  });

  it("지원 이벤트 목록", () => {
    expect(supportedEvents).toEqual(["issue_comment", "pull_request_review_comment"]);
  });
});
