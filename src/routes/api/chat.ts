import { createFileRoute } from "@tanstack/react-router";
import { buildSystemPrompt, MODEL, type ZeroMode } from "@/lib/zeros";

type Msg = { role: "user" | "assistant"; content: string };

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Reader proxy over DuckDuckGo — returns clean markdown with links. */
async function readerSearch(query: string): Promise<string> {
  const target = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(`https://r.jina.ai/${target}`, {
    headers: { "User-Agent": UA, "X-Return-Format": "markdown" },
  });
  if (!res.ok) return "";
  const md = await res.text();
  const lines = md.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length && out.length < 10; i++) {
    const heading = lines[i]?.match(/^#+\s+\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
    if (!heading) continue;
    const snippet = lines
      .slice(i + 1, i + 8)
      .map((l) => l.trim())
      .find((l) => l.length > 60 && !l.startsWith("[") && !l.startsWith("!"));
    out.push(`- [${heading[1]}](${heading[2]})\n  ${snippet ?? ""}`);
  }
  return out.join("\n");
}

/** Bing RSS fallback. */
async function bingSearch(query: string): Promise<string> {
  const res = await fetch(
    `https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss&mkt=en-US&count=8`,
    { headers: { "User-Agent": UA } },
  );
  if (!res.ok) return "";
  const xml = await res.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8);
  const pick = (block: string, tag: string) =>
    (block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? "")
      .replace(/<!\[CDATA\[|\]\]>/g, "")
      .replace(/<[^>]*>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#\d+;/g, " ")
      .trim();
  return items
    .map((m) => {
      const b = m[1] ?? "";
      return `- [${pick(b, "title")}](${pick(b, "link")})\n  ${pick(b, "description")}`;
    })
    .join("\n");
}

async function webSearch(query: string): Promise<string> {
  if (!query.trim()) return "";
  try {
    const primary = await readerSearch(query);
    if (primary) return primary;
  } catch {
    /* fall through */
  }
  try {
    return await bingSearch(query);
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
