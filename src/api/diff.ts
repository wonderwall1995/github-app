import type { FileInfo } from "../github/client.js";

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
