import { arr, bool, obj, readActor, readInstallationId, readRepo, str } from "../payload.js";
import type { PushCommit, PushEvent } from "../types.js";

/** push 이벤트. 이 이벤트에는 action이 없어서 "pushed"로 채운다. */
export function collectPush(payload: unknown): PushEvent | undefined {
  const p = obj(payload);
  if (!p) return undefined;

  const repo = readRepo(p);
  const ref = str(p.ref);
  const before = str(p.before);
  const after = str(p.after);
  if (!repo || !ref || !before || !after) return undefined;

  const commits: PushCommit[] = [];
  for (const item of arr(p.commits)) {
    const c = obj(item);
    const id = str(c?.id);
    if (!c || !id) continue;
    commits.push({ id, message: str(c.message) ?? "", author: str(obj(c.author)?.name) });
  }

  return {
    kind: "push",
    action: "pushed",
    repo,
    ref,
    before,
    after,
    forced: bool(p.forced) ?? false,
    deleted: bool(p.deleted) ?? false,
    compareUrl: str(p.compare),
    pusher: str(obj(p.pusher)?.name),
    commits,
    actor: readActor(p),
    installationId: readInstallationId(p),
  };
}
