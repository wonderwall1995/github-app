import type { Author, RepoRef } from "./types.js";

/** payload에서 값을 안전하게 꺼내는 도우미. 없거나 타입이 다르면 undefined. */
export type Obj = Record<string, unknown>;

export function obj(value: unknown): Obj | undefined {
  return typeof value === "object" && value !== null ? (value as Obj) : undefined;
}

export function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function num(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

export function bool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function readRepo(payload: Obj): RepoRef | undefined {
  const repo = obj(payload.repository);
  const fullName = str(repo?.full_name);
  const owner = str(obj(repo?.owner)?.login);
  const name = str(repo?.name);
  return fullName && owner && name ? { owner, name, fullName } : undefined;
}

export function readAuthor(user: unknown): Author | undefined {
  const u = obj(user);
  const login = str(u?.login);
  return login ? { login, type: str(u?.type) ?? "User" } : undefined;
}

/** 이벤트를 일으킨 사람 */
export function readActor(payload: Obj): Author | undefined {
  return readAuthor(payload.sender);
}

export function readInstallationId(payload: Obj): number | undefined {
  return num(obj(payload.installation)?.id);
}
