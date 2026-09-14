import { createFileRoute } from "@tanstack/react-router";
import { generateStudioImage } from "@/lib/image-studio.server";

function decodeBase64Utf8(value: string) {
  try {
    const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

function nativePaintQa(dataUrl: string) {
  const prefix = "data:image/svg+xml;base64,";
  const svg = dataUrl.startsWith(prefix) ? decodeBase64Utf8(dataUrl.slice(prefix.length)) : "";
  const checks = ["<svg", "<defs>", "linearGradient", "filter", "ZEROS NATIVE PAINT"];
  const passed = !!svg && checks.every((token) => svg.includes(token));
  return { score: passed ? 10 : 6, passed, issues: passed ? [] : ["Native paint output failed structural render validation."], reviewed: true };
}

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { prompt } = (await request.json()) as { prompt?: string };
        if (!prompt?.trim()) return Response.json({ error: "Prompt required" }, { status: 400 });
        try {
          const rendered = await generateStudioImage(prompt.trim());
          if (!rendered?.dataUrl?.startsWith("data:image/")) {
            return Response.json({ error: "Zeros native paint engine could not produce a renderable image." }, { status: 502 });
          }
          const qa = nativePaintQa(rendered.dataUrl);
          if (!qa.passed) return Response.json({ error: "Zeros native paint validation failed. Please retry." }, { status: 502 });
          return Response.json({
            image: rendered.dataUrl,
            mimeType: rendered.dataUrl.slice(5, rendered.dataUrl.indexOf(";")) || "image/svg+xml",
            studio: { passes: 1, score: qa.score, reviewed: true, providerPath: "zeros-native-paint-engine", model: rendered.model },
          });
        } catch (error) {
          return Response.json({ error: error instanceof Error ? error.message : "Zeros native paint engine failed." }, { status: 500 });
        }
      },
    },
  },
});
