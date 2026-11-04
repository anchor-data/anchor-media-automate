/** Signed, short-lived OAuth `state` that carries the account id through the Instagram redirect. */

const STATE_TTL_MS = 10 * 60 * 1000;
const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

async function sign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign"
  ]);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createInstagramState(secret: string, accountId: string, now: number = Date.now()): Promise<string> {
  const payload = toBase64Url(encoder.encode(JSON.stringify({ a: accountId, e: now + STATE_TTL_MS })));
  return `${payload}.${await sign(secret, payload)}`;
}

/** The account id the state was issued for, or null when it is forged, malformed or expired. */
export async function verifyInstagramState(
  secret: string,
  state: string,
  now: number = Date.now()
): Promise<string | null> {
  const [payload, signature, ...rest] = state.split(".");
  if (!payload || !signature || rest.length > 0) return null;
  if (!constantTimeEqual(signature, await sign(secret, payload))) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(payload)) as { a?: unknown; e?: unknown };
    if (typeof parsed.a !== "string" || typeof parsed.e !== "number" || parsed.e < now) return null;
    return parsed.a;
  } catch {
    return null;
  }
}
