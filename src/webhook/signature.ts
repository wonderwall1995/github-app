import { createHmac, timingSafeEqual } from "node:crypto";

const PREFIX = "sha256=";

/** X-Hub-Signature-256 헤더가 원본 바디의 HMAC-SHA256과 일치하는지 상수 시간 비교로 검증한다. */
export function verifySignature(secret: string, rawBody: Buffer, header: string | undefined): boolean {
  if (!header?.startsWith(PREFIX)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const actual = Buffer.from(header.slice(PREFIX.length), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function sign(secret: string, rawBody: Buffer | string): string {
  return PREFIX + createHmac("sha256", secret).update(rawBody).digest("hex");
}
