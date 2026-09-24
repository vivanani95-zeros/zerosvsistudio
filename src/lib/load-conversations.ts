import type { User as FirebaseUser } from "firebase/auth";
import { supabase } from "@/integrations/supabase/client";

export function isTransientLoadError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error instanceof Error && /load failed|failed to fetch|network/i.test(error.message)) return true;
  if (typeof error === "object" && error !== null) {
    const value = error as { message?: unknown; details?: unknown };
    const message = typeof value.message === "string" ? value.message : "";
    const details = typeof value.details === "string" ? value.details : "";
    return /load failed|failed to fetch|network/i.test(message) || /load failed|failed to fetch|network/i.test(details);
  }
  return false;
}

export function formatZerosDataError(error: unknown, fallback: string): string {
  if (error instanceof TypeError) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("load failed") || msg.includes("failed to fetch") || msg.includes("network")) {
      return "Could not reach the database. Please refresh and try again.";
    }
    return error.message.trim() || fallback;
  }
  if (error instanceof Error && error.message.trim()) {
    const msg = error.message.trim();
    if (/load failed|failed to fetch/i.test(msg)) {
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
    if (/load failed|failed to fetch/i.test(message) || /load failed|failed to fetch/i.test(details)) {
      return "Could not reach the database. Please refresh and try again.";
    }
    const parts = [message, code ? `[${code}]` : "", status ? `[${status}]` : "", details, hint].filter(Boolean);
    if (parts.length) return parts.join(" — ");
  }
  if (typeof error === "string" && error.trim()) return error.trim();
  return fallback;
}

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

async function withToken<T>(session: FirebaseUser, fn: () => Promise<T>): Promise<T> {
  try {
    await session.getIdToken(false);
  } catch {
    await session.getIdToken(true);
  }
  return fn();
}

export async function loadConversationsList(
  session: FirebaseUser,
): Promise<{ id: string; title: string | null }[]> {
  const uidv = session.uid;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const result = await withToken(session, async () => {
        const { data, error } = await supabase
          .from("conversations")
          .select("id, title")
          .eq("user_id", uidv)
          .order("updated_at", { ascending: false });
        if (error) throw error;
        return data ?? [];
      });
      return result;
    } catch (e) {
      lastError = e;
      console.warn(`[Zeros] conversations list attempt ${attempt + 1} failed:`, e);
      if (!isTransientLoadError(e) && attempt >= 1) break;
      await sleep(250 * (attempt + 1));
      try {
        await session.getIdToken(true);
      } catch (tokenErr) {
        console.warn("[Zeros] Firebase token refresh failed:", tokenErr);
      }
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
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (session) {
        try {
          await session.getIdToken(false);
        } catch {
          await session.getIdToken(true);
        }
      }
      const { data, error } = await supabase
        .from("messages")
        .select("id, role, content, mode, attachment")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    } catch (e) {
      lastError = e;
      console.warn(`[Zeros] messages load attempt ${attempt + 1} failed:`, e);
      await sleep(300 * (attempt + 1));
    }
  }
  throw lastError ?? new Error("Could not load messages.");
}
