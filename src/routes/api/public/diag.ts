import { createFileRoute } from "@tanstack/react-router";

/** Temporary diagnostics endpoint for provider key health. */
export const Route = createFileRoute("/api/public/diag")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get("id") ?? "";
        const keys = (process.env["MANUS_API_KEYS"] ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const out: unknown[] = [];
        for (const [i, k] of keys.entries()) {
          const H = { "x-manus-api-key": k };
          const list = await fetch("https://api.manus.ai/v2/task.list?limit=3", { headers: H });
          const detail = await fetch(`https://api.manus.ai/v2/task.detail?task_id=${id}`, {
            headers: H,
          });
          out.push({
            i,
            list: (await list.text()).slice(0, 300),
            detail: (await detail.text()).slice(0, 300),
          });
        }
        return Response.json(out);
      },
    },
  },
});
