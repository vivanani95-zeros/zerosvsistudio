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
      } catch {}
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
      } catch {}
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

type PollinationsCandidate = { url: string; model: string };

type PollinationsResponse = {
  image?: string;
  candidates?: PollinationsCandidate[];
  model?: string;
  error?: string;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function probeImage(url: string, timeoutMs = 40_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      image.src = "";
      reject(new Error("image request timed out"));
    }, timeoutMs);

    image.onload = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(url);
    };
    image.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(new Error("image request failed"));
    };
    image.src = url;
  });
}

export async function generateImage(prompt: string): Promise<string> {
  const res = await fetch("/api/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, stream: false }),
  });
  const json = (await res.json().catch(() => ({}))) as PollinationsResponse;
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`);

  // Authenticated server path returns a data URL.
  const img = findB64(json);
  if (img) return img;
  if (json.image?.startsWith("data:image/")) return json.image;

  const candidates = Array.isArray(json.candidates) ? json.candidates : [];
  if (!candidates.length) throw new Error("Pollinations returned no image candidates. Try again.");

  // Anonymous Pollinations is intentionally attempted in the user's browser.
  // A Cloudflare Worker/server request shares proxy IPs and can hit the global
  // anonymous one-request queue even when the user has never generated anything.
  const failures: string[] = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (!candidate?.url) continue;
    if (index > 0) await wait(5_500);
    try {
      return await probeImage(candidate.url);
    } catch (error) {
      failures.push(`${candidate.model}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }

  throw new Error(
    `Pollinations could not render an image after trying ${candidates.length} free models. ${failures.slice(-5).join(" | ")}`,
  );
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
