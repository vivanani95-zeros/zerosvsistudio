import { createFileRoute } from "@tanstack/react-router";
import { productionModelPrompt, reviewVisual } from "@/lib/studio-review.server";

const TRIPO = "https://openapi.tripo3d.ai/v3";
const TRIPO_MODEL_VERSION = "v3.1-20260211";
const MESHY = "https://api.meshy.ai/openapi/v2/text-to-3d";

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

type MeshyTask = {
  id?: string;
  status?: string;
  progress?: number;
  model_urls?: { glb?: string; fbx?: string; obj?: string };
  thumbnail_url?: string;
  task_error?: { message?: string };
};

function pickUrl(data: TripoTask["data"], keys: string[]): string | null {
  const pools = [data?.output, data?.result].filter(Boolean) as Record<string, unknown>[];
  for (const pool of pools) {
    for (const key of keys) {
      const value = pool[key];
      if (typeof value === "string" && value.startsWith("http")) return value;
      if (value && typeof value === "object") {
        const url = (value as Record<string, unknown>).url;
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

async function createMeshyPreview(prompt: string, key: string) {
  const res = await fetch(MESHY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "preview",
      prompt: productionModelPrompt(prompt),
      ai_model: "meshy-6",
      model_type: "standard",
      should_remesh: false,
      topology: "triangle",
      target_formats: ["glb"],
      auto_size: true,
      origin_at: "bottom",
      alpha_thumbnail: true,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { result?: string; message?: string };
  if (!res.ok || !json.result) throw new Error(json.message || "Meshy 6 could not start.");
  return json.result;
}

async function createMeshyRefine(previewTaskId: string, prompt: string, key: string) {
  const res = await fetch(MESHY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "refine",
      preview_task_id: previewTaskId,
      ai_model: "meshy-6",
      enable_pbr: true,
      texture_resolution: "4k",
      remove_lighting: true,
      texture_prompt: productionModelPrompt(prompt).slice(0, 800),
      target_formats: ["glb"],
      auto_size: true,
      origin_at: "bottom",
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { result?: string; message?: string };
  if (!res.ok || !json.result) throw new Error(json.message || "Meshy 6 refinement could not start.");
  return json.result;
}

async function meshStatus(id: string, key: string) {
  const res = await fetch(`${MESHY}/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const json = (await res.json().catch(() => ({}))) as MeshyTask;
  if (!res.ok) throw new Error(json.task_error?.message || "Meshy status check failed.");
  return json;
}

export const Route = createFileRoute("/api/model")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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

        // Meshy 6 is the primary production path when its key is configured.
        const meshyKey = process.env["MESHY_API_KEY"];
        if (meshyKey) {
          try {
            const taskId = await createMeshyPreview(prompt, meshyKey);
            return Response.json({ taskId: `meshy-preview:${taskId}` });
          } catch {
            // Fall through to the existing Tripo production path.
          }
        }

        const key = process.env["TRIPO_API_KEY"];
        if (!key) return Response.json({ error: "Missing MESHY_API_KEY and TRIPO_API_KEY" }, { status: 500 });

        const res = await fetch(`${TRIPO}/generation/text-to-model`, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: productionModelPrompt(prompt),
            negative_prompt:
              "broken mesh, holes, floating parts, intersecting geometry, melted details, deformed proportions, duplicate parts, missing components, stretched UVs, blurry textures, low detail",
            model: TRIPO_MODEL_VERSION,
            texture: true,
            pbr: true,
            texture_quality: "extreme",
            geometry_quality: "detailed",
            face_limit: 100000,
            auto_size: true,
            smart_low_poly: false,
            export_uv: true,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as TripoTask;
        if (!res.ok || json.code !== 0 || !json.data?.task_id) {
          return Response.json({ error: json.message ?? "Tripo could not start the model job", code: json.code ?? res.status });
        }
        return Response.json({ taskId: `tripo:${json.data.task_id}` });
      },

      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get("id");
        if (!id) return Response.json({ error: "id required" }, { status: 400 });

        if (id.startsWith("meshy-preview:")) {
          const key = process.env["MESHY_API_KEY"];
          if (!key) return Response.json({ error: "Missing MESHY_API_KEY" }, { status: 500 });
          const taskId = id.slice("meshy-preview:".length);
          const task = await meshStatus(taskId, key);
          if (task.status === "SUCCEEDED") {
            try {
              const refineId = await createMeshyRefine(taskId, task.prompt ?? "", key);
              return Response.json({ status: "refining", progress: 55, nextTaskId: `meshy-refine:${refineId}` });
            } catch (error) {
              return Response.json({ error: error instanceof Error ? error.message : "Meshy refine failed" });
            }
          }
          if (["FAILED", "CANCELED"].includes(task.status ?? ""))
            return Response.json({ status: task.status?.toLowerCase(), error: task.task_error?.message });
          return Response.json({ status: task.status?.toLowerCase() ?? "processing", progress: task.progress ?? 0 });
        }

        if (id.startsWith("meshy-refine:")) {
          const key = process.env["MESHY_API_KEY"];
          if (!key) return Response.json({ error: "Missing MESHY_API_KEY" }, { status: 500 });
          const task = await meshStatus(id.slice("meshy-refine:".length), key);
          if (task.status === "SUCCEEDED" && task.model_urls?.glb) {
            return Response.json({ status: "success", progress: 100, url: task.model_urls.glb, previewUrl: task.thumbnail_url });
          }
          if (["FAILED", "CANCELED"].includes(task.status ?? ""))
            return Response.json({ status: task.status?.toLowerCase(), error: task.task_error?.message });
          return Response.json({ status: task.status?.toLowerCase() ?? "processing", progress: task.progress ?? 0 });
        }

        const key = process.env["TRIPO_API_KEY"];
        if (!key) return Response.json({ error: "Missing TRIPO_API_KEY" }, { status: 500 });
        const tripoId = id.startsWith("tripo:") ? id.slice("tripo:".length) : id;
        const res = await fetch(`${TRIPO}/tasks/${encodeURIComponent(tripoId)}`, { headers: { Authorization: `Bearer ${key}` } });
        const json = (await res.json().catch(() => ({}))) as TripoTask;
        if (!res.ok || json.code !== 0) return Response.json({ error: json.message ?? "Tripo status failed" });
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
