import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import {
  ArrowUp,
  Boxes,
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
import { firebaseAuth, signOutFirebase } from "@/lib/firebase";
import { downloadImageAsPng, generateImage, streamChat, type Msg } from "@/lib/ai-client";
import { extractBlock, type ZeroMode } from "@/lib/zeros";
import { renderSong, type SongSpec } from "@/lib/song";
import { normalizeParticleSculptSpec, type ParticleSculptSpec } from "@/lib/particle-model";
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
  | { kind: "model"; source?: string; prompt?: string; spec?: ParticleSculptSpec }
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

function formatZerosDataError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();

  if (typeof error === "object" && error !== null) {
    const value = error as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
      hint?: unknown;
      status?: unknown;
    };

    const parts = [
      typeof value.message === "string" ? value.message : "",
      typeof value.code === "string" ? `[code ${value.code}]` : "",
      typeof value.status === "number" ? `[HTTP ${value.status}]` : "",
      typeof value.details === "string" ? value.details : "",
      typeof value.hint === "string" ? value.hint : "",
    ].filter(Boolean);

    if (parts.length) return parts.join(" — ");
  }

  if (typeof error === "string" && error.trim()) return error.trim();
  return fallback;
}

function ChatPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<FirebaseUser | null>(null);
  const [ready, setReady] = useState(false);
  const [accountDataReady, setAccountDataReady] = useState(false);
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
  const [conversations, setConversations] = useState<{ id: string; title: string }[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [songUrls, setSongUrls] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const guest = sessionStorage.getItem("zeros_guest") === "1";
    setIsGuest(guest);

    // Firebase owns authentication. Supabase is used only as the persistent
    // data layer and receives the current Firebase JWT through its accessToken
    // callback in the shared Supabase client.
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      setSession(user);
      if (!user && !guest) navigate({ to: "/" });
      if (!user || guest) {
        setAccountDataReady(true);
        setReady(true);
      }
    });

    return unsubscribe;
  }, [navigate]);

  useEffect(() => {
    if (!session) return;
    const uidv = session.uid;

    (async () => {
      try {
        // Firebase owns identity. Refresh the token before the first Supabase
        // request so the database sees the current Firebase claims.
        await session.getIdToken(true);

        const { data: convs, error: conversationLoadError } = await supabase
          .from("conversations")
          .select("id, title")
          .eq("user_id", uidv)
          .order("updated_at", { ascending: false });

        if (conversationLoadError) throw conversationLoadError;

        setConversations(
          (convs ?? []).map((c) => ({
            id: c.id,
            title: c.title ?? "Chat",
          })),
        );

        const firstConversation = convs?.[0];
        if (firstConversation) {
          await loadConversation(firstConversation.id);
        } else {
          const { data: created, error: createConversationError } = await supabase
            .from("conversations")
            .insert({ user_id: uidv, title: "New chat" })
            .select("id, title")
            .single();

          if (createConversationError) throw createConversationError;

          if (created) {
            setConversations([{ id: created.id, title: created.title ?? "New chat" }]);
            setConversationId(created.id);
          }
        }
      } catch (e) {
        console.error("[Zeros] conversation data load failed:", e);
        setError(
          `Saved conversations failed: ${formatZerosDataError(
            e,
            "The database request returned an unknown error.",
          )}`,
        );
      } finally {
        setAccountDataReady(true);
        setReady(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const loadConversation = async (convId: string) => {
    const { data: rows, error: loadError } = await supabase
      .from("messages")
      .select("id, role, content, mode, attachment")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
    if (loadError) throw loadError;
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
      if (!session) return;

      let activeConversationId = conversationId;

      // Recover the account's conversation synchronously when necessary.
      if (!activeConversationId) {
        const { data: created, error: createError } = await supabase
          .from("conversations")
          .insert({ user_id: session.uid, title: "New chat" })
          .select("id, title")
          .single();

        if (createError || !created) {
          throw createError ?? new Error("Could not create a Zeros conversation.");
        }

        activeConversationId = created.id;
        setConversationId(created.id);
        setConversations((prev) => [
          { id: created.id, title: created.title ?? "New chat" },
          ...prev,
        ]);
      }

      const attachment =
        m.attachment && m.attachment.kind === "image" && m.attachment.src.length > 900000
          ? null
          : (m.attachment ?? null);

      const { error: messageError } = await supabase.from("messages").insert({
        conversation_id: activeConversationId,
        user_id: session.uid,
        role: m.role,
        content: m.content,
        mode: m.mode ?? null,
        attachment: attachment as never,
      });
      if (messageError) throw messageError;

      const { error: conversationError } = await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", activeConversationId)
        .eq("user_id", session.uid);
      if (conversationError) throw conversationError;
    },
    [session, conversationId],
  );

  const titleIfFirst = useCallback(
    async (prompt: string) => {
      if (!session || !conversationId || messages.length) return;
      const title = prompt.slice(0, 40);
      const { error: titleError } = await supabase
        .from("conversations")
        .update({ title })
        .eq("id", conversationId)
        .eq("user_id", session.uid);
      if (titleError) throw titleError;
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, title } : c)),
      );
    },
    [session, conversationId, messages.length],
  );


  const finishStructuredResponse = async (
    initial: string,
    history: Msg[],
    kind: "web" | "music",
    assistantId: string,
  ): Promise<string> => {
    let combined = initial;
    let continuations = 0;

    const isComplete = (text: string): boolean => {
      if (kind === "web") {
        const project = extractWebProject(text);
        if (!project) return false;
        const files = Object.keys(project.files);
        return files.includes("index.html") && files.length >= 3;
      }

      const raw = extractBlock(text, "json");
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
    };

    // Providers such as Manus can sometimes return a planning/progress message even
    // though structured mode asked for an artifact. If there is no artifact, request
    // a clean artifact-only retry instead of appending more planning prose.
    if (isComplete(combined)) return combined;

    while (continuations < 3) {
      continuations += 1;
      const hasArtifact =
        kind === "web"
          ? /```(?:file:)?[^\n`]+\n[\s\S]*?```/i.test(combined)
          : /```json\s*[\s\S]*?```/i.test(combined);

      const instruction =
        kind === "web"
          ? hasArtifact
            ? "The previous response contains an incomplete website artifact. Continue ONLY the missing artifact. Do not repeat completed files. Do not narrate, explain, plan, or say you will build/test anything. Emit only missing file blocks using ```file:path ...``` and stop as soon as the project is complete."
            : "The previous response was planning/progress narration and did not deliver the website artifact. Ignore that narration completely. Generate the requested website NOW from scratch. Do not discuss your plan or testing. Output ONLY complete ```file:path ...``` blocks for the finished website, with no preamble or progress text."
          : hasArtifact
            ? "The previous response contains an incomplete song JSON artifact. Continue ONLY the missing JSON. Do not repeat completed JSON or add commentary. Close the same JSON object and stop immediately when valid."
            : "The previous response did not deliver the required song JSON. Generate the requested song NOW. Output exactly one short witty line followed by one complete ```json ...``` composition block. Do not discuss your plan or progress.";

      try {
        const next = await streamChat(
          [
            ...history,
            ...(hasArtifact ? [{ role: "assistant" as const, content: combined }] : []),
            { role: "user", content: instruction },
          ],
          kind,
          [],
          () => {
            // Keep recovery attempts invisible. The user sees one clean final artifact
            // instead of the provider changing the same message through every retry.
          },
          undefined,
        );
        if (!next.trim()) break;
        combined = hasArtifact ? combined + "\n\n" + next : next;
        if (isComplete(combined)) return combined;
      } catch {
        break;
      }
    }

    return combined;
  };


  // Providers sometimes omit the json fence or add a short sentence around the
  // artifact. Recover the first complete JSON object instead of throwing away a
  // perfectly usable sculpt description.
  const extractJsonObject = (text: string): string | null => {
    const start = text.indexOf("{");
    if (start < 0) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
    return null;
  };

  const send = async (override?: string) => {
    const prompt = (override ?? input).trim();
    if (!prompt || busy || (session && !accountDataReady)) return;
    setInput("");
    setError(null);
    // Start the thinking state before any persistence, image generation, model
    // planning, music generation, web build, or normal chat request. Previously
    // busy was never set to true, so every mode could appear completely silent.
    setBusy(true);
    setStatus(
      mode === "search"
        ? "Searching the web…"
        : mode === "image"
          ? "Painting pixels…"
          : mode === "model"
            ? "Growing a 300M-particle virtual sculpt…"
            : mode === "music"
              ? "Writing a banger…"
              : mode === "web"
                ? "Building your site…"
                : "Thinking…",
    );

    const userMsg: ChatMessage = { id: uid(), role: "user", content: prompt, mode };
    const assistantId = uid();

    try {
      await persist(userMsg);
      await titleIfFirst(prompt);
      setMessages((prev) => [...prev, userMsg]);
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
        await persist(msg);
        return;
      }

      if (mode === "model") {
        setStatus("Growing a 300M-particle virtual sculpt…");
        let spec: ParticleSculptSpec | null = null;
        for (let attempt = 0; attempt < 3 && !spec; attempt += 1) {
          try {
            const plan = await streamChat(
              [{
                role: "user",
                content: attempt === 0
                  ? prompt
                  : `${prompt}

Your previous response was not usable. Return ONLY one complete JSON object matching the Zeros particle schema. Do not use markdown fences, comments, explanations, or extra text. Keep virtualParticles exactly 300000000 and include at least 24 detailed components.`,
              }],
              "model",
              [],
              () => {},
            );
            const raw = extractBlock(plan, "json") ?? extractJsonObject(plan);
            const parsed = raw ? JSON.parse(raw) : null;
            const normalized = normalizeParticleSculptSpec(parsed);
            if (normalized) spec = normalized;
          } catch {
            spec = null;
          }
        }
        if (!spec) throw new Error("Zeros could not complete the particle sculpt description. Please retry.");

        const msg: ChatMessage = {
          id: assistantId,
          role: "assistant",
          content: `Built **${prompt}** from Zeros' 300,000,000-particle virtual sculpt field — adaptive surface reconstruction, film-style PBR shading and automatic front orientation. No Three.js, Tripo, Meshy or 3D API key is involved. 🧬`,
          mode,
          attachment: { kind: "model", source: "Zeros 300M Particle Sculpt", prompt, spec },
        };
        setMessages((prev) => [...prev, msg]);
        await persist(msg);
        return;
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

      // Structured jobs are buffered until the complete artifact is validated.
      // Never stream provider planning/progress prose into the chat bubble.
      let full = await streamChat(
        history,
        mode,
        [],
        (text) => {
          if (mode !== "web" && mode !== "music") {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: text } : m)),
            );
          }
        },
      );

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
      await persist(finalMsg);
    } catch (e) {
      console.error("[Zeros] message request failed:", e);
      setError(
        `Message failed: ${formatZerosDataError(
          e,
          "The request returned an unknown error.",
        )}`,
      );
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
    await signOutFirebase();
    navigate({ to: "/" });
  };

  const newChat = async () => {
    setMessages([]);
    setSidebar(false);
    if (!session) return;
    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: session.uid, title: "New chat" })
      .select("id, title")
      .single();
    if (error) {
      setError("Could not create a new Zeros conversation: " + error.message);
      return;
    }
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
            {isGuest && !session ? "Guest" : "Online"}
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


            <button
              onClick={() => void signOut()}
              className="mt-4 flex items-center gap-3 rounded-full border border-border px-4 py-3 text-left"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
                <User className="h-4 w-4" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold">
                  {session ? (session.email ?? "Signed in") : "Guest session"}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {session ? "Chats saved to your account" : "Chats are not saved"}
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
              canvas — with your conversations saved to your account.
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
            placeholder={session && !accountDataReady ? "Loading your saved Zeros…" : "Message Zeros…"}
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
              disabled={busy || !input.trim() || (!!session && !accountDataReady)}
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
