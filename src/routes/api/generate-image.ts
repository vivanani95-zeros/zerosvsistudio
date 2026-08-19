import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("Missing AI key", { status: 500 });

        const { prompt, stream = true } = (await request.json()) as {
          prompt: string;
          stream?: boolean;
        };

        const upstream = await fetch(
          "https://ai.gateway.lovable.dev/v1/images/generations",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3.1-flash-image",
              messages: [{ role: "user", content: prompt }],
              modalities: ["image", "text"],
              ...(stream ? { stream: true } : {}),
            }),
          },
        );

        if (!upstream.ok || !upstream.body) {
          return new Response(await upstream.text(), {
            status: upstream.status,
          });
        }
        if (!stream) {
          return new Response(upstream.body, {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(upstream.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
