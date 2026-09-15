import { createFileRoute } from "@tanstack/react-router";
import { generateImageDataUrl } from "@/lib/providers.server";

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { prompt } = (await request.json()) as { prompt?: string };
        if (!prompt?.trim())
          return Response.json({ error: "Prompt required" }, { status: 400 });

        const image = await generateImageDataUrl(prompt);
        if (!image)
          return new Response(
            "Every image provider refused that one. Try rephrasing the prompt.",
            { status: 502 },
          );

        return Response.json({ image });
      },
    },
  },
});
