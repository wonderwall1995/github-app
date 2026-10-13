import { verifySignature } from "../webhook/signature.js";

/** 서명 시각과 서버 시각의 허용 차이(초). 이 시간이 지난 요청은 재전송으로 본다. */
export const REPLAY_WINDOW_SEC = 300;

/**
 * Hermes 요청 서명 검증. 서명 대상은 "<timestamp>.<원본 바디>"이다.
 * 헤더: x-hermes-timestamp(초 단위 정수), x-hermes-signature(sha256=<hex>)
 */
export function verifyHermesRequest(
  secret: string,
  rawBody: Buffer,
  timestamp: string | undefined,
  signature: string | undefined,
  nowMs: number = Date.now(),
): "ok" | "bad_signature" | "stale" {
  if (!timestamp || !/^\d{1,12}$/.test(timestamp)) return "bad_signature";
  const signed = Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]);
  if (!verifySignature(secret, signed, signature)) return "bad_signature";
  if (Math.abs(Math.floor(nowMs / 1000) - Number(timestamp)) > REPLAY_WINDOW_SEC) return "stale";
  return "ok";
}
