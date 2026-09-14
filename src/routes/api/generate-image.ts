import { createFileRoute } from "@tanstack/react-router";
import { generateNativePaintV2 } from "@/lib/native-paint-engine-v2.server";
import { generateImageDataUrl } from "@/lib/providers.server";
import { productionImagePrompt, reviewVisual } from "@/lib/studio-review.server";

function decodeBase64Utf8(value: string) {
  try {
    const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

function imageQa(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/s);
  if (!match) return { score: 0, passed: false, reviewed: false };
  const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
  if (bytes.length < 100) return { score: 0, passed: false, reviewed: false };
  if (match[1] !== "image/svg+xml") return { score: 10, passed: true, reviewed: true };
  const svg = decodeBase64Utf8(match[2]);
  const checks = ["<svg", "<defs>", "linearGradient", "radialGradient", "filter"];
  return {
    score: checks.every((token) => svg.includes(token)) ? 10 : 5,
    passed: checks.every((token) => svg.includes(token)),
    reviewed: true,
  };
}

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { prompt?: string };
        const prompt = body.prompt?.trim();
        if (!prompt) return Response.json({ error: "Prompt required" }, { status: 400 });
        try {
          // Prefer a true diffusion/image-model render for photographic detail. The native
          // renderer is a reliable, valid-image fallback when no image provider is configured.
          const productionPrompt = productionImagePrompt(prompt);
          let image = await generateImageDataUrl(productionPrompt);
          let providerPath = "zeros-image-provider";
          let model = "production image model";
          let passes = 1;
          if (image) {
            const review = await reviewVisual("image", prompt, image);
            if (review && !review.passed) {
              image =
                (await generateImageDataUrl(productionImagePrompt(prompt, review.issues))) ?? image;
              passes = 2;
            }
          } else {
            const rendered = await generateNativePaintV2(prompt);
            image = rendered.dataUrl;
            providerPath = "zeros-native-paint-engine-v2";
            model = rendered.model;
          }
          const qa = imageQa(image);
          if (!qa.passed)
            return Response.json(
              { error: "The image provider returned an invalid image payload. Please retry." },
              { status: 502 },
            );
          return Response.json({
            image,
            mimeType: image.match(/^data:([^;]+);/)?.[1] ?? "image/png",
            studio: { passes, score: qa.score, reviewed: qa.reviewed, providerPath, model },
          });
        } catch (error) {
          return Response.json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Zeros Paint Lab failed to render the image.",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
