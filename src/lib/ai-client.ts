import type { ZeroMode } from "./zeros";

export type Msg = { role: "user" | "assistant"; content: string };

export async function streamChat(
  messages: Msg[],
  mode: ZeroMode,
  memories: string[],
  onDelta: (full: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, mode, memories }),
    signal: signal ?? null,
  });
  if (!res.ok || !res.body) {
    throw new Error((await res.text().catch(() => "")) || `Error ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";
    for (const line of parts) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        const delta = json?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) {
          full += delta;
          onDelta(full);
        }
      } catch {
        /* partial frame */
      }
    }
  }
  buffer += decoder.decode();
  const trailing = buffer.trim();
  if (trailing.startsWith("data:")) {
    const payload = trailing.slice(5).trim();
    if (payload && payload !== "[DONE]") {
      try {
        const json = JSON.parse(payload);
        const delta = json?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) {
          full += delta;
          onDelta(full);
        }
      } catch {
        // An incomplete final event means the provider ended mid-generation.
      }
    }
  }
  if (!full.trim()) throw new Error("Zeros received an empty generation. Please try again.");
  return full;
}

function findB64(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v === "string") {
      if (k === "b64_json" && v.length > 100) return `data:image/png;base64,${v}`;
      if (v.startsWith("data:image/")) return v;
    } else if (v && typeof v === "object") {
      const found = findB64(v);
      if (found) return found;
    }
  }
  return null;
}

export async function generateImage(prompt: string): Promise<string> {
  const res = await fetch("/api/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, stream: false }),
  });
  if (!res.ok) {
    throw new Error((await res.text().catch(() => "")) || `Error ${res.status}`);
  }
  const json = await res.json();
  const img = findB64(json);
  if (!img) throw new Error("The image model returned no image. Try again.");
  return img;
}

/** Tripo AI text-to-3D: creates a job, polls it, resolves with a .glb URL. */
export async function generateModel(
  prompt: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const create = await fetch("/api/model", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const created = (await create.json().catch(() => ({}))) as {
    taskId?: string;
    error?: string;
  };
  if (!create.ok || !created.taskId) {
    throw new Error(created.error || "Tripo could not start the 3D job.");
  }

  const started = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(`/api/model?id=${encodeURIComponent(created.taskId)}`);
    const json = (await res.json().catch(() => ({}))) as {
      status?: string;
      progress?: number;
      url?: string | null;
      error?: string;
    };
    if (!res.ok || json.error) throw new Error(json.error || "Tripo status check failed.");
    onProgress?.(json.progress ?? 0);
    if (json.status === "success" && json.url) return json.url;
    if (["failed", "cancelled", "banned", "expired", "unknown"].includes(json.status ?? ""))
      throw new Error(`Tripo job ${json.status}.`);
    if (Date.now() - started > 8 * 60 * 1000) throw new Error("Tripo job timed out.");
  }
}

