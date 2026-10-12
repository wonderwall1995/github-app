import { describe, expect, it } from "vitest";
import { detailedEvents, normalizeEvent } from "../src/events/index.js";

const repository = { name: "demo", full_name: "me/demo", owner: { login: "me" } };
const sender = { login: "me", type: "User" };
const installation = { id: 999 };
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
      sender,
      installation,
    });
    expect(event).toEqual({
      kind: "comment",
      target: "issue",
      action: "created",
      repo: { owner: "me", name: "demo", fullName: "me/demo" },
      number: 7,
      commitSha: undefined,
      commentId: 55,
      author: { login: "me", type: "User" },
      body: "hello",
      url: comment.html_url,
      actor: sender,
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
    expect(event).toMatchObject({ kind: "comment", target: "pull_request", action: "edited" });
    expect(event).toMatchObject({ installationId: undefined, actor: undefined });
  });

  it("빈 코멘트 본문도 유효하다", () => {
    const event = normalizeEvent("issue_comment", {
      action: "created",
      issue: { number: 1 },
      comment: { ...comment, body: "" },
      repository,
    });
    expect(event).toMatchObject({ kind: "comment", body: "" });
  });

  it("필수 필드가 없으면 generic 요약으로 수집한다", () => {
    expect(normalizeEvent("issue_comment", { action: "created" })).toMatchObject({
      kind: "other",
      name: "issue_comment",
      action: "created",
    });
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
    expect(event).toMatchObject({ kind: "comment", target: "pull_request_review", number: 12, commentId: 77 });
  });
});

describe("commit_comment", () => {
  it("커밋 SHA를 담고 번호는 없다", () => {
    const event = normalizeEvent("commit_comment", {
      action: "created",
      comment: { ...comment, commit_id: "abc123" },
      repository,
    });
    expect(event).toMatchObject({ kind: "comment", target: "commit", commitSha: "abc123", number: undefined });
  });
});

describe("pull_request", () => {
  const pr = {
    number: 3,
    title: "기능 추가",
    html_url: "https://github.com/me/demo/pull/3",
    user: { login: "me", type: "User" },
    draft: false,
    merged: true,
    base: { ref: "main" },
    head: { ref: "feature", sha: "deadbeef" },
  };

  it("PR 정보를 정규화한다", () => {
    const event = normalizeEvent("pull_request", { action: "closed", pull_request: pr, repository, sender });
    expect(event).toEqual({
      kind: "pull_request",
      action: "closed",
      repo: { owner: "me", name: "demo", fullName: "me/demo" },
      number: 3,
      title: "기능 추가",
      author: { login: "me", type: "User" },
      url: pr.html_url,
      draft: false,
      merged: true,
      baseRef: "main",
      headRef: "feature",
      headSha: "deadbeef",
      actor: sender,
      installationId: undefined,
    });
  });

  it("커밋이 추가되면(synchronize) 새 headSha를 담는다", () => {
    const event = normalizeEvent("pull_request", {
      action: "synchronize",
      pull_request: { ...pr, head: { ref: "feature", sha: "cafe" } },
      repository,
    });
    expect(event).toMatchObject({ action: "synchronize", headSha: "cafe" });
  });
});

describe("push", () => {
  it("커밋 목록과 ref를 정규화한다", () => {
    const event = normalizeEvent("push", {
      ref: "refs/heads/main",
      before: "000",
      after: "111",
      forced: false,
      deleted: false,
      compare: "https://github.com/me/demo/compare/000...111",
      pusher: { name: "me" },
      commits: [
        { id: "c1", message: "첫 커밋", author: { name: "me" } },
        { id: "c2", message: "둘째", author: { name: "you" } },
        { message: "id 없는 항목은 버린다" },
      ],
      repository,
    });
    expect(event).toMatchObject({
      kind: "push",
      action: "pushed",
      ref: "refs/heads/main",
      pusher: "me",
      commits: [
        { id: "c1", message: "첫 커밋", author: "me" },
        { id: "c2", message: "둘째", author: "you" },
      ],
    });
  });

  it("커밋이 없는 push(브랜치 삭제 등)도 수집한다", () => {
    const event = normalizeEvent("push", {
      ref: "refs/heads/old",
      before: "111",
      after: "000",
      deleted: true,
      repository,
    });
    expect(event).toMatchObject({ kind: "push", deleted: true, commits: [] });
  });
});

describe("issues", () => {
  it("라벨과 null 본문을 처리한다", () => {
    const event = normalizeEvent("issues", {
      action: "opened",
      issue: {
        number: 4,
        title: "버그",
        body: null,
        state: "open",
        html_url: "https://github.com/me/demo/issues/4",
        user: { login: "me", type: "User" },
        labels: [{ name: "bug" }, { name: "urgent" }],
      },
      repository,
    });
    expect(event).toMatchObject({ kind: "issue", number: 4, body: "", labels: ["bug", "urgent"] });
  });
});

describe("pull_request_review", () => {
  it("승인 상태를 소문자로 정규화한다", () => {
    const event = normalizeEvent("pull_request_review", {
      action: "submitted",
      review: { id: 9, state: "APPROVED", body: null, html_url: "https://x", user: { login: "you", type: "User" } },
      pull_request: { number: 3 },
      repository,
    });
    expect(event).toMatchObject({ kind: "review", prNumber: 3, reviewId: 9, state: "approved", body: "" });
  });
});

describe("workflow_run", () => {
  it("CI 결과를 정규화한다", () => {
    const event = normalizeEvent("workflow_run", {
      action: "completed",
      workflow_run: {
        id: 100,
        name: "CI",
        status: "completed",
        conclusion: "failure",
        head_sha: "abc",
        head_branch: "feature",
        html_url: "https://x/runs/100",
        pull_requests: [{ number: 3 }, {}],
      },
      repository,
    });
    expect(event).toMatchObject({
      kind: "workflow_run",
      runId: 100,
      conclusion: "failure",
      pullRequests: [3],
    });
  });

  it("진행 중이면 conclusion이 없다", () => {
    const event = normalizeEvent("workflow_run", {
      action: "requested",
      workflow_run: {
        id: 101,
        name: "CI",
        status: "queued",
        conclusion: null,
        head_sha: "abc",
        head_branch: "main",
        html_url: "https://x",
      },
      repository,
    });
    expect(event).toMatchObject({ conclusion: undefined, pullRequests: [] });
  });
});

describe("generic 수집", () => {
  it("전용 코드가 없는 이벤트도 요약으로 수집한다", () => {
    const event = normalizeEvent("star", { action: "created", repository, sender, installation });
    expect(event).toEqual({
      kind: "other",
      name: "star",
      action: "created",
      repo: { owner: "me", name: "demo", fullName: "me/demo" },
      actor: sender,
      installationId: 999,
    });
  });

  it("repository가 없는 이벤트(ping 등)도 수집한다", () => {
    expect(normalizeEvent("ping", { zen: "hi" })).toMatchObject({ kind: "other", name: "ping", repo: undefined });
  });

  it("객체가 아닌 payload는 undefined", () => {
    expect(normalizeEvent("push", null)).toBeUndefined();
    expect(normalizeEvent("push", "str")).toBeUndefined();
  });

  it("Object 기본 속성과 같은 이름의 이벤트도 안전하게 generic으로 처리한다", () => {
    expect(normalizeEvent("constructor", { a: 1 })).toMatchObject({ kind: "other", name: "constructor" });
  });
});

describe("detailedEvents", () => {
  it("전용 수집 코드가 있는 이벤트 목록", () => {
    expect(detailedEvents).toEqual([
      "issue_comment",
      "pull_request_review_comment",
      "commit_comment",
      "pull_request",
      "pull_request_review",
      "push",
      "issues",
      "workflow_run",
    ]);
  });
});
