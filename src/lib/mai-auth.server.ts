import { createHmac, timingSafeEqual } from "node:crypto";

export const MAI_CHARACTERS = ["SPIDER-MAN", "IRON-MAN", "THOR"] as const;
export type MaiCharacter = (typeof MAI_CHARACTERS)[number];

const COOKIE_GATE = "mai_gate";
const COOKIE_SESSION = "mai_session";
const MAX_AGE_GATE = 10 * 60;
const MAX_AGE_SESSION = 30 * 24 * 60 * 60;

function secret(name: string): string {
  return (process.env[name] ?? "").trim();
}

function base64url(input: string | Uint8Array): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string): string {
  const key = secret("MAI_SESSION_SECRET") || secret("MAI_PASSWORD_JS");
  if (!key) throw new Error("MAI_SESSION_SECRET is not configured.");
  return createHmac("sha256", key).update(payload).digest("base64url");
}

function makeToken(payload: Record<string, unknown>): string {
  const body = base64url(JSON.stringify(payload));
  return body + "." + sign(body);
}

function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function verifyToken(token: string | null): Record<string, unknown> | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function verifySecret(input: string, expected: string): Promise<boolean> {
  const a = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(expected));
  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i]! ^ bb[i]!;
  return diff === 0;
}

function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

export function gateCookie(): string {
  return cookie(COOKIE_GATE, makeToken({ stage: "gate", exp: Math.floor(Date.now() / 1000) + MAX_AGE_GATE }), MAX_AGE_GATE);
}

export function sessionCookie(character: MaiCharacter): string {
  return cookie(
    COOKIE_SESSION,
    makeToken({ stage: "session", character, exp: Math.floor(Date.now() / 1000) + MAX_AGE_SESSION }),
    MAX_AGE_SESSION,
  );
}

export function clearMaiCookies(): string[] {
  return [
    `${COOKIE_GATE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
    `${COOKIE_SESSION}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
  ];
}

export function hasGate(request: Request): boolean {
  return verifyToken(readCookie(request, COOKIE_GATE))?.stage === "gate";
}

export function getMaiSession(request: Request): { character: MaiCharacter } | null {
  const payload = verifyToken(readCookie(request, COOKIE_SESSION));
  const character = payload?.character;
  if (payload?.stage !== "session" || typeof character !== "string") return null;
  if (!(MAI_CHARACTERS as readonly string[]).includes(character)) return null;
  return { character: character as MaiCharacter };
}
