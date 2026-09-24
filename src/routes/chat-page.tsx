import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import {
  ArrowUp,
  Boxes,
  Check,
  Code2,
  Globe,
  Image as ImageIcon,
  LogOut,
  Menu,
  Music4,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";

import TunnelBackground from "@/components/TunnelBackground";
import ModelViewer from "@/components/ModelViewer";
import WebPreview from "@/components/WebPreview";
import ZerosOrb from "@/components/ZerosOrb";
import ThinkingTrace from "@/components/ThinkingTrace";
import { supabase } from "@/integrations/supabase/client";
import { firebaseAuth, signOutFirebase } from "@/lib/firebase";
import { downloadImageAsPng, generateImage, streamChat, type Msg } from "@/lib/ai-client";
import { extractBlock, type ZeroMode } from "@/lib/zeros";
import { renderSong, type SongSpec } from "@/lib/song";
import {
  extractJsonObject,
  normalizeParticleSculptSpec,
  type ParticleSculptSpec,
} from "@/lib/particle-model";
import { uploadChatAsset } from "@/lib/chat-assets";
import {
  hydrateAttachment,
  persistModelAssets,
  persistSongAssets,
  persistWebAssets,
  type ChatAttachment,
} from "@/lib/chat-attachments";
import { extractWebProject, type WebProject } from "@/lib/web-project";
import { SongBlock } from "@/routes/song-block";

type Attachment = ChatAttachment;

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
  if (error instanceof TypeError || (error instanceof Error && /load failed|failed to fetch/i.test(error.message))) {
    return "Network hiccup talking to the cloud. Check your connection and try again.";
  }
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

export function ChatPage() {
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
  const [thinkingMode, setThinkingMode] = useState<ZeroMode>("chat");
  const [error, setError] = useState<string | null>(null);
  const [maiUnlocking, setMaiUnlocking] = useState(false);
  const maiTimer = useRef<number | null>(null);
  const [conversations, setConversations] = useState<{ id: string; title: string }[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [songUrls, setSongUrls] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const guest = sessionStorage.getItem("zeros_guest") === "1";
    setIsGuest(guest);
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
        await session.getIdToken(true);
        // Brief pause so Safari has the Firebase token ready for Supabase (avoids TypeError: Load failed).
        await new Promise((r) => window.setTimeout(r, 80));
        const { data: convs, error: conversationLoadError } = await supabase
          .from("conversations")
          .select("id, title")
          .eq("user_id", uidv)
          .order("updated_at", { ascending: false });
        if (conversationLoadError) throw conversationLoadError;
        setConversations((convs ?? []).map((c) => ({ id: c.id, title: c.title ?? "Chat" })));
        const firstConversation = convs?.[0];
        if (firstConversation) await loadConversation(firstConversation.id);
        else {
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
        // Soft-fail: keep chat usable even if cloud load fails (common Safari "Load failed").
        setError(
          `Could not load saved chats (${formatZerosDataError(e, "network error")}). Starting fresh — new messages will still try to save.`,
        );
        setConversations([]);
        setConversationId(null);
        setMessages([]);
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
    const restoredSongUrls: Record<string, string> = {};
    const hydrated = await Promise.all(
      (rows ?? []).map(async (r) => {
        const raw = (r.attachment as Attachment | null) ?? null;
        const { attachment, songUrl } = await hydrateAttachment(raw, r.id);
        if (songUrl) restoredSongUrls[r.id] = songUrl;
        return {
          id: r.id,
          role: r.role as "user" | "assistant",
          content: r.content,
          mode: (r.mode as ZeroMode) ?? undefined,
          attachment,
        };
      }),
    );
    setMessages(hydrated);
    setSongUrls((prev) => ({ ...prev, ...restoredSongUrls }));
    setConversationId(convId);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const persist = useCallback(
    async (m: ChatMessage, forcedConversationId?: string) => {
      if (!session) return;
      let activeConversationId = forcedConversationId ?? conversationId;
      if (!activeConversationId) {
        const { data: created, error: createError } = await supabase
          .from("conversations")
          .insert({ user_id: session.uid, title: "New chat" })
          .select("id, title")
          .single();
        if (createError || !created) throw createError ?? new Error("Could not create a Zeros conversation.");
        activeConversationId = created.id;
        setConversationId(created.id);
        setConversations((prev) => [{ id: created.id, title: created.title ?? "New chat" }, ...prev]);
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
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", activeConversationId)
        .eq("user_id", session.uid);
      return activeConversationId;
    },
    [session, conversationId],
  );

  const titleIfFirst = useCallback(
    async (prompt: string) => {
      if (!session || !conversationId || messages.length) return;
      const title = prompt.slice(0, 40);
      await supabase.from("conversations").update({ title }).eq("id", conversationId).eq("user_id", session.uid);
      setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, title } : c)));
    },
    [session, conversationId, messages.length],
  );

  const send = async (override?: string, forcedMode?: ZeroMode) => {
    const requestMode = forcedMode ?? mode;
    const prompt = (override ?? input).trim();
    if (!prompt || busy || (session && !accountDataReady)) return;
    setInput("");
    setError(null);
    setBusy(true);
    setThinkingMode(requestMode);
    setStatus(
      requestMode === "search"
        ? "Searching the web…"
        : requestMode === "image"
          ? "Painting pixels…"
          : requestMode === "model"
            ? "Sculpting a Meshy-class local 3D model…"
            : requestMode === "music"
              ? "Writing a banger…"
              : requestMode === "web"
                ? "Building your site…"
                : "Thinking…",
    );

    const userMsg: ChatMessage = { id: uid(), role: "user", content: prompt, mode: requestMode };
    const assistantId = uid();

    try {
      const activeConversationId = await persist(userMsg);
      await titleIfFirst(prompt);
      setMessages((prev) => [...prev, userMsg]);

      if (requestMode === "image") {
        const src = await generateImage(prompt);
        let storagePath: string | undefined;
        if (session && activeConversationId) {
          const blob = await fetch(src).then((r) => r.blob());
          const asset = await uploadChatAsset(session.uid, activeConversationId, blob, "generated-image.png");
          storagePath = asset.storagePath;
        }
        const msg: ChatMessage = {
          id: assistantId,
          role: "assistant",
          content: `Behold: **${prompt}** — freshly rendered, no credits harmed. 🎨`,
          mode: requestMode,
          attachment: { kind: "image", src, ...(storagePath ? { storagePath } : {}) },
        };
        setMessages((prev) => [...prev, msg]);
        await persist(msg);
        return;
      }

      if (requestMode === "model") {
        let spec: ParticleSculptSpec | null = null;
        for (let attempt = 0; attempt < 3 && !spec; attempt += 1) {
          setStatus(
            attempt === 0
              ? "Planning the sculpt and density fields…"
              : attempt === 1
                ? "Retrying with a cleaner JSON brief…"
                : "Final attempt — simplifying the field layout…",
          );
          try {
            const plan = await streamChat(
              [
                {
                  role: "user",
                  content:
                    attempt === 0
                      ? `${prompt}\n\nPRODUCTION SCULPT BRIEF — Meshy-class local density fields:\n- Output 40-64 components for vehicles/characters/complex objects (16-28 for simple props).\n- If this is a CAR / vehicle: include separate body, cabin, hood, rear deck, 4x tire(torus)+rim(cylinder) pairs at ground level, fenders, bumpers, headlights, taillights, side skirts, windows (dark glass), and spoiler if sports. Wheels must touch ground; body sits above axles. Tire = black rubber; rim = metal; body = paint; glass = dark low-metalness.\n- Proportions must read as a real production product, not a single blob.\n- Varied materials per part. detail 0.92-1.0. blend 0.02-0.12 so parts stay readable.\n- Return ONLY one complete JSON sculpt object. virtualParticles 1000000. No markdown fences.`
                      : attempt === 1
                        ? `${prompt}\n\nReturn ONLY one complete JSON object for the Zeros local sculpt.\nvirtualParticles 1000000, 36-56 components. Prefer real part hierarchy (body + cabin + 4 wheels with tires+rims + lights + glass). No markdown fences.`
                        : `${prompt}\n\nSimplify carefully but keep wheels/tires/body/cabin readable. Return ONLY one valid JSON object with 24-40 components. virtualParticles 1000000. No fences.`,
                },
              ],
              "model",
              [],
              () => {},
            );
            const normalized =
              normalizeParticleSculptSpec(plan) ??
              normalizeParticleSculptSpec(extractBlock(plan, "json")) ??
              normalizeParticleSculptSpec(extractJsonObject(plan));
            if (normalized) spec = normalized;
          } catch {
            spec = null;
          }
        }
        if (!spec) {
          throw new Error(
            "Zeros could not finish a valid 3D sculpt this time. Please retry — usually works on the next try.",
          );
        }
        let storagePath: string | undefined;
        let glbPath: string | undefined;
        if (session && activeConversationId) {
          const paths = await persistModelAssets(session.uid, activeConversationId, spec);
          storagePath = paths.storagePath;
          glbPath = paths.glbPath;
        }
        const msg: ChatMessage = {
          id: assistantId,
          role: "assistant",
          content: `Built **${prompt}** with Zeros' local Meshy-class engine — dense density fields, clean topology, PBR shading, downloadable .glb. No external 3D API. 🧬`,
          mode: requestMode,
          attachment: {
            kind: "model",
            source: "Zeros Local Meshy-Class Engine",
            prompt,
            spec,
            ...(storagePath ? { storagePath } : {}),
            ...(glbPath ? { glbPath } : {}),
          },
        };
        setMessages((prev) => [...prev, msg]);
        await persist(msg);
        return;
      }

      const history: Msg[] = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "", mode: requestMode }]);

      let full = await streamChat(history, requestMode, [], (text) => {
        if (requestMode !== "web" && requestMode !== "music") {
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: text } : m)));
        }
      });

      let attachment: Attachment | null = null;
      let content = full;

      if (requestMode === "web") {
        const project = extractWebProject(full);
        if (!project || Object.keys(project.files).length < 3) {
          throw new Error("The website response ended before every file was complete. Please retry it.");
        }
        let webStoragePath: string | undefined;
        if (session && activeConversationId) {
          const paths = await persistWebAssets(session.uid, activeConversationId, project);
          webStoragePath = paths.storagePath;
        }
        attachment = {
          kind: "web",
          project,
          ...(webStoragePath ? { storagePath: webStoragePath } : {}),
        };
        content =
          (full.replace(/```[\s\S]*?```/g, "").trim() || "Full multi-page project, freshly built. ⚡") +
          `\n\n**${Object.keys(project.files).length} files** generated — preview, browse the code, or download the .zip.`;
      } else if (requestMode === "music") {
        const raw = extractBlock(full, "json");
        if (!raw) throw new Error("The song response ended before its composition data was complete. Please retry it.");
        const songSpec = JSON.parse(raw) as SongSpec;
        attachment = { kind: "song", spec: songSpec };
        content =
          (full.replace(/```[\s\S]*?```/, "").trim() || "Track incoming. 🎵") +
          `\n\n**${songSpec.title}** · ${songSpec.bpm} BPM · ${songSpec.style ?? "original"}`;
        setStatus("Rendering audio…");
        const blob = await renderSong(songSpec);
        const localUrl = URL.createObjectURL(blob);
        setSongUrls((p) => ({ ...p, [assistantId]: localUrl }));
        if (session && activeConversationId) {
          const paths = await persistSongAssets(
            session.uid,
            activeConversationId,
            blob,
            songSpec.title || "zeros-song",
          );
          if (paths.storagePath) {
            attachment = { kind: "song", spec: songSpec, storagePath: paths.storagePath };
          }
        }
      }

      const finalMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content,
        mode: requestMode,
        attachment,
      };
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? finalMsg : m)));
      await persist(finalMsg, activeConversationId);
    } catch (e) {
      console.error("[Zeros] message request failed:", e);
      setError(`Message failed: ${formatZerosDataError(e, "The request returned an unknown error.")}`);
      setMessages((prev) => prev.filter((m) => m.id !== assistantId || m.content));
    } finally {
      setBusy(false);
      setStatus(null);
    }
  };

  const beginMaiHold = (event: React.PointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, textarea, select, form, [role="button"]')) return;
    if (maiTimer.current !== null) return;
    const startedAt = performance.now();
    maiTimer.current = window.setInterval(() => {
      if (performance.now() - startedAt < 10_000) return;
      if (maiTimer.current !== null) window.clearInterval(maiTimer.current);
      maiTimer.current = null;
      setMaiUnlocking(true);
      window.setTimeout(() => navigate({ to: "/mai" }), 900);
    }, 50);
  };

  const cancelMaiHold = () => {
    if (maiTimer.current !== null) {
      window.clearInterval(maiTimer.current);
      maiTimer.current = null;
    }
  };

  useEffect(
    () => () => {
      if (maiTimer.current !== null) window.clearInterval(maiTimer.current);
    },
    [],
  );

  const signOut = async () => {
    sessionStorage.removeItem("zeros_guest");
    await signOutFirebase();
    navigate({ to: "/" });
  };

  const renameConversation = async (convId: string, title: string) => {
    const clean = title.trim().slice(0, 80) || "Chat";
    if (!session) {
      setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, title: clean } : c)));
      setRenamingId(null);
      return;
    }
    const { error: err } = await supabase
      .from("conversations")
      .update({ title: clean, updated_at: new Date().toISOString() })
      .eq("id", convId)
      .eq("user_id", session.uid);
    if (err) {
      setError("Could not rename conversation: " + err.message);
      return;
    }
    setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, title: clean } : c)));
    setRenamingId(null);
  };

  const deleteConversation = async (convId: string) => {
    if (deletingId) return;
    const confirmed =
      typeof window !== "undefined"
        ? window.confirm(
            "Delete this conversation forever? Messages will be permanently removed from Supabase.",
          )
        : true;
    if (!confirmed) return;
    setDeletingId(convId);
    try {
      if (session) {
        const { error: msgErr } = await supabase
          .from("messages")
          .delete()
          .eq("conversation_id", convId)
          .eq("user_id", session.uid);
        if (msgErr) throw msgErr;
        const { error: convErr } = await supabase
          .from("conversations")
          .delete()
          .eq("id", convId)
          .eq("user_id", session.uid);
        if (convErr) throw convErr;
      }
      const remaining = conversations.filter((c) => c.id !== convId);
      setConversations(remaining);
      if (conversationId === convId) {
        setMessages([]);
        setConversationId(null);
        setSongUrls({});
        if (remaining[0]) {
          await loadConversation(remaining[0].id);
        } else if (session) {
          const { data, error: createErr } = await supabase
            .from("conversations")
            .insert({ user_id: session.uid, title: "New chat" })
            .select("id, title")
            .single();
          if (createErr) throw createErr;
          if (data) {
            setConversations([{ id: data.id, title: data.title ?? "New chat" }]);
            setConversationId(data.id);
          }
        }
      }
    } catch (e) {
      console.error("[Zeros] delete conversation failed:", e);
      setError(`Could not delete conversation: ${formatZerosDataError(e, "Unknown error")}`);
    } finally {
      setDeletingId(null);
    }
  };

  const newChat = async () => {
    setMessages([]);
    setSidebar(false);
    setRenamingId(null);
    if (!session) return;
    const { data, error: err } = await supabase
      .from("conversations")
      .insert({ user_id: session.uid, title: "New chat" })
      .select("id, title")
      .single();
    if (err) {
      setError("Could not create a new Zeros conversation: " + err.message);
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
          <div className="rounded-[2rem] border border-fuchsia-200/25 bg-black/60 px-8 py-7 text-center shadow-[0_0_140px_rgba(232,121,249,.28)] backdrop-blur-2xl">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-fuchsia-200/30 bg-fuchsia-400/10">
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
            <button onClick={() => setSidebar(true)} aria-label="Open menu" className="text-foreground/90 transition hover:text-primary">
              <Menu className="h-6 w-6" />
            </button>
            <span className="text-lg font-black tracking-tight">Zeros</span>
          </div>
          <span className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Online
          </span>
        </div>
      </header>

      {sidebar && (
        <div className="fixed inset-0 z-40 flex" role="dialog">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebar(false)} />
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
              className="mt-5 flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold text-primary-foreground"
              style={{ background: "var(--gradient-zero)" }}
            >
              <Plus className="h-4 w-4" /> New chat
            </button>
            <p className="mt-6 text-[11px] tracking-[0.2em] text-muted-foreground uppercase">Conversations</p>
            <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">
              {conversations.map((c) => (
                <div
                  key={c.id}
                  className={
                    "group flex items-center gap-1 rounded-xl px-2 py-1.5 " +
                    (c.id === conversationId ? "bg-white/10 text-foreground" : "text-muted-foreground hover:bg-white/5")
                  }
                >
                  {renamingId === c.id ? (
                    <form
                      className="flex min-w-0 flex-1 items-center gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void renameConversation(c.id, renameValue);
                      }}
                    >
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="min-w-0 flex-1 rounded-lg border border-border bg-black/40 px-2 py-1 text-sm text-foreground outline-none"
                        maxLength={80}
                      />
                      <button type="submit" aria-label="Save name" className="rounded-lg p-1.5 text-primary hover:bg-white/10">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" aria-label="Cancel rename" onClick={() => setRenamingId(null)} className="rounded-lg p-1.5 hover:bg-white/10">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          void loadConversation(c.id);
                          setSidebar(false);
                        }}
                        className="min-w-0 flex-1 truncate px-1 py-1 text-left text-sm"
                      >
                        {c.title}
                      </button>
                      <button
                        type="button"
                        aria-label="Rename conversation"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingId(c.id);
                          setRenameValue(c.title);
                        }}
                        className="rounded-lg p-1.5 opacity-70 hover:bg-white/10 hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete conversation forever"
                        disabled={deletingId === c.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteConversation(c.id);
                        }}
                        className="rounded-lg p-1.5 text-destructive opacity-70 hover:bg-destructive/15 hover:opacity-100 disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              ))}
              {conversations.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">No conversations yet.</p>
              )}
            </div>
            <button onClick={() => void signOut()} className="mt-4 flex items-center gap-3 rounded-full border border-border px-4 py-3 text-left">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
                <User className="h-4 w-4" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold">{session ? (session.email ?? "Signed in") : "Guest session"}</span>
                <span className="block text-xs text-muted-foreground">{session ? "Chats saved" : "Chats not saved"}</span>
              </span>
              <LogOut className="h-4 w-4 text-muted-foreground" />
            </button>
          </aside>
        </div>
      )}

      <section className="relative z-10 mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-60">
        {messages.length === 0 && (
          <div className="flex flex-col items-center text-center">
            <div className="mt-6 animate-float">
              <ZerosOrb size={140} />
            </div>
            <h1 className="text-gradient mt-8 text-4xl font-black tracking-tight">Meet Zeros</h1>
            <p className="mt-4 max-w-md text-balance text-sm text-muted-foreground">
              Live web search, image generation, Meshy-class local 3D models, original songs and a code canvas.
            </p>
            <div className="mt-8 w-full space-y-3">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  onClick={() => {
                    setMode(s.mode);
                    void send(s.text, s.mode);
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-white/5 px-4 py-3 text-left text-sm transition hover:bg-white/10"
                >
                  <s.Icon className="h-4 w-4 shrink-0 text-primary" />
                  {s.text}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-6">
          {messages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
              <div
                className={
                  "max-w-[92%] rounded-3xl px-4 py-3 text-sm leading-relaxed " +
                  (m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-white/5 text-foreground")
                }
              >
                {m.role === "assistant" ? (
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                )}
                {m.attachment?.kind === "image" && m.attachment.src && (
                  <div className="mt-3 overflow-hidden rounded-2xl">
                    <img src={m.attachment.src} alt="Generated" className="w-full" />
                    <button
                      type="button"
                      className="mt-2 text-xs underline opacity-80"
                      onClick={() => void downloadImageAsPng(m.attachment!.src!, "zeros-image.png")}
                    >
                      Download PNG
                    </button>
                  </div>
                )}
                {m.attachment?.kind === "model" && m.attachment.spec && (
                  <ModelViewer
                    name={m.attachment.prompt?.slice(0, 40) || "zeros-model"}
                    source={m.attachment.source}
                    prompt={m.attachment.prompt}
                    spec={m.attachment.spec}
                  />
                )}
                {m.attachment?.kind === "web" && m.attachment.project && (
                  <WebPreview project={m.attachment.project} />
                )}
                {m.attachment?.kind === "song" && m.attachment.spec && (
                  <SongBlock spec={m.attachment.spec} audioUrl={songUrls[m.id]} />
                )}
              </div>
            </div>
          ))}
          {busy && <ThinkingTrace mode={thinkingMode} status={status} active />}
          {error && <p className="text-xs text-destructive">⚠ {error}</p>}
        </div>
        <div ref={bottomRef} />
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 px-3 pb-4">
        <div className="glass mx-auto max-w-3xl rounded-3xl p-4">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
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
                    disabled={busy}
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
