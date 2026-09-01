import { createFileRoute } from "@tanstack/react-router";
import { ttsPcmBase64 } from "@/lib/providers.server";

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { text, voice } = (await request.json()) as {
          text?: string;
          voice?: string;
        };
        if (!text?.trim()) return Response.json({ error: "text required" });
        const pcm = await ttsPcmBase64(text.slice(0, 4000), voice || "Puck");
        if (!pcm) return Response.json({ error: "No vocal track available" });
        // Raw 16-bit signed PCM, 24kHz, mono.
        return Response.json({ pcm, sampleRate: 24000 });
      },
    },
  },
});
