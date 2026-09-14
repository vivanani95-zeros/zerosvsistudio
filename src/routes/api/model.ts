import { createFileRoute } from "@tanstack/react-router";
import { generateNativeModel } from "@/lib/native-3d.server";
import { reviewVisual } from "@/lib/studio-review.server";

export const Route = createFileRoute("/api/model")({
  server: { handlers: {
    POST: async ({ request }) => {
      const body = (await request.json()) as { prompt?: string; action?: "create" | "review"; previewUrl?: string };
      const prompt = body.prompt?.trim();
      if (!prompt) return Response.json({ error: "Prompt required" }, { status: 400 });

      if (body.action === "review") {
        if (!body.previewUrl) return Response.json({ error: "previewUrl required" }, { status: 400 });
        return Response.json({ review: await reviewVisual("model", prompt, body.previewUrl) });
      }

      try {
        const generated = await generateNativeModel(prompt);
        return Response.json({
          status: "success",
          progress: 100,
          url: generated.url,
          previewUrl: generated.previewUrl,
          providerPath: "zeros-ultra-native-3d",
          quality: generated.quality,
          triangles: generated.triangles,
          vertices: generated.vertices,
          note: generated.note,
        });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Zeros Ultra Native 3D failed to generate the model." }, { status: 500 });
      }
    },
  } },
});
