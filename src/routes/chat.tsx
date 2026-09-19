import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowUp,
  Boxes,
  Brain,
  Code2,
  Globe,
  Image as ImageIcon,
  LogOut,
  Menu,
  Music4,
  Plus,
  Sparkles,
  User,
  X,
} from "lucide-react";

import TunnelBackground from "@/components/TunnelBackground";
import ModelViewer from "@/components/ModelViewer";
import WebPreview from "@/components/WebPreview";
import ZerosOrb from "@/components/ZerosOrb";
import { supabase } from "@/integrations/supabase/client";
import { downloadImageAsPng, generateImage, generateModel, streamChat, type Msg } from "@/lib/ai-client";
import { extractBlock, type ZeroMode } from "@/lib/zeros";
import { renderSong, type SongSpec } from "@/lib/song";
import { isModelSpec, type ModelSpec } from "@/lib/model-spec";
import { extractWebProject, type WebProject } from "@/lib/web-project";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Chat with Zeros — AI by VsiStudio" },
      {
        name: "description",
        content:
          "Talk to Zeros: web search, image generation, real 3D models, original songs and full website building in one always-on AI.",
      },
      { property: "og:title", content: "Chat with Zeros" },
      {
        property: "og:description",
        content: "Search, images, 3D models, songs and websites — powered by Zeros.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatPage,
});

type Attachment =
  | { kind: "image"; src: string }
  | { kind: "model"; code?: string; url?: string; source?: string; prompt?: string; spec?: ModelSpec }
  | { kind: "web"; project: WebProject }
  | { kind: "song"; spec: SongSpec };

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: ZeroMode;
  attachment?: Attachment | null;
};

const MODES: {
  id: Exclude<ZeroMode, "chat">;
  label: string;
  Icon: typeof Globe;
}[] = [
  { id: "search", label: "Web", Icon: Globe },
  { id: "image", label: "Image", Icon: ImageIcon },
  { id: "model", label: "3D Model", Icon: Boxes },
  { id: "music", label: "Song", Icon: Music4 },
  { id: "web", label: "Code", Icon: Code2 },
];

const SUGGESTIONS: { text: string; Icon: typeof Globe; mode: ZeroMode }[] = [
  { text: "What's new in AI today", Icon: Globe, mode: "search" },
  { text: "Render a 3D glass orb", Icon: ImageIcon, mode: "image" },
  { text: "Build a 3D sports car", Icon: Boxes, mode: "model" },
  { text: "Write me a song", Icon: Music4, mode: "music" },
  { text: "Build a mini web app", Icon: Code2, mode: "web" },
  { text: "Roast my startup idea", Icon: Sparkles, mode: "chat" },
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
  const [sidebar, setSidebar] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ZeroMode>("chat");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [maiUnlocking, setMaiUnlocking] = useState(false);
  const maiTimer = useRef<number | null>(null);
  const [memories, setMemories] = useState<string[]>([]);
  const [conversations, setConversations] = useState<{ id: string; title: string }[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [songUrls, setSongUrls] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!session) return;
    const uidv = session.user.id;
    (async () => {
      await supabase.from("profiles").upsert(
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
        .select("id, title")
        .order("updated_at", { ascending: false })
        .limit(30);
      setConversations((convs ?? []).map((c) => ({ id: c.id, title: c.title ?? "Chat" })));

      let convId = convs?.[0]?.id ?? null;
      if (!convId) {
        const { data: created } = await supabase
          .from("conversations")
          .insert({ user_id: uidv, title: "New chat" })
          .select("id, title")
          .single();
        convId = created?.id ?? null;
        if (created)
          setConversations([{ id: created.id, title: created.title ?? "New chat" }]);
      } else {
        await loadConversation(convId);
      }
      setConversationId(convId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const loadConversation = async (convId: string) => {
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
    setConversationId(convId);
  };

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

  const titleIfFirst = useCallback(
    async (prompt: string) => {
      if (!session || !conversationId || messages.length) return;
      const title = prompt.slice(0, 40);
      await supabase.from("conversations").update({ title }).eq("id", conversationId);
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, title } : c)),
      );
    },
    [session, conversationId, messages.length],
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

  const finishStructuredResponse = async (
    initial: string,
    history: Msg[],
    kind: "web" | "music",
    assistantId: string,
  ): Promise<string> => {
    let combined = initial;
    let attempt = 0;

    // Keep continuing when the artifact is genuinely incomplete, but stop
    // immediately once the actual artifact is structurally valid. The previous
    // "infinite" implementation could mistake a valid song fence for an
    // incomplete response, so completion is now validated against the schema
    // that the renderer/preview actually consumes.
    while (true) {
      attempt += 1;

      const complete =
        kind === "web"
          ? (() => {
              const project = extractWebProject(combined);
              if (!project) return false;
              const files = Object.keys(project.files);
              return files.includes("index.html") && files.length >= 10;
            })()
          : (() => {
              const raw = extractBlock(combined, "json");
              if (!raw) return false;
              try {
                const parsed = JSON.parse(raw) as Partial<SongSpec>;
                return (
                  typeof parsed.title === "string" &&
                  parsed.title.trim().length > 0 &&
                  Number.isFinite(parsed.bpm) &&
                  Number.isFinite(parsed.durationSec) &&
                  Array.isArray(parsed.lyrics) &&
                  parsed.lyrics.length > 0 &&
                  Array.isArray(parsed.chords) &&
                  parsed.chords.length > 0 &&
                  Array.isArray(parsed.melody) &&
                  parsed.melody.length > 0
                );
              } catch {
                return false;
              }
            })();
      if (complete) return combined;

      const instruction =
        kind === "web"
          ? `CONTINUATION REQUIRED — PASS ${attempt}. Your previous website response is STILL INCOMPLETE. Continue from EXACTLY where the previous response ended. Do NOT restart the project and do NOT repeat complete files already present. If a file fence is open, finish that exact file and close it first. Then emit the next missing files using the exact file:path fenced-block format. Keep continuing until the combined response contains at least 10 complete files. Output ONLY the missing continuation. If the previous pass made no progress, repair the exact incomplete fence/file now.`
          : `CONTINUATION REQUIRED — PASS ${attempt}. Your previous song composition JSON is STILL INCOMPLETE. Continue from EXACTLY where it ended. Do NOT restart, summarize, or repeat completed JSON. Finish the same JSON object, every required field, and close the json fence correctly. Output ONLY the missing continuation. If the previous pass made no progress, repair the exact incomplete JSON now. No commentary.`;

      try {
        const next = await streamChat(
          [
            ...history,
            { role: "assistant", content: combined },
            { role: "user", content: instruction },
          ],
          kind,
          memories,
          (text) => {
            const merged = combined + "\n\n" + text;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: merged } : m)),
            );
          },
        );
        if (next.trim()) {
          combined = combined + "\n\n" + next;
        }
      } catch {
        // A transient provider/stream failure must not surface as a false
        // "incomplete response" error. Retry the continuation indefinitely.
        await new Promise((resolve) => setTimeout(resolve, Math.min(5000, 750 + attempt * 250)));
      }
    }
    return combined;
  };

  const send = async (override?: string) => {
    const prompt = (override ?? input).trim();
    if (!prompt || busy) return;
    setInput("");
    setError(null);

    const userMsg: ChatMessage = { id: uid(), role: "user", content: prompt, mode };
    void titleIfFirst(prompt);
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

      if (mode === "model") {
        setStatus("Tripo AI is sculpting your model…");
        try {
          const url = await generateModel(prompt, (p) =>
            setStatus(`Tripo AI is sculpting your model… ${Math.round(p)}%`),
          );
          const msg: ChatMessage = {
            id: assistantId,
            role: "assistant",
            content: `One high-poly **${prompt}**, sculpted by Tripo AI and served warm. Spin it, then grab the .glb. 🧊`,
            mode,
            attachment: { kind: "model", url, source: "Tripo AI" },
          };
          setMessages((prev) => [...prev, msg]);
          void persist(msg);
          return;
        } catch {
          setStatus("Sculpting your model in Zeros' studio engine…");
          let spec: ModelSpec | null = null;
          for (let attempt = 0; attempt < 2 && !spec; attempt += 1) {
            try {
              const plan = await streamChat(
                [
                  {
                    role: "user",
                    content:
                      attempt === 0
                        ? prompt
                        : `${prompt}\n\nYour previous JSON was invalid. Return ONLY the valid json block.`,
                  },
                ],
                "model",
                memories,
                () => {},
              );
              const raw = extractBlock(plan, "json");
              const parsed = raw ? JSON.parse(raw) : null;
              if (isModelSpec(parsed)) spec = parsed;
            } catch {
              spec = null;
            }
          }
          const msg: ChatMessage = {
            id: assistantId,
            role: "assistant",
            content: spec
              ? `Sculpted your **${prompt}** in my studio engine — ${spec.parts.length} bevelled PBR parts, studio HDRI lighting, surface relief and soft shadows. Spin it, then grab the .glb. 🧊`
              : `Sculpting engine fell back to Zeros' procedural studio mesh for **${prompt}**. 🧊`,
            mode,
            attachment: spec
              ? { kind: "model", source: "Zeros studio sculptor", prompt, spec }
              : { kind: "model", source: "Zeros procedural studio mesh", prompt },
          };
          setMessages((prev) => [...prev, msg]);
          void persist(msg);
          return;
        }
      }

      setStatus(
        mode === "search"
          ? "Searching the web…"
          : mode === "music"
            ? "Writing a banger…"
            : mode === "web"
              ? "Building your site…"
              : "Thinking…",
      );

      const history: Msg[] = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "", mode },
      ]);

      let full = await streamChat(history, mode, memories, (text) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: text } : m)),
        );
      });

      if (mode === "web" || mode === "music") {
        setStatus(mode === "web" ? "Finishing every website file…" : "Finishing the composition…");
        full = await finishStructuredResponse(full, history, mode, assistantId);
      }

      let attachment: Attachment | null = null;
      let content = full;

      if (mode === "web") {
        const project = extractWebProject(full);
        if (!project || Object.keys(project.files).length < 3)
          throw new Error("The website response ended before every file was complete. Please retry it.");
        attachment = { kind: "web", project };
        content =
          (full.replace(/```[\s\S]*?```/g, "").trim() || "Full multi-page project, freshly built. ⚡") +
          `\n\n**${Object.keys(project.files).length} files** generated — preview, browse the code, or download the .zip.`;
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
            throw new Error("The song plan was incomplete. Please retry it — your lyrics are preserved above.");
          }
        } else {
          throw new Error("The song response ended before its composition data was complete. Please retry it.");
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

  const beginMaiHold = (event: React.PointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, textarea, select, form, [role=\"button\"]")) return;
    if (maiTimer.current !== null) return;

    const startedAt = performance.now();
    const tick = () => {
      if (performance.now() - startedAt < 10_000) return;
      if (maiTimer.current !== null) window.clearInterval(maiTimer.current);
      maiTimer.current = null;
      setMaiUnlocking(true);
      window.setTimeout(() => navigate({ to: "/mai" }), 900);
    };

    // Intentionally show NO "hold for 10 seconds" UI while the timer is running.
    maiTimer.current = window.setInterval(tick, 50);
  };

  const cancelMaiHold = () => {
    if (maiTimer.current !== null) {
      window.clearInterval(maiTimer.current);
      maiTimer.current = null;
    }
  };

  useEffect(() => () => {
    if (maiTimer.current !== null) window.clearInterval(maiTimer.current);
  }, []);

  const signOut = async () => {
    sessionStorage.removeItem("zeros_guest");
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const newChat = async () => {
    setMessages([]);
    setSidebar(false);
    if (!session) return;
    const { data } = await supabase
      .from("conversations")
      .insert({ user_id: session.user.id, title: "New chat" })
      .select("id, title")
      .single();
    if (data) {
      setConversations((prev) => [{ id: data.id, title: data.title ?? "New chat" }, ...prev]);
      setConversationId(data.id);
    }
  };

  if (!ready) {
    return (
      <main className="relative min-h-screen">
        <TunnelBackground />
        <div className="relative z-10 flex min-h-screen items-center justify-center text-sm text-muted-foreground">
          Waking Zeros…
        </div>
      </main>
    );
  }

  return (
    <main
      className="relative flex min-h-screen flex-col"
      onPointerDown={beginMaiHold}
      onPointerUp={cancelMaiHold}
      onPointerCancel={cancelMaiHold}
      onPointerLeave={cancelMaiHold}
    >
      <TunnelBackground speed={0.5} />

      {maiUnlocking && (
        <div className="pointer-events-none fixed inset-0 z-[60] grid place-items-center bg-black/35 backdrop-blur-sm">
          <div className="rounded-[2rem] border border-fuchsia-200/25 bg-black/60 px-8 py-7 text-center shadow-[0_0_140px_rgba(232,121,249,.28)] backdrop-blur-2xl animate-in zoom-in-95 fade-in duration-500">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-fuchsia-200/30 bg-fuchsia-400/10 shadow-[0_0_60px_rgba(232,121,249,.25)]">
              <Sparkles className="h-7 w-7 text-fuchsia-200 animate-pulse" />
            </div>
            <div className="mt-5 text-xs font-bold tracking-[0.35em] text-fuchsia-200/70 uppercase">MAI unlocked</div>
            <div className="mt-2 text-2xl font-black">Entering the hidden room…</div>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-30 px-3 pt-3">
        <div className="glass mx-auto flex max-w-3xl items-center justify-between rounded-3xl px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebar(true)}
              aria-label="Open menu"
              className="text-foreground/90 transition hover:text-primary"
            >
              <Menu className="h-6 w-6" />
            </button>
            <span className="text-lg font-black tracking-tight">Zeros</span>
          </div>
          <span className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-[11px] tracking-[0.15em] text-muted-foreground uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {isGuest && !session ? "Guest" : "Memory"}
          </span>
        </div>
      </header>

      {sidebar && (
        <div className="fixed inset-0 z-40 flex" role="dialog">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebar(false)}
          />
          <aside className="glass relative flex h-full w-[86%] max-w-sm flex-col rounded-r-3xl p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ZerosOrb size={32} />
                <span className="text-lg font-black">Zeros</span>
              </div>
              <button onClick={() => setSidebar(false)} aria-label="Close menu">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <button
              onClick={() => void newChat()}
              className="mt-5 flex items-center justify-center gap-2 rounded-full bg-[var(--gradient-zero)] px-5 py-3 text-sm font-bold text-primary-foreground"
              style={{ background: "var(--gradient-zero)" }}
            >
              <Plus className="h-4 w-4" /> New chat
            </button>

            <p className="mt-6 text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
              Conversations
            </p>
            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
              {conversations.length === 0 && (
                <p className="text-sm text-muted-foreground">No chats yet.</p>
              )}
              {conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    void loadConversation(c.id);
                    setSidebar(false);
                  }}
                  className={
                    "block w-full truncate rounded-xl px-3 py-2 text-left text-sm transition " +
                    (c.id === conversationId
                      ? "bg-white/10 text-foreground"
                      : "text-muted-foreground hover:bg-white/5")
                  }
                >
                  {c.title}
                </button>
              ))}
            </div>

            <p className="mt-6 flex items-center gap-2 text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
              <Brain className="h-4 w-4 text-accent" /> Memory
            </p>
            <div className="mt-2 flex-1 space-y-1 overflow-y-auto text-sm text-muted-foreground">
              {memories.length === 0 ? (
                <p>Zeros remembers durable facts about you as you chat.</p>
              ) : (
                memories.map((m, i) => (
                  <p key={i} className="rounded-lg bg-white/5 px-3 py-1.5">
                    {m}
                  </p>
                ))
              )}
            </div>

            <button
              onClick={() => void signOut()}
              className="mt-4 flex items-center gap-3 rounded-full border border-border px-4 py-3 text-left"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
                <User className="h-4 w-4" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold">
                  {session ? (session.user.email ?? "Signed in") : "Guest session"}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {session ? "Memory & chats saved" : "Chats are not saved"}
                </span>
              </span>
              <LogOut className="h-4 w-4 text-muted-foreground" />
            </button>
            <p className="mt-3 text-xs text-muted-foreground">
              Zeros can make mistakes. Verify important details.
            </p>
          </aside>
        </div>
      )}

      <section className="relative z-10 mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-60">
        {messages.length === 0 && (
          <div className="flex flex-col items-center text-center">
            <div className="mt-6 animate-float">
              <ZerosOrb size={140} />
            </div>
            <h1 className="text-gradient mt-8 text-4xl font-black tracking-tight">
              Meet Zeros
            </h1>
            <p className="mt-4 max-w-md text-balance text-sm text-muted-foreground">
              Live web search, image generation, real 3D models, original songs and a code
              canvas — with memory that follows your account.
            </p>

            <div className="mt-8 w-full space-y-3">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  onClick={() => {
                    setMode(s.mode);
                    void send(s.text);
                  }}
                  className="glass flex w-full items-center gap-4 rounded-full px-5 py-4 text-left text-sm transition hover:bg-white/10"
                >
                  <s.Icon className="h-5 w-5 text-primary" />
                  {s.text}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-5">
          {messages.map((m) => {
            const isEmptyAssistant = m.role === "assistant" && !m.content && !m.attachment;
            if (isEmptyAssistant) return null;
            return (
              <div
                key={m.id}
                className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] rounded-3xl rounded-br-md bg-primary px-4 py-3 text-sm text-primary-foreground"
                      : "glass w-full rounded-3xl rounded-bl-md px-4 py-3 text-sm"
                  }
                >
                  {m.role === "assistant" ? (
                    <>
                      <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-[oklch(0.1_0.01_265)]">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                      </div>
                      {m.attachment?.kind === "image" && (
                        <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-black/20">
                          <img
                            src={m.attachment.src}
                            alt={`Generated by Zeros: ${m.content.replace(/[*_]/g, "").slice(0, 120)}`}
                            className="block h-auto w-full object-contain"
                            loading="eager"
                            decoding="async"
                          />
                          <div className="border-t border-border p-2">
                            <button
                              type="button"
                              onClick={() => void downloadImageAsPng(m.attachment!.kind === "image" ? m.attachment.src : "", "zeros-image.png")}
                              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
                            >
                              Download .png
                            </button>
                          </div>
                        </div>
                      )}
                      {m.attachment?.kind === "model" && (
                        <ModelViewer
                          {...(m.attachment.code ? { code: m.attachment.code } : {})}
                          {...(m.attachment.url ? { url: m.attachment.url } : {})}
                          {...(m.attachment.source ? { source: m.attachment.source } : {})}
                          {...("prompt" in m.attachment && m.attachment.prompt
                            ? { prompt: m.attachment.prompt }
                            : {})}
                          {...("spec" in m.attachment && m.attachment.spec
                            ? { spec: m.attachment.spec }
                            : {})}
                        />
                      )}
                      {m.attachment?.kind === "web" && (
                        <WebPreview project={m.attachment.project} />
                      )}
                      {m.attachment?.kind === "song" && (
                        <SongBlock
                          spec={m.attachment.spec}
                          url={songUrls[m.id]}
                          onRender={async (spec) => {
                            const blob = await renderSong(spec);
                            setSongUrls((p) => ({
                              ...p,
                              [m.id]: URL.createObjectURL(blob),
                            }));
                          }}
                        />
                      )}
                    </>
                  ) : (
                    <span className="whitespace-pre-wrap">{m.content}</span>
                  )}
                </div>
              </div>
            );
          })}
          {busy && (
            <div className="zeros-thinking" role="status" aria-live="polite" aria-label="Zeros is thinking">
              <span className="zeros-thinking-orb" aria-hidden="true" />
              <span className="zeros-thinking-label">Thinking</span>
              <span className="zeros-thinking-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              {status && <span className="sr-only">{status}</span>}
            </div>
          )}
          {error && <p className="text-xs text-destructive">⚠ {error}</p>}
        </div>
        <div ref={bottomRef} />
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 px-3 pb-4">
        <div className="glass mx-auto max-w-3xl rounded-3xl p-4">
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
            placeholder="Message Zeros…"
            className="max-h-40 w-full resize-none bg-transparent px-1 py-1 text-base outline-none placeholder:text-muted-foreground"
          />
          <div className="mt-3 flex items-center gap-3">
            <div className="flex flex-1 gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {MODES.map((m) => {
                const active = mode === m.id;
                return (
                  <button
                    key={m.id}
                    aria-label={m.label}
                    onClick={() => setMode(active ? "chat" : m.id)}
                    className={
                      "flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition " +
                      (active
                        ? "border-transparent bg-primary text-primary-foreground shadow-[var(--glow-primary)]"
                        : "border-border text-muted-foreground hover:text-foreground")
                    }
                  >
                    <m.Icon className="h-4 w-4" />
                    {m.label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => void send()}
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-primary-foreground transition disabled:opacity-40"
              style={{ background: "var(--gradient-zero)" }}
            >
              <ArrowUp className="h-5 w-5" />
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
