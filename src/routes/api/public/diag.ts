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
        const out: unknown[] = [];
        for (const k of keys) {
          const res = await fetch("https://api.manus.ai/v2/usage.availableCredits", {
            method: "POST",
            headers: { "x-manus-api-key": k, "Content-Type": "application/json" },
            body: "{}",
          }).catch(() => null);
          out.push({
            key: `...${k.slice(-6)}`,
            status: res?.status ?? 0,
            body: (await res?.text().catch(() => ""))?.slice(0, 300),
          });
        }
        return Response.json({ manus: out });
      },
    },
  },
});
