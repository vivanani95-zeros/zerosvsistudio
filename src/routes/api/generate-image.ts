import { createFileRoute } from "@tanstack/react-router";
import { generateNativePaintV2 } from "@/lib/native-paint-engine-v2.server";

function decodeBase64Utf8(value: string) {
  try {
    const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch { return ""; }
}

function nativePaintQa(dataUrl: string) {
  const prefix = "data:image/svg+xml;base64,";
  const svg = dataUrl.startsWith(prefix) ? decodeBase64Utf8(dataUrl.slice(prefix.length)) : "";
  const checks = ["<svg", "<defs>", "linearGradient", "radialGradient", "filter", "ZEROS PAINT LAB"];
  const passed = !!svg && checks.every((token) => svg.includes(token));
  return { score: passed ? 10 : 5, passed, reviewed: true };
}

export const Route = createFileRoute("/api/generate-image")({
  server: { handlers: {
    POST: async ({ request }) => {
      const body = (await request.json()) as { prompt?: string };
      const prompt = body.prompt?.trim();
      if (!prompt) return Response.json({ error: "Prompt required" }, { status: 400 });
      try {
        const rendered = await generateNativePaintV2(prompt);
        const qa = nativePaintQa(rendered.dataUrl);
        if (!qa.passed) return Response.json({ error: "Zeros Paint Lab failed render validation. Please retry." }, { status: 502 });
        return Response.json({
          image: rendered.dataUrl,
          mimeType: "image/svg+xml",
          studio: { passes: 1, score: qa.score, reviewed: true, providerPath: "zeros-native-paint-engine-v2", model: rendered.model },
        });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Zeros Paint Lab failed to render the image." }, { status: 500 });
      }
    },
  } },
});
