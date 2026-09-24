import type { User as FirebaseUser } from "firebase/auth";
import { supabase } from "@/integrations/supabase/client";

export function isTransientLoadError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error instanceof Error && /load failed|failed to fetch|network|abort|timeout/i.test(error.message)) {
    return true;
  }
  if (typeof error === "object" && error !== null) {
    const value = error as { message?: unknown; details?: unknown };
    const message = typeof value.message === "string" ? value.message : "";
    const details = typeof value.details === "string" ? value.details : "";
    return /load failed|failed to fetch|network|abort|timeout/i.test(message + " " + details);
  }
  return false;
}

export function formatZerosDataError(error: unknown, fallback: string): string {
  if (error instanceof TypeError) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("load failed") || msg.includes("failed to fetch") || msg.includes("network") || msg.includes("abort")) {
      return "Could not reach the database. Please refresh and try again.";
    }
    return error.message.trim() || fallback;
  }
  if (error instanceof Error && error.message.trim()) {
    const msg = error.message.trim();
    if (/load failed|failed to fetch|abort|timeout/i.test(msg)) {
      return "Could not reach the database. Please refresh and try again.";
    }
    return msg;
  }
  if (typeof error === "object" && error !== null) {
    const value = error as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
      hint?: unknown;
      status?: unknown;
    };
    const message = typeof value.message === "string" ? value.message.trim() : "";
    const code = typeof value.code === "string" ? value.code.trim() : "";
    const details = typeof value.details === "string" ? value.details.trim() : "";
    const hint = typeof value.hint === "string" ? value.hint.trim() : "";
    const status = typeof value.status === "number" ? `HTTP ${value.status}` : "";
    if (/load failed|failed to fetch|abort|timeout/i.test(message) || /load failed|failed to fetch/i.test(details)) {
      return "Could not reach the database. Please refresh and try again.";
    }
    const parts = [message, code ? `[${code}]` : "", status ? `[${status}]` : "", details, hint].filter(Boolean);
    if (parts.length) return parts.join(" — ");
  }
  if (typeof error === "string" && error.trim()) return error.trim();
  return fallback;
}

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

/** Race a promise against a timeout so the UI never hangs on a dead request. */
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

async function ensureToken(session: FirebaseUser): Promise<void> {
  try {
    await withTimeout(session.getIdToken(false), 5000, "Firebase token");
  } catch {
    await withTimeout(session.getIdToken(true), 8000, "Firebase token refresh");
  }
}

export async function loadConversationsList(
  session: FirebaseUser,
): Promise<{ id: string; title: string | null }[]> {
  const uidv = session.uid;
  let lastError: unknown = null;

  // 2 quick attempts only — never leave the user on "Waking Zeros…" for minutes.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await ensureToken(session);
      const result = await withTimeout(
        (async () => {
          const { data, error } = await supabase
            .from("conversations")
            .select("id, title")
            .eq("user_id", uidv)
            .order("updated_at", { ascending: false });
          if (error) throw error;
          return data ?? [];
        })(),
        10000,
        "Conversations query",
      );
      return result;
    } catch (e) {
      lastError = e;
      console.warn(`[Zeros] conversations list attempt ${attempt + 1} failed:`, e);
      if (attempt === 0) await sleep(400);
    }
  }
  throw lastError ?? new Error("Could not load conversations.");
}

export async function loadMessagesForConversation(
  session: FirebaseUser | null,
  convId: string,
): Promise<
  {
    id: string;
    role: string;
    content: string;
    mode: string | null;
    attachment: unknown;
  }[]
> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      if (session) await ensureToken(session);
      const result = await withTimeout(
        (async () => {
          const { data, error } = await supabase
            .from("messages")
            .select("id, role, content, mode, attachment")
            .eq("conversation_id", convId)
            .order("created_at", { ascending: true });
          if (error) throw error;
          return data ?? [];
        })(),
        12000,
        "Messages query",
      );
      return result;
    } catch (e) {
      lastError = e;
      console.warn(`[Zeros] messages load attempt ${attempt + 1} failed:`, e);
      if (attempt === 0) await sleep(400);
    }
  }
  throw lastError ?? new Error("Could not load messages.");
}
