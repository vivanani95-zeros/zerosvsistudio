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

  const res = await fetch(source, { headers: { Accept: "image/*" } }).catch(() => null);
  if (!res?.ok) return null;
  const contentType = res.headers.get("content-type")?.split(";")[0]?.trim();
  if (!contentType?.startsWith("image/")) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.length) return null;
  return { mimeType: contentType, data: bytesToBase64(bytes) };
}

function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
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
  const scoreValue = typeof raw.score === "number" ? raw.score : Number(raw.score);
  if (!Number.isFinite(scoreValue)) return null;
  const score = Math.max(0, Math.min(10, scoreValue));
  const issues = Array.isArray(raw.issues)
    ? raw.issues.filter((v): v is string => typeof v === "string").slice(0, 12)
    : [];
  const improvedPrompt = clampPrompt(
    typeof raw.improvedPrompt === "string" && raw.improvedPrompt.trim()
      ? raw.improvedPrompt
      : originalPrompt,
  );

  // A production pass is intentionally strict: only an explicit 10/10 with
  // zero reported defects can terminate the model/image QA loop.
  return {
    score,
    passed: raw.passed === true && score === 10 && issues.length === 0,
    issues,
    improvedPrompt,
  };
}

export async function reviewVisual(
  kind: "image" | "model",
  originalPrompt: string,
  visualSource: string,
): Promise<StudioReview | null> {
  const inline = await imageToInlineData(visualSource);
  if (!inline) return null;

  const rubric =
    kind === "model"
      ? "Perform an extremely strict production asset inspection: silhouette and proportions from every visible angle, completeness of every requested component, symmetry where appropriate, topology/geometry defects, holes, cracks, non-manifold-looking areas, floating or intersecting parts, duplicated or missing components, warped surfaces, bad joins, texture stretching, UV/material defects, blurry or missing textures, lighting/material inconsistencies, and exact fidelity to the request. Treat even a small visible defect as a failure."
      : "Perform an extremely strict production image inspection: composition, subject identity, anatomy/geometry, object boundaries, symmetry where appropriate, lighting, materials, perspective, fine details, text, artifacts, duplicated/missing objects, malformed areas, unwanted marks, and exact fidelity to the request. Treat even a small visible defect as a failure.";

  const instruction = `You are the final zero-tolerance production QA gate inside Zeros Studio. ${rubric}\n\nOriginal request: ${clampPrompt(originalPrompt)}\n\nYou must inspect the supplied render, not merely trust the prompt. Return ONLY strict JSON:\n{"score": number from 0 to 10, "passed": boolean, "issues": [short strings], "improvedPrompt": "a rewritten generation prompt that fixes every detected issue while preserving the user's intent"}\n\nA pass is allowed ONLY when the result is genuinely production-ready, visually complete, faithful to the request, and you can identify ZERO visible defects: score must be exactly 10, passed must be true, and issues must be an empty array. If there is any visible uncertainty or defect, fail it and describe the repair. Be ruthless; do not praise or be generous.`;

  for (const model of visionModels) {
    for (const key of geminiKeys()) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: instruction }, { inlineData: inline }] }],
              generationConfig: {
                temperature: 0.05,
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
        // Rotate to the next vision model/key without destroying the current render.
      }
    }
  }
  return null;
}

export function productionImagePrompt(prompt: string, issues: string[] = []) {
  const repairs = issues.length ? ` Fix every observed defect: ${issues.join("; ")}.` : "";
  return clampPrompt(
    `${prompt}. Finished production-quality image. Exact subject fidelity, deliberate composition, clean anatomy and geometry, coherent perspective, physically consistent lighting and materials, sharp fine detail, no malformed or duplicated elements, no accidental text, no watermark, no unfinished areas.${repairs}`,
    1500,
  );
}

export function productionModelPrompt(prompt: string, issues: string[] = []) {
  const repairs = issues.length ? ` Correct every observed defect: ${issues.join("; ")}.` : "";
  return clampPrompt(
    `${prompt}. Create a Meshy-6-class production asset: maximum geometric fidelity, accurate proportions, complete silhouette from every angle, coherent watertight-looking geometry, clean joins, no floating/intersecting/missing parts, intentional symmetry, crisp high-detail PBR materials, consistent UV-quality textures, physically plausible construction, game-production-ready presentation.${repairs}`,
    1024,
  );
}
