import type { ZeroMode } from "./zeros";

export type Msg = { role: "user" | "assistant"; content: string };

export async function streamChat(messages: Msg[], mode: ZeroMode, memories: string[], onDelta: (full: string) => void, signal?: AbortSignal): Promise<string> {
  const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages, mode, memories }), signal: signal ?? null });
  if (!res.ok || !res.body) throw new Error((await res.text().catch(() => "")) || `Error ${res.status}`);
  const reader = res.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let full = "";
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buffer += decoder.decode(value, { stream: true }); const parts = buffer.split("\n"); buffer = parts.pop() ?? "";
    for (const line of parts) { const t = line.trim(); if (!t.startsWith("data:")) continue; const payload = t.slice(5).trim(); if (!payload || payload === "[DONE]") continue; try { const json = JSON.parse(payload); const delta = json?.choices?.[0]?.delta?.content; if (typeof delta === "string" && delta) { full += delta; onDelta(full); } } catch {} }
  }
  buffer += decoder.decode(); const trailing = buffer.trim();
  if (trailing.startsWith("data:")) { const payload = trailing.slice(5).trim(); if (payload && payload !== "[DONE]") { try { const json = JSON.parse(payload); const delta = json?.choices?.[0]?.delta?.content; if (typeof delta === "string" && delta) { full += delta; onDelta(full); } } catch {} } }
  if (!full.trim()) throw new Error("Zeros received an empty generation. Please try again.");
  return full;
}

function findB64(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v === "string") { if (k === "b64_json" && v.length > 100) return `data:image/png;base64,${v}`; if (v.startsWith("data:image/")) return v; }
    else if (v && typeof v === "object") { const found = findB64(v); if (found) return found; }
  }
  return null;
}

export async function generateImage(prompt: string): Promise<string> {
  const res = await fetch("/api/generate-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, stream: false }) });
  if (!res.ok) throw new Error((await res.text().catch(() => "")) || `Error ${res.status}`);
  const img = findB64(await res.json()); if (!img) throw new Error("The image studio returned no image. Try again."); return img;
}

type ModelStatus = { status?: string; progress?: number; url?: string | null; previewUrl?: string | null; nextTaskId?: string; error?: string };
type ModelReview = { score?: number; passed?: boolean; issues?: string[]; improvedPrompt?: string };

async function createModelTask(prompt: string): Promise<string> {
  const create = await fetch("/api/model", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", prompt }) });
  const created = (await create.json().catch(() => ({}))) as { taskId?: string; error?: string };
  if (!create.ok || !created.taskId) throw new Error(created.error || "3D generation could not start.");
  return created.taskId;
}

async function waitForModel(initialTaskId: string, onProgress?: (pct: number) => void): Promise<{ url: string; previewUrl?: string }> {
  const started = Date.now(); let taskId = initialTaskId;
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(`/api/model?id=${encodeURIComponent(taskId)}`); const json = (await res.json().catch(() => ({}))) as ModelStatus;
    if (!res.ok || json.error) throw new Error(json.error || "3D status check failed.");
    if (json.nextTaskId) taskId = json.nextTaskId;
    onProgress?.(json.progress ?? 0);
    if (json.status === "success" && json.url) return { url: json.url, ...(json.previewUrl ? { previewUrl: json.previewUrl } : {}) };
    if (["failed", "cancelled", "banned", "expired", "unknown"].includes(json.status ?? "")) throw new Error(`3D job ${json.status}.`);
    if (Date.now() - started > 20 * 60 * 1000) throw new Error("3D job timed out after 20 minutes.");
  }
}

async function reviewModel(originalPrompt: string, previewUrl: string): Promise<ModelReview | null> {
  const res = await fetch("/api/model", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "review", prompt: originalPrompt, previewUrl }) });
  if (!res.ok) return null; const json = (await res.json().catch(() => ({}))) as { review?: ModelReview | null }; return json.review ?? null;
}

/** Generate -> inspect -> repair -> regenerate until the strict 10/10 production gate passes. */
export async function generateModel(prompt: string, onProgress?: (pct: number) => void): Promise<string> {
  const MAX_PASSES = 12; const originalPrompt = prompt.trim(); let workingPrompt = originalPrompt; let best: { url: string; score: number } | null = null;
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const taskId = await createModelTask(workingPrompt);
    const result = await waitForModel(taskId, (taskPct) => { const overall = ((pass + Math.max(0, Math.min(100, taskPct)) / 100) / MAX_PASSES) * 100; onProgress?.(Math.min(98, overall)); });
    if (!result.previewUrl) throw new Error("Zeros could not inspect the generated model preview.");
    const review = await reviewModel(originalPrompt, result.previewUrl);
    if (!review) throw new Error("Zeros could not complete the model quality inspection. Please try again.");
    const score = typeof review.score === "number" ? review.score : 0;
    if (!best || score > best.score) best = { url: result.url, score };
    if (review.passed && score === 10) { onProgress?.(100); return result.url; }
    const repair = review.improvedPrompt?.trim() || originalPrompt; const issues = (review.issues ?? []).filter(Boolean).join("; ");
    workingPrompt = `${repair}. Preserve the original request exactly. ${issues ? `Repair every QA failure: ${issues}.` : "Increase geometric, material, topology, and visual fidelity until it passes the zero-tolerance production gate."}`.slice(0, 1024);
  }
  throw new Error(best ? "Zeros generated multiple model revisions but none passed the 10/10 production gate. Please retry for another set of generations." : "Zeros Studio could not produce a reviewable 3D model.");
}
