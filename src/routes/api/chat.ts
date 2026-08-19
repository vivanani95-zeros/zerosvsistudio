import { createFileRoute } from "@tanstack/react-router";
import { buildSystemPrompt, MODEL, type ZeroMode } from "@/lib/zeros";

type Msg = { role: "user" | "assistant"; content: string };

async function webSearch(query: string): Promise<string> {
  try {
    const res = await fetch(
      "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query),
      {
        method: "POST",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );
    if (!res.ok) return "";
    const html = await res.text();
    const items: string[] = [];
    const re =
      /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    const strip = (s: string) =>
      s
        .replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();
    while ((m = re.exec(html)) && items.length < 8) {
      let url = m[1] ?? "";
      const dd = url.match(/uddg=([^&]+)/);
      if (dd?.[1]) url = decodeURIComponent(dd[1]);
      items.push(`- ${strip(m[2] ?? "")} (${url})\n  ${strip(m[3] ?? "")}`);
    }
    return items.join("\n");
  } catch {
    return "";
  }
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("Missing AI key", { status: 500 });

        const body = (await request.json()) as {
          messages: Msg[];
          mode?: ZeroMode;
          memories?: string[];
        };
        const mode: ZeroMode = body.mode ?? "chat";
        const messages = (body.messages ?? []).slice(-24);

        let system = buildSystemPrompt(mode, body.memories ?? []);

        if (mode === "search") {
          const last = [...messages].reverse().find((m) => m.role === "user");
          const results = await webSearch(last?.content ?? "");
          system += results
            ? `\n\nSEARCH RESULTS (live web):\n${results}`
            : `\n\nSEARCH RESULTS: (the live search returned nothing usable — say so briefly and answer from your own knowledge)`;
        }

        const upstream = await fetch(
          "https://ai.gateway.lovable.dev/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: MODEL,
              stream: true,
              messages: [{ role: "system", content: system }, ...messages],
            }),
          },
        );

        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text().catch(() => "");
          return new Response(text || "AI gateway error", {
            status: upstream.status || 500,
          });
        }

        return new Response(upstream.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
