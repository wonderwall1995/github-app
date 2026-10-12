import type { AppEvent } from "./types.js";

/**
 * 알림(sink 전달) 규칙. 수집은 항상 하고, 이 표는 "수집한 이벤트를 바깥으로 내보낼지"만 정한다.
 *
 * 기본값은 알림(true)이다. 알림을 끄고 싶은 이벤트만 false로 적는다.
 * 키는 구체적인 것부터 찾는다.
 *   1. "종류:동작"   예) "pull_request:synchronize", "comment:deleted"
 *   2. "종류"         예) "push"
 *   전용 수집 코드가 없는 이벤트(kind=other)는 "other:GitHub이벤트이름"   예) "other:ping"
 */
export const notifyRules = new Map<string, boolean>([
  ["other:ping", false], // 연결 확인용 이벤트
]);

/** 규칙에 쓰는 키 목록. 앞에 있을수록 우선한다. */
export function ruleKeys(event: AppEvent): string[] {
  if (event.kind === "other") return [`other:${event.name}`];
  return [`${event.kind}:${event.action}`, event.kind];
}

/** Bot이 일으킨 이벤트인지. 앱이 쓴 코멘트에 다시 반응하는 무한 루프를 막는 데 쓴다. */
export function isBotActor(event: AppEvent): boolean {
  if (event.actor?.type === "Bot") return true;
  return event.kind === "comment" && event.author.type === "Bot";
}

/** Bot 이벤트는 수집만 하고 알림은 보내지 않는다. 그 외에는 규칙 표를 따르고, 표에 없으면 알림이다. */
export function shouldNotify(event: AppEvent, rules: Map<string, boolean> = notifyRules): boolean {
  if (isBotActor(event)) return false;
  for (const key of ruleKeys(event)) {
    const rule = rules.get(key);
    if (rule !== undefined) return rule;
  }
  return true;
}
