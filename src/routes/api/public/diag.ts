import { createFileRoute } from "@tanstack/react-router";

/** Temporary diagnostics endpoint for provider key health. */
export const Route = createFileRoute("/api/public/diag")({
  server: {
    handlers: {
      GET: async () => {
        const k = (process.env["MANUS_API_KEYS"] ?? "").split(",")[0]?.trim() ?? "";
        const H = { "x-manus-api-key": k, "Content-Type": "application/json" };
        const create = await fetch("https://api.manus.ai/v2/task.create", {
          method: "POST",
          headers: H,
          body: JSON.stringify({
            message: { content: "Reply with exactly: PONG" },
            mode: "speed",
            agent_profile: "manus-1.6-lite",
          }),
        });
        const created = (await create.json()) as { task_id?: string };
        const log: unknown[] = [{ created }];
        for (let i = 0; i < 8; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          const res = await fetch(
            `https://api.manus.ai/v2/task.listMessages?task_id=${created.task_id}&order=desc&limit=5`,
            { headers: { "x-manus-api-key": k } },
          );
          log.push({ i, status: res.status, body: (await res.text()).slice(0, 500) });
        }
        return Response.json(log);
      },
    },
  },
});
