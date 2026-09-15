import { createFileRoute } from "@tanstack/react-router";

const MAX_PROMPT = 800;

type EngineJob = {
  id?: string;
  status?: string;
  progress?: number;
  phase?: string;
  error?: string;
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
       * Starts a REAL 3D AI generation job on Zeros' own GPU inference service.
       * No Meshy/Tripo generation API is involved.
       */
      POST: async ({ request }) => {
        try {
          const { prompt } = (await request.json()) as { prompt?: string };
          const cleanPrompt = prompt?.trim();
          if (!cleanPrompt) return Response.json({ error: "Prompt required" }, { status: 400 });

          const { base, token } = engineConfig();
          const res = await fetch(`${base}/generate`, {
            method: "POST",
            headers: headers(token),
            body: JSON.stringify({ prompt: cleanPrompt.slice(0, MAX_PROMPT) }),
          });
          const json = (await res.json().catch(() => ({}))) as EngineJob;
          if (!res.ok || !json.id) {
            return Response.json(
              { error: json.error || `Zeros 3D engine returned HTTP ${res.status}.` },
              { status: res.status || 502 },
            );
          }

          return Response.json({ taskId: publicTaskId(json.id) });
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

          // The viewer asks for the actual GLB only after the generation job succeeds.
          // Stream it through the app so the GPU host does not need to expose its
          // filesystem or a second public frontend.
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
