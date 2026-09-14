import { createFileRoute } from "@tanstack/react-router";
import {
  productionModelPrompt,
  reviewVisual,
} from "@/lib/studio-review.server";

const TRIPO = "https://openapi.tripo3d.ai/v3";
const MODEL_VERSION = "v3.1-20260211";

type TripoTask = {
  code: number;
  message?: string;
  data?: {
    task_id?: string;
    status?: string;
    progress?: number;
    output?: Record<string, unknown>;
    result?: Record<string, unknown>;
  };
};

function pickUrl(data: TripoTask["data"], keys: string[]): string | null {
  const pools = [data?.output, data?.result].filter(Boolean) as Record<string, unknown>[];
  for (const pool of pools) {
    for (const key of keys) {
      const value = pool[key];
      if (typeof value === "string" && value.startsWith("http")) return value;
      if (value && typeof value === "object") {
        const url = (value as Record<string, unknown>)["url"];
        if (typeof url === "string" && url.startsWith("http")) return url;
      }
    }
  }
  return null;
}

function pickModelUrl(data: TripoTask["data"]): string | null {
  return pickUrl(data, ["model_url", "pbr_model", "model", "base_model"]);
}

function pickPreviewUrl(data: TripoTask["data"]): string | null {
  return pickUrl(data, ["rendered_image_url", "preview_url", "image_url", "rendered_image"]);
}

export const Route = createFileRoute("/api/model")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["TRIPO_API_KEY"];
        if (!key) return Response.json({ error: "Missing Tripo key" }, { status: 500 });

        const body = (await request.json()) as {
          prompt?: string;
          action?: "create" | "review";
          previewUrl?: string;
        };
        const prompt = body.prompt?.trim();
        if (!prompt) return Response.json({ error: "Prompt required" }, { status: 400 });

        if (body.action === "review") {
          if (!body.previewUrl)
            return Response.json({ error: "previewUrl required" }, { status: 400 });
          const review = await reviewVisual("model", prompt, body.previewUrl);
          return Response.json({ review });
        }

        const productionPrompt = productionModelPrompt(prompt);
        const res = await fetch(`${TRIPO}/generation/text-to-model`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: productionPrompt,
            negative_prompt:
              "broken mesh, holes, floating parts, intersecting geometry, melted details, deformed proportions, duplicate limbs, missing components, blurry textures, low detail",
            model: MODEL_VERSION,
            texture: true,
            pbr: true,
            texture_quality: "extreme",
            geometry_quality: "detailed",
            face_limit: 80000,
            auto_size: true,
            smart_low_poly: false,
            export_uv: true,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as TripoTask;
        if (!res.ok || json.code !== 0 || !json.data?.task_id) {
          return Response.json({
            error: json.message ?? "Tripo could not start the model job",
            code: json.code ?? res.status,
          });
        }

        return Response.json({ taskId: json.data.task_id });
      },

      GET: async ({ request }) => {
        const key = process.env["TRIPO_API_KEY"];
        if (!key) return Response.json({ error: "Missing Tripo key" }, { status: 500 });
        const id = new URL(request.url).searchParams.get("id");
        if (!id) return Response.json({ error: "id required" }, { status: 400 });

        const res = await fetch(`${TRIPO}/tasks/${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${key}` },
        });
        const json = (await res.json().catch(() => ({}))) as TripoTask;
        if (!res.ok || json.code !== 0) {
          return Response.json({ error: json.message ?? "Tripo status failed" });
        }

        return Response.json({
          status: json.data?.status ?? "unknown",
          progress: json.data?.progress ?? 0,
          url: pickModelUrl(json.data),
          previewUrl: pickPreviewUrl(json.data),
        });
      },
    },
  },
});
