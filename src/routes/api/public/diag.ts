import { createFileRoute } from "@tanstack/react-router";

/** Temporary diagnostics endpoint for provider key health. */
export const Route = createFileRoute("/api/public/diag")({
  server: {
    handlers: {
      GET: async () => {
        const keys = (process.env["MANUS_API_KEYS"] ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const k = keys[0] ?? "";
        const probe = async (
          label: string,
          url: string,
          init: RequestInit,
        ) => {
          const res = await fetch(url, init).catch(() => null);
          return {
            label,
            status: res?.status ?? 0,
            body: (await res?.text().catch(() => ""))?.slice(0, 400),
          };
        };
        const H = { "x-manus-api-key": k, "Content-Type": "application/json" };
        const out = [
          await probe("credits GET", "https://api.manus.ai/v2/usage.availableCredits", {
            headers: H,
          }),
          await probe("task.create", "https://api.manus.ai/v2/task.create", {
            method: "POST",
            headers: H,
            body: JSON.stringify({
              message: { content: "Reply with exactly: PONG", mode: "speed" },
            }),
          }),
        ];
        return Response.json({ key: `...${k.slice(-6)}`, out });
      },
    },
  },
});
