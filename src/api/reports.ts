import { randomBytes } from "node:crypto";

export const MAX_REPORT_BYTES = 1024 * 1024;

export interface UploadedReport {
  url: string;
  expiresAt: number;
}

/** HTML 보고서를 보관소에 올리고 내려받는 주소를 돌려준다. */
export interface ReportUploader {
  upload(html: string): Promise<UploadedReport>;
}

export class ReportUploadError extends Error {
  constructor(readonly status: number) {
    super(`보고서 업로드 실패 (${status})`);
  }
}

/** Cloudflare Worker의 /reports 로 올린다. 주소의 token 은 32바이트 난수이며 이 서버가 만든다. */
export function workerReportUploader(
  worker: { url: string; pullToken: string },
  fetchFn: typeof fetch = fetch,
  makeToken: () => string = () => randomBytes(32).toString("base64url"),
): ReportUploader {
  return {
    async upload(html: string): Promise<UploadedReport> {
      const token = makeToken();
      const res = await fetchFn(`${worker.url}/reports/${token}`, {
        method: "PUT",
        headers: { authorization: `Bearer ${worker.pullToken}`, "content-type": "text/html; charset=utf-8" },
        body: html,
      });
      if (res.status !== 201) throw new ReportUploadError(res.status);
      const data = (await res.json().catch(() => ({}))) as { expiresAt?: number };
      return { url: `${worker.url}/r/${token}`, expiresAt: typeof data.expiresAt === "number" ? data.expiresAt : 0 };
    },
  };
}
