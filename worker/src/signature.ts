const encoder = new TextEncoder();
const HEX64 = /^[0-9a-f]{64}$/i;

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

/** X-Hub-Signature-256 헤더가 원본 바디의 HMAC-SHA256과 일치하는지 검증한다. subtle.verify는 상수 시간 비교다. */
export async function verifySignature(secret: string, body: ArrayBuffer, header: string | null): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const hex = header.slice("sha256=".length);
  if (!HEX64.test(hex)) return false;
  return crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), hexToBytes(hex), body);
}

/** 테스트에서 GitHub처럼 서명을 만들 때 쓴다. */
export async function sign(secret: string, body: string): Promise<string> {
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), encoder.encode(body));
  return `sha256=${bytesToHex(mac)}`;
}

/** 두 문자열이 같은지 상수 시간으로 비교한다. 길이가 달라도 같은 시간이 걸리도록 해시 후 비교한다. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([a, b].map((s) => crypto.subtle.digest("SHA-256", encoder.encode(s))));
  const x = new Uint8Array(da!);
  const y = new Uint8Array(db!);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}
