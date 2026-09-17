import { createFileRoute } from "@tanstack/react-router";
import { ttsPcmBase64 } from "@/lib/providers.server";

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { text, voice } = (await request.json()) as { text?: string; voice?: string };
        if (!text?.trim()) return Response.json({ error: "text required" }, { status: 400 });

        // Never let a provider stall the song renderer indefinitely. Gemini's TTS
        // produces real generated audio/PCM, but provider/network failures must be
        // surfaced as a normal, fast failure so the layered instrumental can finish.
        const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 20000));
        const pcm = await Promise.race([
          ttsPcmBase64(text.slice(0, 3500), voice || "Puck"),
          timeout,
        ]);
        if (!pcm) return Response.json({ error: "Vocal generation timed out or was unavailable" }, { status: 504 });
        return Response.json({ pcm, sampleRate: 24000 });
      },
    },
  },
});
