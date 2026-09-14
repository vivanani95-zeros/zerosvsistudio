import { createFileRoute } from "@tanstack/react-router";
import { generateImageDataUrl, groqText, manusChat, type Msg } from "@/lib/providers.server";
import { productionImagePrompt, reviewVisual, type StudioReview } from "@/lib/studio-review.server";

const MAX_PASSES = 2;

async function buildPaintingPrompt(originalPrompt: string): Promise<string> {
  const messages: Msg[] = [{ role: "user", content: originalPrompt }];
  const system = `You are Zeros' senior visual art director. Convert the user's request into one precise professional image-generation prompt. Preserve every requested subject, object, composition, mood, style, colors, text, camera/viewpoint and important detail. Add production-quality lighting, coherent anatomy/geometry, clean edges, intentional composition and high material fidelity where appropriate. Never answer the user, never provide code, never explain. Return only the final image prompt.`;

  const manus = await manusChat(system, messages, 15000);
  if (manus?.trim()) return manus.trim().slice(0, 1800);

  const groq = await groqText(system, originalPrompt);
  if (groq?.trim()) return groq.trim().slice(0, 1800);

  return originalPrompt;
}

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { prompt } = (await request.json()) as { prompt?: string };
        if (!prompt?.trim()) return Response.json({ error: "Prompt required" }, { status: 400 });

        try {
          const originalPrompt = prompt.trim();
          const artDirected = await buildPaintingPrompt(originalPrompt);
          let workingPrompt = productionImagePrompt(artDirected);
          let bestImage: string | null = null;
          let bestReview: StudioReview | null = null;
          let completedPasses = 0;

          for (let pass = 1; pass <= MAX_PASSES; pass += 1) {
            const image = await generateImageDataUrl(workingPrompt);
            if (!image?.startsWith("data:image/")) continue;
            completedPasses = pass;
            if (!bestImage) bestImage = image;

            const review = await reviewVisual("image", originalPrompt, image);
            if (!review) break;
            if (!bestReview || review.score > bestReview.score) { bestReview = review; bestImage = image; }
            if (review.passed || review.score >= 9 || pass === MAX_PASSES) break;
            workingPrompt = productionImagePrompt(review.improvedPrompt || artDirected, review.issues);
          }

          if (!bestImage) return Response.json({ error: "Zeros image studio could not produce a renderable image. Please retry." }, { status: 502 });

          return Response.json({
            image: bestImage,
            mimeType: bestImage.slice(5, bestImage.indexOf(";")) || "image/png",
            studio: { passes: completedPasses, score: bestReview?.score ?? null, reviewed: !!bestReview, providerPath: "zeros-studio-image" },
          });
        } catch (error) {
          return Response.json({ error: error instanceof Error ? error.message : "Zeros image studio failed." }, { status: 500 });
        }
      },
    },
  },
});
