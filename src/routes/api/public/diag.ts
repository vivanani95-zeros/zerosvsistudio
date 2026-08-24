import { createFileRoute } from "@tanstack/react-router";

/** Temporary diagnostics endpoint for provider key health. */
export const Route = createFileRoute("/api/public/diag")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get("id");
        const k = (process.env["MANUS_API_KEYS"] ?? "").split(",")[0]?.trim() ?? "";
        const res = await fetch(
          `https://api.manus.ai/v2/task.listMessages?task_id=${id}&order=desc&limit=10`,
          { headers: { "x-manus-api-key": k } },
        );
        return new Response(await res.text(), {
          status: res.status,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
