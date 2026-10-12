import { obj, readActor, readInstallationId, readRepo, str } from "../payload.js";
import type { GenericEvent } from "../types.js";

/**
 * 전용 수집 코드가 없는 이벤트의 기본 처리. 어떤 이벤트인지와 누가 일으켰는지만 남긴다.
 * 이 이벤트를 자세히 보고 싶어지면 이 폴더에 전용 파일을 추가하고 index.ts에 등록한다.
 */
export function collectGeneric(name: string, payload: unknown): GenericEvent | undefined {
  const p = obj(payload);
  if (!p) return undefined;

  return {
    kind: "other",
    name,
    action: str(p.action) ?? "",
    repo: readRepo(p),
    actor: readActor(p),
    installationId: readInstallationId(p),
  };
}
