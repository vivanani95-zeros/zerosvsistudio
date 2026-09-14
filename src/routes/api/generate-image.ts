import { createFileRoute } from "@tanstack/react-router";
import { generateImageDataUrl } from "@/lib/providers.server";
import {
  productionImagePrompt,
  reviewVisual,
  type StudioReview,
} from "@/lib/studio-review.server";

const MAX_PASSES = 3;

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { prompt } = (await request.json()) as { prompt?: string };
        if (!prompt?.trim())
          return Response.json({ error: "Prompt required" }, { status: 400 });

        const originalPrompt = prompt.trim();
        let workingPrompt = productionImagePrompt(originalPrompt);
        let bestImage: string | null = null;
        let bestReview: StudioReview | null = null;
        let completedPasses = 0;

        for (let pass = 1; pass <= MAX_PASSES; pass += 1) {
          const image = await generateImageDataUrl(workingPrompt);
          if (!image) continue;

          completedPasses = pass;
          if (!bestImage) bestImage = image;
          const review = await reviewVisual("image", originalPrompt, image);

          // A reviewer outage should never discard a valid generated image.
          if (!review) {
            if (!bestReview) bestImage = image;
            break;
          }
          if (!bestReview || review.score > bestReview.score) {
            bestReview = review;
            bestImage = image;
          }
          if (review.passed) break;

          workingPrompt = productionImagePrompt(
            review.improvedPrompt || originalPrompt,
            review.issues,
          );
        }

        if (!bestImage)
          return new Response(
            "Every image provider refused that one. Try rephrasing the prompt.",
            { status: 502 },
          );

        return Response.json({
          image: bestImage,
          studio: {
            passes: completedPasses,
            score: bestReview?.score ?? null,
            reviewed: !!bestReview,
          },
        });
      },
    },
  },
});
