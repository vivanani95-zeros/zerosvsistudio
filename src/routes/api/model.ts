import { createFileRoute } from "@tanstack/react-router";

const MAX_PROMPT = 1200;
const GEMINI_MODEL = process.env["ZEROS_GEMINI_MODEL"]?.trim() || "gemini-3.1-pro-preview";

type EngineJob = {
  id?: string;
  status?: string;
  progress?: number;
  phase?: string;
  error?: string;
  quality?: Record<string, unknown>;
};

type GeminiBrief = {
  optimizedPrompt?: string;
  assetType?: string;
  geometryRequirements?: string[];
  materialRequirements?: string[];
  productionRequirements?: string[];
};

function engineConfig(): { base: string; token?: string } {
  const base = process.env["ZEROS_3D_ENGINE_URL"]?.trim().replace(/\/$/, "");
  if (!base) throw new Error("Missing ZEROS_3D_ENGINE_URL secret.");
  return {
    base,
    token: process.env["ZEROS_3D_ENGINE_TOKEN"]?.trim() || undefined,
  };
}

function headers(token?: string): Headers {
  const h = new Headers({ "Content-Type": "application/json" });
  if (token) h.set("Authorization", `Bearer ${token}`);
  return h;
}

function geminiKey(): string | undefined {
  return (
    process.env["GEMINI_API_KEY"]?.trim() ||
    process.env["GOOGLE_GEMINI_API_KEY"]?.trim() ||
    process.env["GOOGLE_API_KEY"]?.trim() ||
    undefined
  );
}

/**
 * Gemini is used only as a 3D art director: it expands the user's intent into
 * a detailed, structured asset brief. It never creates Three.js geometry and
 * never replaces the real GPU 3D generation pipeline.
 */
async function optimize3DBrief(prompt: string): Promise<string> {
  const key = geminiKey();
  if (!key) return prompt;

  const schema = {
    type: "object",
    properties: {
      optimizedPrompt: { type: "string" },
      assetType: { type: "string" },
      geometryRequirements: { type: "array", items: { type: "string" } },
      materialRequirements: { type: "array", items: { type: "string" } },
      productionRequirements: { type: "array", items: { type: "string" } },
    },
    required: ["optimizedPrompt", "assetType", "geometryRequirements", "materialRequirements", "productionRequirements"],
    additionalProperties: false,
  };

  const system = [
    "You are Zeros' senior cinematic 3D art director.",
    "Turn the user's short request into a precise production brief for a REAL neural text-to-3D generator.",
    "Do not write Three.js, Blender, Python, SVG, primitive assembly, or rendering code.",
    "Do not describe a fake 3D approximation.",
    "Focus on object identity, complete geometry, proportions, topology intent, surface detail, physically based materials, symmetry, functional components, silhouette, and production readiness.",
    "Preserve the user's requested subject. Do not add unrelated objects or a scene.",
    "Prefer a clean hero asset suitable for film/VFX/game production.",
  ].join(" ");

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: prompt.slice(0, MAX_PROMPT) }] }],
          generationConfig: {
            temperature: 0.35,
            responseMimeType: "application/json",
            responseSchema: schema,
          },
        }),
      },
    );

    if (!response.ok) return prompt;
    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return prompt;

    const brief = JSON.parse(text) as GeminiBrief;
    const sections = [
      brief.optimizedPrompt,
      brief.assetType ? `Asset type: ${brief.assetType}` : "",
      brief.geometryRequirements?.length ? `Geometry: ${brief.geometryRequirements.join("; ")}` : "",
      brief.materialRequirements?.length ? `Materials: ${brief.materialRequirements.join("; ")}` : "",
      brief.productionRequirements?.length ? `Production: ${brief.productionRequirements.join("; ")}` : "",
    ].filter(Boolean);

    return sections.join(" | ").slice(0, MAX_PROMPT);
  } catch {
    // The real 3D pipeline must remain available even if the optional director fails.
    return prompt;
  }
}

function jobIdFromTaskId(taskId: string): string | null {
  const prefix = "zeros-trellis.";
  return taskId.startsWith(prefix) ? taskId.slice(prefix.length) : null;
}

function publicTaskId(jobId: string): string {
  return `zeros-trellis.${jobId}`;
}

export const Route = createFileRoute("/api/model")({
  server: {
    handlers: {
      /**
       * Starts a REAL 3D AI generation job on Zeros' GPU inference service.
       * Gemini, when configured, only improves the asset brief; it never
       * generates the mesh. No Meshy/Tripo generation API is involved.
       */
      POST: async ({ request }) => {
        try {
          const { prompt } = (await request.json()) as { prompt?: string };
          const cleanPrompt = prompt?.trim();
          if (!cleanPrompt) return Response.json({ error: "Prompt required" }, { status: 400 });

          const optimizedPrompt = await optimize3DBrief(cleanPrompt);
          const { base, token } = engineConfig();
          const res = await fetch(`${base}/generate`, {
            method: "POST",
            headers: headers(token),
            body: JSON.stringify({ prompt: optimizedPrompt }),
          });
          const json = (await res.json().catch(() => ({}))) as EngineJob;
          if (!res.ok || !json.id) {
            return Response.json(
              { error: json.error || `Zeros 3D engine returned HTTP ${res.status}.` },
              { status: res.status || 502 },
            );
          }

          return Response.json({
            taskId: publicTaskId(json.id),
            artDirector: Boolean(geminiKey()),
            generation: "real-neural-3d",
          });
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "Zeros 3D engine could not start." },
            { status: 500 },
          );
        }
      },

      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const taskId = url.searchParams.get("id") ?? "";
          const jobId = jobIdFromTaskId(taskId);
          if (!jobId) return Response.json({ error: "Invalid Zeros 3D task id" }, { status: 400 });

          const { base, token } = engineConfig();

          if (url.searchParams.get("file") === "1") {
            const file = await fetch(`${base}/files/${encodeURIComponent(jobId)}.glb`, {
              headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            });
            if (!file.ok || !file.body) {
              return Response.json({ error: `Zeros 3D asset returned HTTP ${file.status}.` }, { status: file.status || 502 });
            }
            const responseHeaders = new Headers(file.headers);
            responseHeaders.set("Content-Type", "model/gltf-binary");
            responseHeaders.set("Cache-Control", "private, max-age=3600");
            return new Response(file.body, { status: 200, headers: responseHeaders });
          }

          const res = await fetch(`${base}/jobs/${encodeURIComponent(jobId)}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          });
          const json = (await res.json().catch(() => ({}))) as EngineJob;
          if (!res.ok) {
            return Response.json(
              { error: json.error || `Zeros 3D engine returned HTTP ${res.status}.` },
              { status: res.status || 502 },
            );
          }

          const status = (json.status ?? "queued").toLowerCase();
          const progress = Math.max(0, Math.min(100, Number(json.progress ?? 0)));

          if (status === "success" || status === "completed") {
            return Response.json({
              status: "success",
              progress: 100,
              phase: "complete",
              quality: json.quality,
              url: `/api/model?id=${encodeURIComponent(taskId)}&file=1`,
            });
          }

          if (["failed", "cancelled", "canceled", "expired"].includes(status)) {
            return Response.json({ status, progress, phase: json.phase, error: json.error || `Zeros 3D job ${status}.` });
          }

          return Response.json({
            status: status === "running" ? "in_progress" : status,
            progress,
            phase: json.phase || "generation",
            quality: json.quality,
            taskId,
          });
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "Zeros 3D status check failed." },
            { status: 500 },
          );
        }
      },
    },
  },
});
