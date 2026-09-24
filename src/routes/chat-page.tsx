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
import { buildModelSculptUserMessage, parseAndRefineSculpt } from "@/lib/model-prompt";
import { renderSong, type SongSpec } from "@/lib/song";
import { type ParticleSculptSpec } from "@/lib/particle-model";
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
import {
  formatZerosDataError,
  loadConversationsList,
  loadMessagesForConversation,
} from "@/lib/load-conversations";

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
    const guest = sessionStorage.getItem("keris_guest") === "1";
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
    let cancelled = false;
    (async () => {
      try {
        const convs = await loadConversationsList(session);
        if (cancelled) return;
        setConversations(convs.map((c) => ({ id: c.id, title: c.title ?? "Chat" })));
        setError(null);
        const first = convs[0];
        if (first) {
          try {
            await loadConversation(first.id);
          } catch (msgErr) {
            setConversationId(first.id);
            setMessages([]);
            setError(`Loaded chats, but messages failed (${formatZerosDataError(msgErr, "unknown")}).`);
          }
        } else {
          try {
            await session.getIdToken(false);
          } catch {
            await session.getIdToken(true);
          }
          const { data: created, error: createErr } = await supabase
            .from("conversations")
            .insert({ user_id: session.uid, title: "New chat" })
            .select("id, title")
            .single();
          if (createErr) throw createErr;
          if (created && !cancelled) {
            setConversations([{ id: created.id, title: created.title ?? "New chat" }]);
            setConversationId(created.id);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(`Could not load saved chats (${formatZerosDataError(e, "unknown error")}). You can still chat.`);
        }
      } finally {
        if (!cancelled) {
          setAccountDataReady(true);
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const loadConversation = async (convId: string) => {
    const rows = await loadMessagesForConversation(session, convId);
    const restoredSongUrls: Record<string, string> = {};
    const hydrated = await Promise.all(
      rows.map(async (r) => {
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
        if (createError || !created) {
          activeConversationId = crypto.randomUUID();
          setConversationId(activeConversationId);
          return activeConversationId;
        }
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
      if (messageError) return activeConversationId;
      try {
        await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", activeConversationId)
          .eq("user_id", session.uid);
      } catch {}
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
            ? "Sculpting studio-level 3D (particles + Three.js CSG)…"
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
              ? "Blender-style blockout + Three.js CSG part hierarchy…"
              : attempt === 1
                ? "1M-particle density field + secondary forms…"
                : "Final studio pass — ground contact, PBR, clean topology…",
          );
          try {
            const plan = await streamChat(
              [{ role: "user", content: buildModelSculptUserMessage(prompt, attempt) }],
              "model",
              [],
              () => {},
            );
            const refined = parseAndRefineSculpt(plan, prompt);
            if (refined) spec = refined;
          } catch {
            spec = null;
          }
        }
        if (!spec) {
          throw new Error("Keris could not finish a valid 3D sculpt this time. Please retry.");
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
          content: `Built **${prompt}** with Keris studio engine — Blender-style hierarchy + Three.js CSG + 1M-particle density field. Clean topology .glb. 🧬`,
          mode: requestMode,
          attachment: {
            kind: "model",
            source: "Keris Studio (Blender + Three.js + Particles)",
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
          throw new Error("The website response ended before every file was complete. Please retry.");
        }
        let webStoragePath: string | undefined;
        if (session && activeConversationId) {
          const paths = await persistWebAssets(session.uid, activeConversationId, project);
          webStoragePath = paths.storagePath;
        }
        attachment = { kind: "web", project, ...(webStoragePath ? { storagePath: webStoragePath } : {}) };
        content =
          (full.replace(/```[\s\S]*?```/g, "").trim() || "Full multi-page project, freshly built. ⚡") +
          `\n\n**${Object.keys(project.files).length} files** generated.`;
      } else if (requestMode === "music") {
        const raw = extractBlock(full, "json");
        if (!raw) throw new Error("The song response ended before composition data was complete.");
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
          const paths = await persistSongAssets(session.uid, activeConversationId, blob, songSpec.title || "keris-song");
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
      setError(`Message failed: ${formatZerosDataError(e, "Unknown error.")}`);
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
    sessionStorage.removeItem("keris_guest");
    await signOutFirebase();
    navigate({ to: "/" });
  };

  const renameConversation = async (convId: string, title: string) => {
    const clean = title.trim().slice(0, 80) || "Chat";
    if (session) {
      await supabase.from("conversations").update({ title: clean }).eq("id", convId).eq("user_id", session.uid);
    }
    setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, title: clean } : c)));
    setRenamingId(null);
    setRenameValue("");
  };

  const deleteConversation = async (convId: string) => {
    if (session) {
      await supabase.from("messages").delete().eq("conversation_id", convId);
      await supabase.from("conversations").delete().eq("id", convId).eq("user_id", session.uid);
    }
    setConversations((prev) => prev.filter((c) => c.id !== convId));
    if (conversationId === convId) {
      setConversationId(null);
      setMessages([]);
    }
    setDeletingId(null);
  };

  if (!ready) {
    return (
      <div className="relative min-h-screen">
        <TunnelBackground />
        <div className="relative z-10 flex min-h-screen items-center justify-center text-sm text-muted-foreground">
          Loading Keris…
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative flex min-h-screen flex-col"
      onPointerDown={beginMaiHold}
      onPointerUp={cancelMaiHold}
      onPointerCancel={cancelMaiHold}
      onPointerLeave={cancelMaiHold}
    >
      <TunnelBackground speed={0.5} />
      {maiUnlocking && (
        <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <p className="text-sm text-white/80">Unlocking Mai…</p>
        </div>
      )}

      <header className="sticky top-0 z-30 px-3 pt-3">
        <div className="glass mx-auto flex max-w-3xl items-center justify-between rounded-3xl px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebar(true)}
              className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-foreground/80 transition hover:bg-white/10"
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <span className="text-lg font-black tracking-tight">Keris</span>
          </div>
          <div className="flex items-center gap-2">
            {isGuest ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Guest
              </span>
            ) : (
              <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
                Account
              </span>
            )}
            <button
              type="button"
              onClick={signOut}
              className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-foreground/80 transition hover:bg-white/10"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {sidebar && (
        <div className="fixed inset-0 z-40 flex">
          <button type="button" className="absolute inset-0 bg-black/50" onClick={() => setSidebar(false)} aria-label="Close sidebar" />
          <aside className="relative z-10 flex h-full w-72 flex-col border-r border-white/10 bg-[oklch(0.12_0.02_250)] p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold">Chats</span>
              <button type="button" onClick={() => setSidebar(false)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                setConversationId(null);
                setSidebar(false);
              }}
              className="mb-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm transition hover:bg-white/10"
            >
              <Plus className="h-4 w-4" /> New chat
            </button>
            <div className="flex-1 space-y-1 overflow-y-auto">
              {conversations.map((c) => (
                <div key={c.id} className="group flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-white/5">
                  {renamingId === c.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void renameConversation(c.id, renameValue);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="flex-1 rounded bg-white/10 px-2 py-1 text-sm outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        void loadConversation(c.id);
                        setSidebar(false);
                      }}
                      className="flex-1 truncate text-left text-sm"
                    >
                      {c.title}
                    </button>
                  )}
                  <button type="button" onClick={() => { setRenamingId(c.id); setRenameValue(c.title); }} className="opacity-0 group-hover:opacity-100" aria-label="Rename">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => setDeletingId(c.id)} className="opacity-0 group-hover:opacity-100" aria-label="Delete">
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </button>
                </div>
              ))}
            </div>
            {deletingId && (
              <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm">
                Delete forever?
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => void deleteConversation(deletingId)} className="rounded-lg bg-red-500 px-3 py-1 text-white">Yes</button>
                  <button type="button" onClick={() => setDeletingId(null)} className="rounded-lg border border-white/20 px-3 py-1">No</button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col px-3 pb-36 pt-6">
        {messages.length === 0 && !busy ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="animate-float">
              <ZerosOrb size={140} />
            </div>
            <h1 className="text-gradient mt-8 text-4xl font-black tracking-tight">Meet Keris</h1>
            <p className="mt-4 max-w-md text-balance text-sm text-muted-foreground">
              Live web search, image generation, real 3D models, original songs and a code canvas — with memory that follows your account.
            </p>
            <div className="mt-8 grid w-full max-w-lg gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  type="button"
                  onClick={() => {
                    setMode(s.mode);
                    void send(s.text, s.mode);
                  }}
                  className="glass flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm transition hover:bg-white/10"
                >
                  <s.Icon className="h-4 w-4 shrink-0 text-cyan-300" />
                  <span>{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[92%] rounded-3xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-cyan-500/90 text-white shadow-lg shadow-cyan-500/20"
                      : "glass border border-white/10"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content || "…"}</ReactMarkdown>
                  ) : (
                    m.content
                  )}
                  {m.attachment?.kind === "image" && m.attachment.src && (
                    <img src={m.attachment.src} alt="" className="mt-3 max-h-80 rounded-2xl" />
                  )}
                  {m.attachment?.kind === "model" && m.attachment.spec && (
                    <div className="mt-3 h-72 overflow-hidden rounded-2xl border border-white/10">
                      <ModelViewer spec={m.attachment.spec} />
                    </div>
                  )}
                  {m.attachment?.kind === "web" && m.attachment.project && (
                    <div className="mt-3 overflow-hidden rounded-2xl border border-white/10">
                      <WebPreview project={m.attachment.project} />
                    </div>
                  )}
                  {m.attachment?.kind === "song" && (
                    <div className="mt-3">
                      <SongBlock spec={m.attachment.spec} url={songUrls[m.id]} />
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="glass max-w-[92%] rounded-3xl border border-white/10 px-4 py-3">
                  <ThinkingTrace mode={thinkingMode} status={status} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            ⚠ {error}
          </div>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-4 pt-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="glass mx-auto max-w-3xl rounded-[1.75rem] border border-white/10 px-4 py-3 shadow-2xl"
        >
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
            placeholder={session && !accountDataReady ? "Loading your saved Keris…" : "Message Keris…"}
            className="max-h-40 w-full resize-none bg-transparent px-1 py-1 text-base outline-none placeholder:text-muted-foreground"
          />
          <div className="mt-3 flex items-center gap-3">
            <div className="flex flex-1 gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {MODES.map((m) => {
                const active = mode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? "bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/40"
                        : "bg-white/5 text-muted-foreground hover:bg-white/10"
                    }`}
                  >
                    <m.Icon className="h-3.5 w-3.5" />
                    {m.label}
                  </button>
                );
              })}
            </div>
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 text-white disabled:opacity-40"
              aria-label="Send"
            >
              <ArrowUp className="h-5 w-5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
