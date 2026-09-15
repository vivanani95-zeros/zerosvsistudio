import { createFileRoute } from "@tanstack/react-router";
import { generatePollinationsImage } from "@/lib/pollinations-image.server";

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          prompt?: string;
          width?: number;
          height?: number;
        };
        const prompt = body.prompt?.trim();
        if (!prompt) return Response.json({ error: "Prompt required" }, { status: 400 });

        try {
          const result = await generatePollinationsImage(prompt, {
            width: body.width,
            height: body.height,
          });

          if (result.mode === "browser") {
            return Response.json({
              provider: "pollinations.ai",
              mode: "browser",
              candidates: result.candidates,
            });
          }

          return Response.json({
            image: result.image,
            provider: "pollinations.ai",
            mode: "server",
            mimeType: "image/jpeg",
            model: result.model,
            endpoint: result.endpoint,
            modelsTried: result.modelsTried,
          });
        } catch (error) {
          return Response.json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Pollinations image generation failed. Please retry.",
            },
            { status: 502 },
          );
        }
      },
    },
  },
});
