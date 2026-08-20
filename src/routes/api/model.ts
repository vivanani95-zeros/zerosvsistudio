import { createFileRoute } from "@tanstack/react-router";

const TRIPO = "https://api.tripo3d.ai/v2/openapi";

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

function pickModelUrl(data: TripoTask["data"]): string | null {
  const pools = [data?.output, data?.result].filter(Boolean) as Record<
    string,
    unknown
  >[];
  for (const pool of pools) {
    for (const key of ["pbr_model", "model", "base_model"]) {
      const v = pool[key];
      if (typeof v === "string" && v.startsWith("http")) return v;
      if (v && typeof v === "object") {
        const url = (v as Record<string, unknown>)["url"];
        if (typeof url === "string" && url.startsWith("http")) return url;
      }
    }
  }
  return null;
}

export const Route = createFileRoute("/api/model")({
  server: {
    handlers: {
      // Create a Tripo AI text-to-3D task
      POST: async ({ request }) => {
        const key = process.env["TRIPO_API_KEY"];
        if (!key) return Response.json({ error: "Missing Tripo key" }, { status: 500 });

        const { prompt } = (await request.json()) as { prompt?: string };
        if (!prompt?.trim())
          return Response.json({ error: "Prompt required" }, { status: 400 });

        const res = await fetch(`${TRIPO}/task`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "text_to_model",
            prompt: prompt.slice(0, 900),
            model_version: "v2.5-20250123",
            texture: true,
            pbr: true,
            texture_quality: "detailed",
          }),
        });
        const json = (await res.json().catch(() => ({}))) as TripoTask;
        if (!res.ok || json.code !== 0 || !json.data?.task_id) {
          // Soft-fail with 200 so the client can fall back to hand-sculpting
          // instead of surfacing a 502 runtime error.
          return Response.json({
            error: json.message ?? "Tripo could not start the model job",
            code: json.code ?? res.status,
          });
        }

        return Response.json({ taskId: json.data.task_id });
      },

      // Poll a task
      GET: async ({ request }) => {
        const key = process.env["TRIPO_API_KEY"];
        if (!key) return Response.json({ error: "Missing Tripo key" }, { status: 500 });
        const id = new URL(request.url).searchParams.get("id");
        if (!id) return Response.json({ error: "id required" }, { status: 400 });

        const res = await fetch(`${TRIPO}/task/${id}`, {
          headers: { Authorization: `Bearer ${key}` },
        });
        const json = (await res.json().catch(() => ({}))) as TripoTask;
        if (!res.ok || json.code !== 0) {
          return Response.json(
            { error: json.message ?? "Tripo status failed" },
            { status: 502 },
          );
        }
        return Response.json({
          status: json.data?.status ?? "unknown",
          progress: json.data?.progress ?? 0,
          url: pickModelUrl(json.data),
        });
      },
    },
  },
});
