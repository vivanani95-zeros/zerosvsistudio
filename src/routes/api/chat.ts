import { createFileRoute } from "@tanstack/react-router";
import { buildSystemPrompt, MODEL, type ZeroMode } from "@/lib/zeros";

type Msg = { role: "user" | "assistant"; content: string };

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

type Hit = { title: string; url: string; snippet: string };

/** Reader proxy over DuckDuckGo — returns clean markdown with links. */
async function readerSearch(query: string): Promise<Hit[]> {
  const target = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(`https://r.jina.ai/${target}`, {
    headers: { "User-Agent": UA, "X-Return-Format": "markdown" },
  });
  if (!res.ok) return [];
  const md = await res.text();
  const lines = md.split("\n");
  const out: Hit[] = [];
  for (let i = 0; i < lines.length && out.length < 10; i++) {
    const heading = lines[i]?.match(/^#+\s+\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
    if (!heading) continue;
    const snippet =
      lines
        .slice(i + 1, i + 8)
        .map((l) => l.trim())
        .find((l) => l.length > 60 && !l.startsWith("[") && !l.startsWith("!")) ?? "";
    out.push({ title: heading[1]!, url: heading[2]!, snippet });
  }
  return out;
}

/** Bing RSS fallback. */
async function bingSearch(query: string): Promise<Hit[]> {
  const res = await fetch(
    `https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss&mkt=en-US&count=10`,
    { headers: { "User-Agent": UA } },
  );
  if (!res.ok) return [];
  const xml = await res.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 10);
  const pick = (block: string, tag: string) =>
    (block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? "")
      .replace(/<!\[CDATA\[|\]\]>/g, "")
      .replace(/<[^>]*>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#\d+;/g, " ")
      .trim();
  return items.map((m) => {
    const b = m[1] ?? "";
    return { title: pick(b, "title"), url: pick(b, "link"), snippet: pick(b, "description") };
  });
}

/** Google News RSS — best source of genuinely fresh, dated items. */
async function newsSearch(query: string): Promise<Hit[]> {
  const res = await fetch(
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`,
    { headers: { "User-Agent": UA } },
  );
  if (!res.ok) return [];
  const xml = await res.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 10);
  const pick = (block: string, tag: string) =>
    (block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? "")
      .replace(/<!\[CDATA\[|\]\]>/g, "")
      .replace(/<[^>]*>/g, "")
      .replace(/&amp;/g, "&")
      .trim();
  return items.map((m) => {
    const b = m[1] ?? "";
    return {
      title: pick(b, "title"),
      url: pick(b, "link"),
      snippet: `${pick(b, "source")} — published ${pick(b, "pubDate")}`,
    };
  });
}

/** Pull the actual readable text of a page so answers cite real content. */
async function readPage(url: string): Promise<string> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { "User-Agent": UA, "X-Return-Format": "text" },
    });
    if (!res.ok) return "";
    const txt = await res.text();
    return txt.replace(/\n{3,}/g, "\n\n").slice(0, 4000);
  } catch {
    return "";
  }
}

async function webSearch(query: string): Promise<string> {
  if (!query.trim()) return "";

  const settled = await Promise.allSettled([
    readerSearch(query),
    newsSearch(query),
    bingSearch(query),
  ]);
  const hits: Hit[] = [];
  const seen = new Set<string>();
  for (const s of settled) {
    if (s.status !== "fulfilled") continue;
    for (const h of s.value) {
      if (!h.url || seen.has(h.url)) continue;
      seen.add(h.url);
      hits.push(h);
    }
  }
  if (!hits.length) return "";

  const top = hits.slice(0, 12);
  const pages = await Promise.all(
    top.slice(0, 4).map(async (h) => ({ h, body: await readPage(h.url) })),
  );

  const list = top.map((h) => `- [${h.title}](${h.url})\n  ${h.snippet}`).join("\n");
  const extracts = pages
    .filter((p) => p.body.length > 200)
    .map((p) => `### ${p.h.title}\nSOURCE: ${p.h.url}\n${p.body}`)
    .join("\n\n");

  return `RESULT LIST (fetched ${new Date().toISOString()}):\n${list}${
    extracts ? `\n\nFULL PAGE EXTRACTS:\n${extracts}` : ""
  }`;
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
