import { arr, num, obj, readActor, readInstallationId, readRepo, str } from "../payload.js";
import type { WorkflowRunEvent } from "../types.js";

/** workflow_run 이벤트. CI(GitHub Actions) 실행의 요청, 진행, 완료. 완료 시 conclusion이 채워진다. */
export function collectWorkflowRun(payload: unknown): WorkflowRunEvent | undefined {
  const p = obj(payload);
  if (!p) return undefined;

  const run = obj(p.workflow_run);
  const action = str(p.action);
  const repo = readRepo(p);
  const runId = num(run?.id);
  const name = str(run?.name);
  const status = str(run?.status);
  const headSha = str(run?.head_sha);
  const headBranch = str(run?.head_branch);
  const url = str(run?.html_url);
  if (!action || !repo || runId === undefined || name === undefined || !status || !headSha || !headBranch || !url) {
    return undefined;
  }

  const pullRequests = arr(run?.pull_requests)
    .map((pr) => num(obj(pr)?.number))
    .filter((n): n is number => n !== undefined);

  return {
    kind: "workflow_run",
    action,
    repo,
    runId,
    name,
    status,
    conclusion: str(run?.conclusion),
    headSha,
    headBranch,
    url,
    pullRequests,
    actor: readActor(p),
    installationId: readInstallationId(p),
  };
}
