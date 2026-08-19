import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Session } from "@supabase/supabase-js";

import TunnelBackground from "@/components/TunnelBackground";
import ModelViewer from "@/components/ModelViewer";
import WebPreview from "@/components/WebPreview";
import { supabase } from "@/integrations/supabase/client";
import { generateImage, streamChat, type Msg } from "@/lib/ai-client";
import { extractBlock, type ZeroMode } from "@/lib/zeros";
import { renderSong, type SongSpec } from "@/lib/song";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Chat with Zeros — AI by VsiStudio" },
      {
        name: "description",
        content:
          "Talk to Zeros: web search, image generation, 3D modelisation, music and full website building in one always-on AI.",
      },
      { property: "og:title", content: "Chat with Zeros" },
      {
        property: "og:description",
        content: "Search, images, 3D models, songs and websites — powered by Zeros.",
      },
    ],
  }),
  component: ChatPage,
});

type Attachment =
  | { kind: "image"; src: string }
  | { kind: "model"; code: string }
  | { kind: "web"; html: string }
  | { kind: "song"; spec: SongSpec };

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: ZeroMode;
  attachment?: Attachment | null;
};

const MODES: { id: Exclude<ZeroMode, "chat">; label: string; icon: string }[] = [
  { id: "search", label: "Web Search", icon: "🌐" },
  { id: "image", label: "Image", icon: "🎨" },
  { id: "model", label: "Modelisation", icon: "🧊" },
  { id: "music", label: "Music", icon: "🎵" },
  { id: "web", label: "Super Web", icon: "⚡" },
];

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

function ChatPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [isGuest, setIsGuest] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ZeroMode>("chat");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memories, setMemories] = useState<string[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [songUrls, setSongUrls] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // --- auth bootstrap -------------------------------------------------
  useEffect(() => {
    const guest = sessionStorage.getItem("zeros_guest") === "1";
    setIsGuest(guest);
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session && !guest) navigate({ to: "/" });
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  // --- load history + memories for signed-in users --------------------
  useEffect(() => {
    if (!session) return;
    const uidv = session.user.id;
    (async () => {
      await supabase
        .from("profiles")
        .upsert(
          {
            id: uidv,
            display_name:
              (session.user.user_metadata?.["full_name"] as string) ??
              session.user.email ??
              "Human",
            avatar_url: (session.user.user_metadata?.["avatar_url"] as string) ?? null,
          },
          { onConflict: "id" },
        );

      const { data: mem } = await supabase
        .from("memories")
        .select("fact")
        .order("created_at", { ascending: false })
        .limit(40);
      setMemories((mem ?? []).map((m) => m.fact));

      const { data: convs } = await supabase
        .from("conversations")
        .select("id")
        .order("updated_at", { ascending: false })
        .limit(1);

      let convId = convs?.[0]?.id ?? null;
      if (!convId) {
        const { data: created } = await supabase
          .from("conversations")
          .insert({ user_id: uidv, title: "New chat" })
          .select("id")
          .single();
        convId = created?.id ?? null;
      } else {
        const { data: rows } = await supabase
          .from("messages")
          .select("id, role, content, mode, attachment")
          .eq("conversation_id", convId)
          .order("created_at", { ascending: true });
        setMessages(
          (rows ?? []).map((r) => ({
            id: r.id,
            role: r.role as "user" | "assistant",
            content: r.content,
            mode: (r.mode as ZeroMode) ?? undefined,
            attachment: (r.attachment as Attachment | null) ?? null,
          })),
        );
      }
      setConversationId(convId);
    })();
  }, [session]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const persist = useCallback(
    async (m: ChatMessage) => {
      if (!session || !conversationId) return;
      const attachment =
        m.attachment && m.attachment.kind === "image" && m.attachment.src.length > 900000
          ? null
          : (m.attachment ?? null);
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        user_id: session.user.id,
        role: m.role,
        content: m.content,
        mode: m.mode ?? null,
        attachment: attachment as never,
      });
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    },
    [session, conversationId],
  );

  const rememberIfAsked = useCallback(
    async (text: string) => {
      if (!session) return;
      const m = text.match(/remember(?:\s+that)?[:,]?\s+(.{4,240})/i);
      if (!m?.[1]) return;
      const fact = m[1].trim();
      await supabase.from("memories").insert({ user_id: session.user.id, fact });
      setMemories((prev) => [fact, ...prev]);
    },
    [session],
  );

  const send = async () => {
    const prompt = input.trim();
    if (!prompt || busy) return;
    setInput("");
    setError(null);

    const userMsg: ChatMessage = { id: uid(), role: "user", content: prompt, mode };
    setMessages((prev) => [...prev, userMsg]);
    void persist(userMsg);
    void rememberIfAsked(prompt);

    setBusy(true);
    const assistantId = uid();

    try {
      if (mode === "image") {
        setStatus("Painting pixels…");
        const src = await generateImage(prompt);
        const msg: ChatMessage = {
          id: assistantId,
          role: "assistant",
          content: `Behold: **${prompt}** — freshly rendered, no credits harmed. 🎨`,
          mode,
          attachment: { kind: "image", src },
        };
        setMessages((prev) => [...prev, msg]);
        void persist(msg);
        return;
      }

      setStatus(
        mode === "search"
          ? "Searching the web…"
          : mode === "model"
            ? "Sculpting polygons…"
            : mode === "music"
              ? "Writing a banger…"
              : mode === "web"
                ? "Building your site…"
                : null,
      );

      const history: Msg[] = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "", mode },
      ]);

      const full = await streamChat(history, mode, memories, (text) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: text } : m)),
        );
      });

      let attachment: Attachment | null = null;
      let content = full;

      if (mode === "model") {
        const code = extractBlock(full, "js");
        if (code) {
          attachment = { kind: "model", code };
          content = full.replace(/```[\s\S]*?```/, "").trim() || "Model ready. 🧊";
        }
      } else if (mode === "web") {
        const html = extractBlock(full, "html");
        if (html) {
          attachment = { kind: "web", html };
          content = full.replace(/```[\s\S]*?```/, "").trim() || "Site served. ⚡";
        }
      } else if (mode === "music") {
        const raw = extractBlock(full, "json");
        if (raw) {
          try {
            const spec = JSON.parse(raw) as SongSpec;
            attachment = { kind: "song", spec };
            content =
              (full.replace(/```[\s\S]*?```/, "").trim() || "Track incoming. 🎵") +
              `\n\n**${spec.title}** · ${spec.bpm} BPM · ${spec.style ?? "original"}`;
            setStatus("Rendering audio…");
            const blob = await renderSong(spec);
            setSongUrls((p) => ({ ...p, [assistantId]: URL.createObjectURL(blob) }));
          } catch {
            content = full;
          }
        }
      }

      const finalMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content,
        mode,
        attachment,
      };
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? finalMsg : m)));
      void persist(finalMsg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something broke. Try again.");
      setMessages((prev) => prev.filter((m) => m.id !== assistantId || m.content));
    } finally {
      setBusy(false);
      setStatus(null);
    }
  };

  const signOut = async () => {
    sessionStorage.removeItem("zeros_guest");
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const newChat = async () => {
    setMessages([]);
    if (!session) return;
    const { data } = await supabase
      .from("conversations")
      .insert({ user_id: session.user.id, title: "New chat" })
      .select("id")
      .single();
    setConversationId(data?.id ?? null);
  };

  if (!ready) {
    return (
      <main className="relative min-h-screen">
        <TunnelBackground />
        <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
          Waking Zeros…
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col">
      <TunnelBackground speed={0.5} />

      <header className="glass sticky top-0 z-20 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-gradient text-xl font-black tracking-tight">ZEROS</span>
          <span className="hidden text-[10px] tracking-[0.2em] text-muted-foreground uppercase sm:block">
            by VsiStudio
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground">
            {isGuest && !session ? "Guest · nothing saved" : "Memory on"}
          </span>
          <button
            onClick={newChat}
            className="rounded-full border border-border px-3 py-1 text-[11px] hover:text-primary"
          >
            New chat
          </button>
          <button
            onClick={signOut}
            className="rounded-full border border-border px-3 py-1 text-[11px] hover:text-primary"
          >
            Exit
          </button>
        </div>
      </header>

      <section className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-56">
        {messages.length === 0 && (
          <div className="glass mt-10 rounded-3xl p-8 text-center">
            <h1 className="text-gradient text-3xl font-black">Hello. I'm Zeros.</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Built by VsiStudio (founder: Vivan Sahu). I never run out of credits and I
              never clock off. Ask me anything — or flip a mode below and watch me show
              off.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-2 text-left text-xs text-muted-foreground sm:grid-cols-2">
              <p className="glass rounded-xl p-3">🌐 “What happened in tech this week?”</p>
              <p className="glass rounded-xl p-3">🧊 “Model a detailed vintage camera.”</p>
              <p className="glass rounded-xl p-3">🎵 “Write a synthwave song about pizza.”</p>
              <p className="glass rounded-xl p-3">⚡ “Build a portfolio site for a chef.”</p>
            </div>
          </div>
        )}

        <div className="space-y-5">
          {messages.map((m) => (
            <div
              key={m.id}
              className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-sm text-primary-foreground"
                    : "glass w-full rounded-2xl rounded-bl-sm px-4 py-3 text-sm"
                }
              >
                {m.role === "assistant" ? (
                  <>
                    <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-[oklch(0.1_0.01_265)]">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {m.content || "…"}
                      </ReactMarkdown>
                    </div>
                    {m.attachment?.kind === "image" && (
                      <div className="mt-3">
                        <img
                          src={m.attachment.src}
                          alt="Generated by Zeros"
                          className="w-full rounded-2xl border border-border"
                        />
                        <a
                          href={m.attachment.src}
                          download="zeros-image.png"
                          className="mt-2 inline-block rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                        >
                          Download image
                        </a>
                      </div>
                    )}
                    {m.attachment?.kind === "model" && (
                      <ModelViewer code={m.attachment.code} />
                    )}
                    {m.attachment?.kind === "web" && <WebPreview html={m.attachment.html} />}
                    {m.attachment?.kind === "song" && (
                      <SongBlock
                        spec={m.attachment.spec}
                        url={songUrls[m.id]}
                        onRender={async (spec) => {
                          const blob = await renderSong(spec);
                          setSongUrls((p) => ({ ...p, [m.id]: URL.createObjectURL(blob) }));
                        }}
                      />
                    )}
                  </>
                ) : (
                  <span className="whitespace-pre-wrap">{m.content}</span>
                )}
              </div>
            </div>
          ))}
          {busy && status && (
            <p className="text-xs text-primary">{status}</p>
          )}
          {error && <p className="text-xs text-destructive">⚠ {error}</p>}
        </div>
        <div ref={bottomRef} />
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 px-4 pb-4">
        <div className="glass mx-auto max-w-3xl rounded-3xl p-3">
          <div className="mb-2 flex flex-wrap gap-2">
            {MODES.map((m) => {
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMode(active ? "chat" : m.id)}
                  className={
                    "rounded-full border px-3 py-1.5 text-[11px] font-semibold transition " +
                    (active
                      ? "border-transparent bg-primary text-primary-foreground shadow-[var(--glow-primary)]"
                      : "border-border text-muted-foreground hover:text-foreground")
                  }
                >
                  {m.icon} {m.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder={
                mode === "chat" ? "Ask Zeros anything…" : `${mode} mode — describe it…`
              }
              className="max-h-40 flex-1 resize-none bg-transparent px-3 py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              onClick={() => void send()}
              disabled={busy || !input.trim()}
              className="rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40"
            >
              {busy ? "…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function SongBlock({
  spec,
  url,
  onRender,
}: {
  spec: SongSpec;
  url?: string | undefined;
  onRender: (spec: SongSpec) => Promise<void>;
}) {
  const [rendering, setRendering] = useState(false);
  return (
    <div className="mt-3 rounded-2xl border border-border bg-card/50 p-4">
      <h3 className="text-sm font-bold">{spec.title}</h3>
      {url ? (
        <>
          <audio controls src={url} className="mt-3 w-full" />
          <a
            href={url}
            download={`${spec.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.wav`}
            className="mt-2 inline-block rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
          >
            Download .wav
          </a>
        </>
      ) : (
        <button
          onClick={async () => {
            setRendering(true);
            await onRender(spec);
            setRendering(false);
          }}
          disabled={rendering}
          className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {rendering ? "Rendering audio…" : "Render audio"}
        </button>
      )}
      <div className="mt-4 space-y-3 text-xs text-muted-foreground">
        {spec.lyrics?.map((s, i) => (
          <div key={i}>
            <p className="font-semibold text-foreground">{s.section}</p>
            {s.lines?.map((l, j) => <p key={j}>{l}</p>)}
          </div>
        ))}
      </div>
    </div>
  );
}
