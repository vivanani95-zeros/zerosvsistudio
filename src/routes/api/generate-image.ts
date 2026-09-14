import { createFileRoute } from "@tanstack/react-router";
import {
  generateImageDataUrl,
  groqText,
  manusChat,
  type Msg,
} from "@/lib/providers.server";
import {
  productionImagePrompt,
  reviewVisual,
  type StudioReview,
} from "@/lib/studio-review.server";

const MAX_PASSES = 4;

async function buildPaintingPrompt(originalPrompt: string): Promise<string> {
  const messages: Msg[] = [{ role: "user", content: originalPrompt }];
  const system = `You are Zeros' senior visual art director. Convert the user's image request into one precise production image-generation prompt. Preserve every requested subject, object, composition, mood, style, colors, text, camera/viewpoint, and important detail. Resolve ambiguity intelligently. Do not explain your work. Return only the final image prompt.`;

  // Image requests use the same Manus-first / Groq-fallback provider path as
  // Zeros' normal intelligence layer, without exposing provider keys to users.
  const manus = await manusChat(system, messages, 45000);
  if (manus?.trim()) return manus.trim().slice(0, 1500);

  const groq = await groqText(system, originalPrompt);
  if (groq?.trim()) return groq.trim().slice(0, 1500);

  return originalPrompt;
}

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { prompt } = (await request.json()) as { prompt?: string };
        if (!prompt?.trim())
          return Response.json({ error: "Prompt required" }, { status: 400 });

        const originalPrompt = prompt.trim();
        const artDirected = await buildPaintingPrompt(originalPrompt);
        let workingPrompt = productionImagePrompt(artDirected);
        let bestImage: string | null = null;
        let bestReview: StudioReview | null = null;
        let completedPasses = 0;

        for (let pass = 1; pass <= MAX_PASSES; pass += 1) {
          // This is the actual painting step: the image provider receives the
          // art-directed production prompt and returns the image itself.
          const image = await generateImageDataUrl(workingPrompt);
          if (!image) continue;

          completedPasses = pass;
          if (!bestImage) bestImage = image;
          const review = await reviewVisual("image", originalPrompt, image);

          // Never turn a temporary vision-provider outage into an image error.
          if (!review) break;

          if (!bestReview || review.score > bestReview.score) {
            bestReview = review;
            bestImage = image;
          }
          if (review.passed) break;

          workingPrompt = productionImagePrompt(
            review.improvedPrompt || artDirected,
            review.issues,
          );
        }

        if (!bestImage)
          return new Response(
            "Zeros could not paint an image with the configured image provider. Try again.",
            { status: 502 },
          );

        return Response.json({
          image: bestImage,
          studio: {
            passes: completedPasses,
            score: bestReview?.score ?? null,
            reviewed: !!bestReview,
            providerPath: "manus -> groq -> image painter",
          },
        });
      },
    },
  },
});
