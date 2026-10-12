import { arr, num, obj, readActor, readAuthor, readInstallationId, readRepo, str } from "../payload.js";
import type { IssueEvent } from "../types.js";

/** issues 이벤트. opened(생성), closed, reopened, edited, labeled 등. */
export function collectIssues(payload: unknown): IssueEvent | undefined {
  const p = obj(payload);
  if (!p) return undefined;

  const issue = obj(p.issue);
  const action = str(p.action);
  const repo = readRepo(p);
  const number = num(issue?.number);
  const title = str(issue?.title);
  const author = readAuthor(issue?.user);
  const url = str(issue?.html_url);
  const state = str(issue?.state);
  if (!action || !repo || number === undefined || title === undefined || !author || !url || !state) {
    return undefined;
  }

  const labels = arr(issue?.labels)
    .map((label) => str(obj(label)?.name))
    .filter((name): name is string => name !== undefined);

  return {
    kind: "issue",
    action,
    repo,
    number,
    title,
    // 본문이 비어 있으면 body가 null로 온다.
    body: str(issue?.body) ?? "",
    author,
    url,
    state,
    labels,
    actor: readActor(p),
    installationId: readInstallationId(p),
  };
}
