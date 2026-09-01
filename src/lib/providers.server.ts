/**
 * Server-only provider pool for Zeros.
 *
 * Fallback order (text):
 *   Manus keys 1..6 (API v2)  ->  Gemini keys 1..5  ->  Lovable AI Gateway
 *   ->  Groq keys 1..5 on gpt-oss-120b  ->  Groq keys 1..5 on the small model.
 *
 * Keys live in backend secrets and are never sent to the browser.
 */

export type Msg = { role: "user" | "assistant"; content: string };

const MANUS_BASE = "https://api.manus.ai/v2";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GROQ_BASE = "https://api.groq.com/openai/v1";

export const GEMINI_TEXT_MODEL = "gemini-3.7-flash";
export const GEMINI_TEXT_FALLBACKS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash"];
export const GEMINI_IMAGE_MODELS = [
  "gemini-3.1-flash-image",
  "gemini-2.5-flash-image",
  "gemini-3-pro-image",
];
export const GEMINI_TTS_MODELS = ["gemini-2.5-flash-preview-tts", "gemini-3.1-flash-tts-preview"];

export const GROQ_PRIMARY_MODEL = "openai/gpt-oss-120b";
/** Small/fast tier. `llama-3.1-8b-instant` first, then whatever Groq still serves. */
export const GROQ_SMALL_MODELS = ["llama-3.1-8b-instant", "openai/gpt-oss-20b"];

function splitKeys(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const manusKeys = () => splitKeys("MANUS_API_KEYS");
export const geminiKeys = () => splitKeys("GEMINI_API_KEYS");
export const groqKeys = () => splitKeys("GROQ_API_KEYS");


/** fetch that aborts if response headers don't arrive in time (stream-safe). */
async function fetchHeaders(
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ Manus */

type ManusEvent = {
  type?: string;
  assistant_message?: { content?: string };
  error_message?: { content?: string };
  status_update?: { agent_status?: string };
};

async function manusPoll(key: string, id: string, deadline: number): Promise<string | null> {
  let last = "";
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2500));
    const res = await fetch(
      `${MANUS_BASE}/task.listMessages?task_id=${encodeURIComponent(id)}&order=asc&limit=100`,
      { headers: { "x-manus-api-key": key } },
    ).catch(() => null);
    if (!res || !res.ok) continue;
    const json = (await res.json().catch(() => null)) as { messages?: ManusEvent[] } | null;
    const events = json?.messages ?? [];
    const text = events
      .filter((e) => e.type === "assistant_message")
      .map((e) => e.assistant_message?.content ?? "")
      .filter(Boolean)
      .join("\n\n")
      .trim();
    if (text) last = text;
    const status = [...events].reverse().find((e) => e.type === "status_update")?.status_update
      ?.agent_status;
    if (events.some((e) => e.type === "error_message")) return last || null;
    if (status === "stopped" || status === "finished") return last || null;
  }
  return last || null;
}

/** Tries every Manus key in order. Returns the reply text, or null if all fail. */
export async function manusChat(
  system: string,
  messages: Msg[],
  budgetMs = 60000,
): Promise<string | null> {
  const keys = manusKeys();
  if (!keys.length) return null;

  const convo = messages
    .map((m) => `${m.role === "user" ? "User" : "Zeros"}: ${m.content}`)
    .join("\n\n");
  const prompt =
    `${system}\n\nConversation so far:\n${convo}\n\n` +
    `Reply now as Zeros to the last user message. Answer directly in markdown — do not create ` +
    `files, do not build a report, do not describe what you are doing. Just the reply text.`;

  const deadline = Date.now() + budgetMs;
  for (const key of keys) {
    if (Date.now() > deadline - 6000) break;
    try {
      const res = await fetch(`${MANUS_BASE}/task.create`, {
        method: "POST",
        headers: { "x-manus-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: { content: prompt.slice(0, 16000) },
          mode: "speed",
          agent_profile: "manus-1.6-lite",
        }),
      });
      if (!res.ok) continue;
      const created = (await res.json().catch(() => ({}))) as { task_id?: string; ok?: boolean };
      if (!created.task_id) continue;
      const text = await manusPoll(key, created.task_id, deadline);
      if (text && text.length > 20) return text;
    } catch {
      /* next key */
    }
  }
  return null;
}

/* ----------------------------------------------------------------- Gemini */

type GeminiPart = { text?: string; inlineData?: { mimeType?: string; data?: string } };

function geminiBody(system: string, messages: Msg[]) {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    generationConfig: { temperature: 1, maxOutputTokens: 65536 },
  };
}

/** Streams from Gemini, trying every key then every fallback model. */
export async function geminiStream(
  system: string,
  messages: Msg[],
): Promise<ReadableStream<Uint8Array> | null> {
  const keys = geminiKeys();
  const models = [GEMINI_TEXT_MODEL, ...GEMINI_TEXT_FALLBACKS];
  for (const model of models) {
    for (const key of keys) {
      const res = await fetchHeaders(
        `${GEMINI_BASE}/models/${model}:streamGenerateContent?alt=sse`,
        {
          method: "POST",
          headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify(geminiBody(system, messages)),
        },
        20000,
      );
      if (!res || !res.ok || !res.body) continue;
      return toOpenAiSse(res.body);
    }
  }
  return null;
}

/** Rewrites a Gemini SSE stream into OpenAI chat-completion delta frames. */
function toOpenAiSse(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.enqueue(enc.encode("data: [DONE]\n\n"));
        controller.close();
        return;
      }
      buffer += dec.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload) as {
            candidates?: { content?: { parts?: GeminiPart[] } }[];
          };
          const text = (json.candidates?.[0]?.content?.parts ?? [])
            .map((p) => p.text ?? "")
            .join("");
          if (text) controller.enqueue(enc.encode(sseDelta(text)));
        } catch {
          /* partial frame */
        }
      }
    },
    cancel() {
      void reader.cancel();
    },
  });
}

export function sseDelta(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
}

/** Emits an already-complete answer as a stream of SSE deltas. */
export function textToSse(text: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const chunks = text.match(/[\s\S]{1,240}/g) ?? [text];
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) {
        controller.enqueue(enc.encode("data: [DONE]\n\n"));
        controller.close();
        return;
      }
      controller.enqueue(enc.encode(sseDelta(chunks[i++] ?? "")));
    },
  });
}

/** Lovable AI Gateway (no user key required). */
export async function lovableStream(
  system: string,
  messages: Msg[],
  model = "google/gemini-3.7-flash",
): Promise<ReadableStream<Uint8Array> | null> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return null;
  const res = await fetchHeaders(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [{ role: "system", content: system }, ...messages],
      }),
    },
    30000,
  );
  if (!res || !res.ok || !res.body) return null;
  return res.body;
}

/* ------------------------------------------------------------------- Groq */

async function groqTry(
  model: string,
  system: string,
  messages: Msg[],
): Promise<ReadableStream<Uint8Array> | null> {
  for (const key of groqKeys()) {
    const res = await fetchHeaders(
      `${GROQ_BASE}/chat/completions`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: true,
          temperature: 1,
          max_completion_tokens: 32768,
          messages: [{ role: "system", content: system }, ...messages],
        }),
      },
      25000,
    );
    if (res?.ok && res.body) return res.body;
  }
  return null;
}

/** Groq tier: gpt-oss-120b across all keys, then the small model across all keys. */
export async function groqStream(
  system: string,
  messages: Msg[],
): Promise<ReadableStream<Uint8Array> | null> {
  const primary = await groqTry(GROQ_PRIMARY_MODEL, system, messages);
  if (primary) return primary;
  for (const model of GROQ_SMALL_MODELS) {
    const small = await groqTry(model, system, messages);
    if (small) return small;
  }
  return null;
}

/** Non-streaming Groq completion (used for background jobs like song lyrics). */
export async function groqText(system: string, prompt: string): Promise<string | null> {
  for (const model of [GROQ_PRIMARY_MODEL, ...GROQ_SMALL_MODELS]) {
    for (const key of groqKeys()) {
      const res = await fetch(`${GROQ_BASE}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 1,
          max_completion_tokens: 16384,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
        }),
      }).catch(() => null);
      if (!res?.ok) continue;
      const json = (await res.json().catch(() => null)) as {
        choices?: { message?: { content?: string } }[];
      } | null;
      const text = json?.choices?.[0]?.message?.content?.trim();
      if (text) return text;
    }
  }
  return null;
}

/**
 * The full Zeros fallback chain, in the exact order the product requires.
 * Returns an OpenAI-shaped SSE stream, or null when literally everything failed.
 */
export async function zerosStream(
  system: string,
  messages: Msg[],
  opts: { manusBudgetMs?: number; skipManus?: boolean } = {},
): Promise<{ stream: ReadableStream<Uint8Array>; provider: string } | null> {
  if (!opts.skipManus) {
    const manus = await manusChat(system, messages, opts.manusBudgetMs ?? 60000);
    if (manus) return { stream: textToSse(manus), provider: "manus" };
  }

  const gemini = await geminiStream(system, messages);
  if (gemini) return { stream: gemini, provider: "gemini" };

  const lovable = await lovableStream(system, messages);
  if (lovable) return { stream: lovable, provider: "lovable" };

  const groq = await groqStream(system, messages);
  if (groq) return { stream: groq, provider: "groq" };

  return null;
}

/* ------------------------------------------------------------------ Image */

/** Generates an image, rotating Gemini keys/models, then the Lovable gateway. */
export async function generateImageDataUrl(prompt: string): Promise<string | null> {
  for (const model of GEMINI_IMAGE_MODELS) {
    for (const key of geminiKeys()) {
      try {
        const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
          method: "POST",
          headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ["IMAGE"] },
          }),
        });
        if (!res.ok) continue;
        const json = (await res.json()) as {
          candidates?: { content?: { parts?: GeminiPart[] } }[];
        };
        for (const p of json.candidates?.[0]?.content?.parts ?? []) {
          const d = p.inlineData?.data;
          if (d && d.length > 100) {
            return `data:${p.inlineData?.mimeType ?? "image/png"};base64,${d}`;
          }
        }
      } catch {
        /* next */
      }
    }
  }

  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return null;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-image",
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const json = await res.json().catch(() => null);
  return findB64(json);
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

/* -------------------------------------------------------------------- TTS */

/** Renders sung/spoken lyrics to raw 24kHz PCM (base64), rotating keys. */
export async function ttsPcmBase64(text: string, voice = "Kore"): Promise<string | null> {
  for (const model of GEMINI_TTS_MODELS) {
    for (const key of geminiKeys()) {
      try {
        const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
          method: "POST",
          headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
            },
          }),
        });
        if (!res.ok) continue;
        const json = (await res.json()) as {
          candidates?: { content?: { parts?: GeminiPart[] } }[];
        };
        for (const p of json.candidates?.[0]?.content?.parts ?? []) {
          const d = p.inlineData?.data;
          if (d && d.length > 1000) return d;
        }
      } catch {
        /* next */
      }
    }
  }
  return null;
}
