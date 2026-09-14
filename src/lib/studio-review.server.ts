import {
  GEMINI_TEXT_FALLBACKS,
  GEMINI_TEXT_MODEL,
  geminiKeys,
} from "@/lib/providers.server";

export type StudioReview = {
  score: number;
  passed: boolean;
  issues: string[];
  improvedPrompt: string;
};

type GeminiPart = { text?: string };

const visionModels = [GEMINI_TEXT_MODEL, ...GEMINI_TEXT_FALLBACKS];

function clampPrompt(prompt: string, max = 1024) {
  return prompt.replace(/\s+/g, " ").trim().slice(0, max);
}

function parseDataUrl(source: string): { mimeType: string; data: string } | null {
  const match = source.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (!match?.[1] || !match[2]) return null;
  return { mimeType: match[1], data: match[2] };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

async function imageToInlineData(source: string) {
  const direct = parseDataUrl(source);
  if (direct) return direct;
  if (!/^https?:\/\//i.test(source)) return null;

  const res = await fetch(source, {
    headers: { Accept: "image/*" },
  }).catch(() => null);
  if (!res?.ok) return null;

  const contentType = res.headers.get("content-type")?.split(";")[0]?.trim();
  if (!contentType?.startsWith("image/")) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.length) return null;
  return {
    mimeType: contentType,
    data: bytesToBase64(bytes),
  };
}

function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function normalizeReview(raw: Record<string, unknown> | null, originalPrompt: string): StudioReview | null {
  if (!raw) return null;
  const scoreValue = typeof raw["score"] === "number" ? raw["score"] : Number(raw["score"]);
  if (!Number.isFinite(scoreValue)) return null;
  const score = Math.max(0, Math.min(10, scoreValue));
  const issues = Array.isArray(raw["issues"])
    ? raw["issues"].filter((v): v is string => typeof v === "string").slice(0, 8)
    : [];
  const improvedPrompt = clampPrompt(
    typeof raw["improvedPrompt"] === "string" && raw["improvedPrompt"].trim()
      ? raw["improvedPrompt"]
      : originalPrompt,
  );
  const explicitPassed = typeof raw["passed"] === "boolean" ? raw["passed"] : score >= 8.5;
  return {
    score,
    passed: explicitPassed && score >= 8.5,
    issues,
    improvedPrompt,
  };
}

/**
 * Zeros' visual QA pass. The generated image / rendered 3D preview is shown to
 * a vision model, scored against the original request, and converted into a
 * concrete repair prompt when it misses production quality.
 */
export async function reviewVisual(
  kind: "image" | "model",
  originalPrompt: string,
  visualSource: string,
): Promise<StudioReview | null> {
  const inline = await imageToInlineData(visualSource);
  if (!inline) return null;

  const rubric =
    kind === "model"
      ? "Judge the rendered 3D asset for silhouette, proportions, completeness, symmetry where appropriate, visible mesh defects, floating/intersecting parts, material quality, texture consistency, and faithfulness to the request."
      : "Judge the image for composition, anatomy/geometry, coherence, lighting, detail, text artifacts, duplicated or malformed objects, and faithfulness to the request.";

  const instruction = `You are the final production QA artist inside Zeros Studio. ${rubric}\n\nOriginal request: ${clampPrompt(originalPrompt)}\n\nReturn ONLY strict JSON with this exact shape:\n{"score": number from 0 to 10, "passed": boolean, "issues": [short strings], "improvedPrompt": "a rewritten generation prompt that fixes every issue while preserving the user's intent"}\n\nPassing requires a score of at least 8.5/10 and no obvious production-blocking defect. Be demanding, specific, and visual. Do not praise the work.`;

  for (const model of visionModels) {
    for (const key of geminiKeys()) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [
                    { text: instruction },
                    { inlineData: inline },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0.15,
                maxOutputTokens: 2048,
                responseMimeType: "application/json",
              },
            }),
          },
        );
        if (!res.ok) continue;
        const json = (await res.json().catch(() => null)) as {
          candidates?: { content?: { parts?: GeminiPart[] } }[];
        } | null;
        const text = (json?.candidates?.[0]?.content?.parts ?? [])
          .map((p) => p.text ?? "")
          .join("")
          .trim();
        const review = normalizeReview(extractJson(text), originalPrompt);
        if (review) return review;
      } catch {
        // Rotate to the next key/model. QA failure must never destroy a usable render.
      }
    }
  }

  return null;
}

export function productionImagePrompt(prompt: string, issues: string[] = []) {
  const repairs = issues.length ? ` Fix these observed defects: ${issues.join("; ")}.` : "";
  return clampPrompt(
    `${prompt}. Create this as a finished production-quality image with deliberate composition, clean geometry/anatomy, coherent lighting, high material detail, strong subject separation, no malformed duplicates, no accidental text, no watermark, and no unfinished areas.${repairs}`,
    1500,
  );
}

export function productionModelPrompt(prompt: string, issues: string[] = []) {
  const repairs = issues.length ? ` Correct these visible defects: ${issues.join("; ")}.` : "";
  return clampPrompt(
    `${prompt}. Production-ready 3D asset: accurate real-world proportions, complete silhouette from every angle, watertight-looking coherent geometry, no floating or intersecting pieces, intentional symmetry, clean topology appearance, crisp PBR materials, detailed textures, physically plausible construction, studio-ready presentation.${repairs}`,
    1024,
  );
}
