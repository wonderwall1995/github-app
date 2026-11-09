import type { FileInfo, PatchedFile } from "../github/client.js";

export interface ApiFile extends FileInfo {
  diffIncluded: boolean;
}

/** 'diff --git a/x b/y' 단위로 나누고 새 경로(b/ 쪽)로 찾을 수 있게 한다. */
export function splitDiffByPath(diff: string): Map<string, string> {
  const blocks = new Map<string, string>();
  const parts = diff.split(/^(?=diff --git )/m);
  for (const part of parts) {
    const header = /^diff --git a\/.+? b\/(.+)$/m.exec(part.split("\n", 1)[0] ?? "");
    if (header?.[1]) blocks.set(header[1], part);
  }
  return blocks;
}

/** 상한 안에서 파일 목록 순서대로 diff 블록을 담는다. 담지 못한 파일은 diffIncluded=false이다. */
export function limitDiff(
  files: FileInfo[],
  diff: string,
  maxChars: number,
): { files: ApiFile[]; diff: string; truncated: boolean } {
  const blocks = splitDiffByPath(diff);
  let total = 0;
  let truncated = false;
  const kept: string[] = [];
  const out: ApiFile[] = [];
  for (const file of files) {
    const block = blocks.get(file.path);
    if (block === undefined) {
      // GitHub이 너무 큰 파일의 diff를 생략한 경우다.
      out.push({ ...file, diffIncluded: false });
      continue;
    }
    if (truncated || total + block.length > maxChars) {
      truncated = true;
      out.push({ ...file, diffIncluded: false });
      continue;
    }
    kept.push(block);
    total += block.length;
    out.push({ ...file, diffIncluded: true });
  }
  return { files: out, diff: kept.join(""), truncated: truncated || out.some((f) => !f.diffIncluded) };
}

/**
 * 파일 목록 응답의 patch(헌크만 있음)에 diff 헤더를 붙여 `git diff` 한 파일분과 같은 모양의 블록을 만든다.
 * GitHub이 patch를 주지 않은 파일(너무 큰 변경, 이진 파일)은 undefined이다.
 */
export function blockFromPatch(file: PatchedFile): string | undefined {
  if (file.patch === undefined || file.patch === "") return undefined;
  const oldPath = file.previousPath ?? file.path;
  const added = file.status === "added";
  const removed = file.status === "removed";
  const lines = [`diff --git a/${oldPath} b/${file.path}`];
  if (file.previousPath && file.previousPath !== file.path) {
    lines.push(`rename from ${file.previousPath}`, `rename to ${file.path}`);
  }
  lines.push(`--- ${added ? "/dev/null" : `a/${oldPath}`}`, `+++ ${removed ? "/dev/null" : `b/${file.path}`}`);
  const patch = file.patch.endsWith("\n") ? file.patch : `${file.patch}\n`;
  return `${lines.join("\n")}\n${patch}`;
}

export type Omitted = "no_patch" | "size_cap";

export interface ManifestFile extends FileInfo {
  patchChars: number;
  omitted: Omitted | null;
}

/** 본문 없이 파일별 크기만 알려 주는 목록. 어떤 파일을 가져올지는 받는 쪽이 정한다. */
export function buildManifest(files: PatchedFile[]): ManifestFile[] {
  return files.map((f) => {
    const block = blockFromPatch(f);
    const { path, status, additions, deletions } = f;
    return { path, status, additions, deletions, patchChars: block?.length ?? 0, omitted: block === undefined ? "no_patch" : null };
  });
}

/**
 * 요청한 경로의 블록만 담는다. 요청한 순서를 지키고, 상한을 넘기는 블록 하나만 건너뛴다 (뒤의 작은 파일은 계속 담는다).
 * 담지 못한 파일은 이유(omitted)를 달아 돌려준다.
 */
export function selectBlocks(
  files: PatchedFile[],
  paths: string[],
  maxChars: number,
): { files: (ManifestFile & { diffIncluded: boolean })[]; diff: string; truncated: boolean } {
  const byPath = new Map(files.map((f) => [f.path, f]));
  let total = 0;
  const kept: string[] = [];
  const out: (ManifestFile & { diffIncluded: boolean })[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    const file = byPath.get(path);
    if (!file || seen.has(path)) continue;
    seen.add(path);
    const block = blockFromPatch(file);
    const { status, additions, deletions } = file;
    const base = { path, status, additions, deletions, patchChars: block?.length ?? 0 };
    if (block === undefined) {
      out.push({ ...base, omitted: "no_patch", diffIncluded: false });
    } else if (total + block.length > maxChars) {
      out.push({ ...base, omitted: "size_cap", diffIncluded: false });
    } else {
      kept.push(block);
      total += block.length;
      out.push({ ...base, omitted: null, diffIncluded: true });
    }
  }
  return { files: out, diff: kept.join(""), truncated: out.some((f) => !f.diffIncluded) };
}
