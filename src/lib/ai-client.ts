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
