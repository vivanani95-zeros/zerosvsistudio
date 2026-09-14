type ImagePart = { inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } };

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1";
const IMAGE_MODELS = ["gemini-3.1-flash-image", "gemini-2.5-flash-image", "gemini-3-pro-image"];

function keys() {
  return (process.env.GEMINI_API_KEYS ?? "").split(",").map((v) => v.trim()).filter(Boolean);
}

function timeoutFetch(url: string, init: RequestInit, ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function findImageData(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (typeof child === "string") {
      if ((key === "b64_json" || key === "data") && child.length > 1000 && /^[A-Za-z0-9+/=]+$/.test(child)) {
        return `data:image/png;base64,${child}`;
      }
      if (child.startsWith("data:image/")) return child;
      if (/^https?:\/\//i.test(child) && /\.(png|jpe?g|webp)(\?|$)/i.test(child)) return child;
    } else if (child && typeof child === "object") {
      const found = findImageData(child);
      if (found) return found;
    }
  }
  return null;
}

async function toDataUrl(source: string): Promise<string | null> {
  if (source.startsWith("data:image/")) return source;
  if (!/^https?:\/\//i.test(source)) return null;
  const res = await timeoutFetch(source, { headers: { Accept: "image/*" } }, 20000).catch(() => null);
  if (!res?.ok) return null;
  const type = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  if (!type.startsWith("image/")) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
  return `data:${type};base64,${btoa(binary)}`;
}

export async function generateStudioImage(prompt: string): Promise<{ dataUrl: string; model: string } | null> {
  const apiKeys = keys();
  if (!apiKeys.length) return null;

  for (const model of IMAGE_MODELS) {
    for (const key of apiKeys) {
      try {
        const response = await timeoutFetch(
          `${GEMINI_BASE}/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: {
                responseModalities: ["IMAGE"],
                responseFormat: { image: { aspectRatio: "16:9", imageSize: "2K" } },
                thinkingConfig: { thinkingLevel: "high", includeThoughts: false },
              },
            }),
          },
          90000,
        );
        if (!response.ok) continue;
        const json = await response.json().catch(() => null);
        const parts = ((json as { candidates?: { content?: { parts?: ImagePart[] } }[] } | null)?.candidates?.[0]?.content?.parts ?? []);
        for (const part of parts) {
          const data = part.inlineData?.data ?? part.inline_data?.data;
          const mime = part.inlineData?.mimeType ?? part.inline_data?.mime_type ?? "image/png";
          if (data && data.length > 1000) return { dataUrl: `data:${mime};base64,${data}`, model };
        }
        const discovered = findImageData(json);
        if (discovered) {
          const dataUrl = await toDataUrl(discovered);
          if (dataUrl) return { dataUrl, model };
        }
      } catch {
        // Rotate to the next model/key instead of surfacing an opaque provider error.
      }
    }
  }

  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) return null;
  const response = await timeoutFetch(
    "https://ai.gateway.lovable.dev/v1/images/generations",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-3.1-flash-image", prompt, size: "1536x864", response_format: "b64_json" }),
    },
    90000,
  ).catch(() => null);
  if (!response?.ok) return null;
  const json = await response.json().catch(() => null);
  const discovered = findImageData(json);
  if (!discovered) return null;
  const dataUrl = await toDataUrl(discovered);
  return dataUrl ? { dataUrl, model: "lovable/gemini-3.1-flash-image" } : null;
}
