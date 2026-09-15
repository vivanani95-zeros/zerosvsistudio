import { createFileRoute } from "@tanstack/react-router";
import { generatePollinationsImage } from "@/lib/pollinations-image.server";

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mimeType: string } {
  const match = dataUrl.match(/^data:([^;,]+)(?:;base64)?,([\s\S]*)$/i);
  if (!match) throw new Error("Pollinations returned an invalid image payload.");
  const mimeType = match[1] ?? "image/png";
  const payload = match[2] ?? "";
  if (!/;base64,/i.test(dataUrl.slice(0, dataUrl.indexOf(",") + 1))) {
    return {
      bytes: new TextEncoder().encode(decodeURIComponent(payload)),
      mimeType,
    };
  }
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { bytes, mimeType };
}

async function renderImage(prompt: string, download: boolean): Promise<Response> {
  const result = await generatePollinationsImage(prompt);
  const { bytes, mimeType } = decodeDataUrl(result.image);
  const headers = new Headers({
    "Content-Type": mimeType,
    "Cache-Control": "public, max-age=3600, s-maxage=3600",
    "X-Zeros-Image-Provider": "pollinations.ai",
    "X-Zeros-Image-Model": result.model ?? "unknown",
  });
  headers.set(
    "Content-Disposition",
    `${download ? "attachment" : "inline"}; filename="zeros-image.${mimeType === "image/png" ? "png" : "jpg"}"`,
  );
  return new Response(bytes, { status: 200, headers });
}

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const prompt = url.searchParams.get("prompt")?.trim();
        if (!prompt) return new Response("Prompt required", { status: 400 });
        try {
          return await renderImage(prompt, url.searchParams.get("download") === "1");
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : "Pollinations image generation failed.",
            { status: 502 },
          );
        }
      },
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
          const { bytes, mimeType } = decodeDataUrl(result.image);
          return new Response(bytes, {
            status: 200,
            headers: {
              "Content-Type": mimeType,
              "Cache-Control": "no-store",
              "X-Zeros-Image-Provider": "pollinations.ai",
              "X-Zeros-Image-Model": result.model ?? "unknown",
            },
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
