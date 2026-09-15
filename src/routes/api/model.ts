import { createFileRoute } from "@tanstack/react-router";

const MESHY = "https://api.meshy.ai/openapi/v2/text-to-3d";
const MESHY_MODEL = "meshy-6";

type MeshyTask = {
  id?: string;
  status?: string;
  progress?: number;
  model_urls?: { glb?: string };
  task_error?: { message?: string };
};

function errorMessage(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object") return fallback;
  const obj = value as Record<string, unknown>;
  const nested = obj.error;
  if (nested && typeof nested === "object") {
    const message = (nested as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (typeof obj.message === "string" && obj.message.trim()) return obj.message;
  return fallback;
}

async function meshyFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const key = process.env["MESHY_API_KEY"];
  if (!key) throw new Error("Missing MESHY_API_KEY secret.");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${key}`);
  headers.set("Content-Type", "application/json");
  return fetch(`${MESHY}${path}`, { ...init, headers });
}

async function getTask(id: string): Promise<MeshyTask> {
  const res = await meshyFetch(`/${encodeURIComponent(id)}`, { method: "GET" });
  const json = (await res.json().catch(() => ({}))) as MeshyTask & Record<string, unknown>;
  if (!res.ok) throw new Error(errorMessage(json, `Meshy returned HTTP ${res.status}.`));
  return json;
}

async function createRefine(previewId: string): Promise<string> {
  const res = await meshyFetch("", {
    method: "POST",
    body: JSON.stringify({
      mode: "refine",
      preview_task_id: previewId,
      ai_model: MESHY_MODEL,
      enable_pbr: true,
      texture_resolution: "4k",
      remove_lighting: true,
      target_formats: ["glb"],
      auto_size: true,
      origin_at: "bottom",
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { result?: string } & Record<string, unknown>;
  if (!res.ok || !json.result) {
    throw new Error(errorMessage(json, `Meshy texture refinement failed (HTTP ${res.status}).`));
  }
  return json.result;
}

export const Route = createFileRoute("/api/model")({
  server: {
    handlers: {
      // Real AI 3D generation: Meshy 6 preview -> Meshy 6 PBR refine -> signed GLB URL.
      POST: async ({ request }) => {
        try {
          const { prompt } = (await request.json()) as { prompt?: string };
          const cleanPrompt = prompt?.trim();
          if (!cleanPrompt) return Response.json({ error: "Prompt required" }, { status: 400 });

          const res = await meshyFetch("", {
            method: "POST",
            body: JSON.stringify({
              mode: "preview",
              prompt: cleanPrompt.slice(0, 600),
              model_type: "standard",
              ai_model: MESHY_MODEL,
              should_remesh: false,
              target_formats: ["glb"],
              auto_size: true,
              origin_at: "bottom",
              moderation: true,
            }),
          });
          const json = (await res.json().catch(() => ({}))) as { result?: string } & Record<string, unknown>;
          if (!res.ok || !json.result) {
            return Response.json(
              { error: errorMessage(json, `Meshy 6 could not start the model job (HTTP ${res.status}).`) },
              { status: res.status || 502 },
            );
          }

          return Response.json({ taskId: `meshy-preview.${json.result}` });
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "Meshy 6 could not start the model job." },
            { status: 500 },
          );
        }
      },

      // Poll either the Meshy preview or refine phase. The phase transition is encoded
      // in taskId so this remains stateless and works correctly on Cloudflare workers.
      GET: async ({ request }) => {
        try {
          const id = new URL(request.url).searchParams.get("id") ?? "";
          const separator = id.indexOf(".");
          const phase = separator > 0 ? id.slice(0, separator) : "";
          const taskId = separator > 0 ? id.slice(separator + 1) : id;
          if (!taskId || !["meshy-preview", "meshy-refine"].includes(phase)) {
            return Response.json({ error: "Invalid Meshy task id" }, { status: 400 });
          }

          const task = await getTask(taskId);
          const status = task.status ?? "PENDING";
          const rawProgress = Math.max(0, Math.min(100, task.progress ?? 0));

          if (status === "FAILED" || status === "CANCELED") {
            return Response.json({
              status: status.toLowerCase(),
              progress: phase === "meshy-preview" ? Math.round(rawProgress / 2) : 50 + Math.round(rawProgress / 2),
              error: task.task_error?.message || `Meshy 6 task ${status.toLowerCase()}.`,
            });
          }

          if (phase === "meshy-preview") {
            if (status === "SUCCEEDED") {
              const refineId = await createRefine(taskId);
              return Response.json({
                status: "in_progress",
                progress: 50,
                taskId: `meshy-refine.${refineId}`,
                phase: "texturing",
              });
            }

            return Response.json({
              status: status.toLowerCase(),
              progress: Math.round(rawProgress / 2),
              phase: "geometry",
            });
          }

          if (status === "SUCCEEDED" && task.model_urls?.glb) {
            return Response.json({
              status: "success",
              progress: 100,
              url: task.model_urls.glb,
              phase: "complete",
            });
          }

          return Response.json({
            status: status.toLowerCase(),
            progress: 50 + Math.round(rawProgress / 2),
            phase: "texturing",
          });
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "Meshy 6 status check failed." },
            { status: 500 },
          );
        }
      },
    },
  },
});
