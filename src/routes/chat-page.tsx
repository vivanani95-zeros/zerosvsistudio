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
import { type ParticleSculptSpec } from "@/lib/particle-model";
import { buildModelSculptUserMessage, parseAndRefineSculpt } from "@/lib/model-prompt";
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
    let cancelled = false;

    (async () => {
      try {
        const convs = await loadConversationsList(session);
        if (cancelled) return;
        setConversations(convs.map((c) => ({ id: c.id, title: c.title ?? "Chat" })));
        setError(null);

        const firstConversation = convs[0];
        if (firstConversation) {
          try {
            await loadConversation(firstConversation.id);
          } catch (msgErr) {
            console.error("[Zeros] first conversation messages failed:", msgErr);
            setConversationId(firstConversation.id);
            setMessages([]);
            setError(
              `Loaded chats, but messages for the latest one failed (${formatZerosDataError(msgErr, "unknown")}). Open another chat or refresh.`,
            );
          }
        } else {
          try {
            await session.getIdToken(false);
          } catch {
            await session.getIdToken(true);
          }
          const { data: created, error: createConversationError } = await supabase
            .from("conversations")
            .insert({ user_id: uidv, title: "New chat" })
            .select("id, title")
            .single();
          if (createConversationError) throw createConversationError;
          if (created && !cancelled) {
            setConversations([{ id: created.id, title: created.title ?? "New chat" }]);
            setConversationId(created.id);
          }
        }
      } catch (e) {
        console.error("[Zeros] conversation data load failed:", e);
        if (!cancelled) {
          setError(
            `Could not load saved chats (${formatZerosDataError(e, "unknown error")}). You can still chat — new messages will try to save.`,
          );
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
          console.error("[Zeros] create conversation failed:", createError);
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
      if (messageError) {
        console.error("[Zeros] message persist failed:", messageError);
        return activeConversationId;
      }
      try {
        await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", activeConversationId)
          .eq("user_id", session.uid);
      } catch (e) {
        console.warn("[Zeros] conversation touch failed:", e);
      }
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
            ? "Sculpting a premium local 3D model…"
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
              ? "Understanding the object and planning production-grade part hierarchy…"
              : attempt === 1
                ? "Rebuilding with stricter silhouette and real secondary forms…"
                : "Final pass — locking proportions, ground contact, and materials…",
          );
          try {
            const plan = await streamChat(
              [
                {
                  role: "user",
                  content: buildModelSculptUserMessage(prompt, attempt),
                },
              ],
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
          content: `Built **${prompt}** with Zeros' premium local engine — real part hierarchy, grounded proportions, PBR materials, clean topology .glb. No external 3D API. 🧬`,
          mode: requestMode,
          attachment: {
            kind: "model",
            source: "Zeros Local Premium Sculpt Engine",
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
          Loading Zeros…
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
        <div className="pointer-events-none fixed inset-0 z-[60] grid place-items-center bg-black/35 backdrop-blur-sm">
          <div className="rounded-[2rem] border border-fuchsia-200/25 bg-black/60 px-8 py-7 text-center shadow-[0_0_140px_rgba(232,121,249,.28)] backdrop-blur-2xl">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-fuchsia-200/30 bg-fuchsia-400/10">
              <Sparkles className="h-7 w-7 text-fuchsia-200 animate-pulse" />
            </div>
            <div className="mt-5 text-xs font-bold tracking-[0.35em] text-fuchsia-200/70 uppercase">Mai</div>
            <div className="mt-2 text-2xl font-black">Unlocking…</div>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-30 px-3 pt-3">
        <div className="glass mx-auto flex max-w-3xl items-center justify-between rounded-3xl px-4 py-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setSidebar(true)} className="text-foreground/90 transition hover:text-primary">
              <Menu className="h-6 w-6" />
            </button>
            <span className="text-lg font-black tracking-tight">Zeros</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {isGuest ? "Guest" : session?.email ?? "Online"}
          </div>
          <button type="button" onClick={signOut} className="text-muted-foreground transition hover:text-foreground">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {sidebar && (
        <div className="fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebar(false)} />
          <aside className="glass relative flex h-full w-[86%] max-w-sm flex-col rounded-r-3xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-bold">Chats</span>
              <button type="button" onClick={() => setSidebar(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <button
              type="button"
              className="mb-3 flex items-center gap-2 rounded-2xl border border-border px-3 py-2.5 text-sm"
              onClick={() => {
                setConversationId(null);
                setMessages([]);
                setSidebar(false);
              }}
            >
              <Plus className="h-4 w-4" /> New chat
            </button>
            <div className="flex-1 space-y-1 overflow-y-auto">
              {conversations.map((c) => (
                <div key={c.id} className="group flex items-center gap-1 rounded-xl px-2 py-1.5 hover:bg-white/5">
                  {renamingId === c.id ? (
                    <input
                      className="flex-1 rounded-lg border border-border bg-transparent px-2 py-1 text-sm"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void renameConversation(c.id, renameValue);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      autoFocus
                    />
                  ) : (
                    <button
                      type="button"
                      className="flex-1 truncate text-left text-sm"
                      onClick={() => {
                        void loadConversation(c.id);
                        setSidebar(false);
                      }}
                    >
                      {c.title}
                    </button>
                  )}
                  <button
                    type="button"
                    className="opacity-50 hover:opacity-100"
                    onClick={() => {
                      setRenamingId(c.id);
                      setRenameValue(c.title);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" className="opacity-50 hover:opacity-100" onClick={() => setDeletingId(c.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {deletingId && (
              <div className="mt-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-xs">
                Delete this chat forever?
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="rounded-lg bg-destructive px-3 py-1.5 text-destructive-foreground"
                    onClick={() => void deleteConversation(deletingId)}
                  >
                    Delete
                  </button>
                  <button type="button" className="rounded-lg border border-border px-3 py-1.5" onClick={() => setDeletingId(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-4 pt-6">
        {error && (
          <div className="mb-3 rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            ⚠ {error}
          </div>
        )}

        <div className="flex-1 space-y-4 overflow-y-auto">
          {messages.length === 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  type="button"
                  className="glass rounded-2xl px-3 py-3 text-left text-sm transition hover:bg-white/5"
                  onClick={() => void send(s.text, s.mode)}
                >
                  <s.Icon className="mb-1 h-4 w-4" />
                  {s.text}
                </button>
              ))}
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-3xl border border-border/60 p-4 ${m.role === "user" ? "bg-primary/10" : "glass"}`}
            >
              {m.role === "assistant" ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
              ) : (
                <p className="whitespace-pre-wrap text-sm">{m.content}</p>
              )}
              {m.attachment?.kind === "image" && m.attachment.src && (
                <img src={m.attachment.src} alt="generated" className="mt-3 max-h-96 rounded-2xl" />
              )}
              {m.attachment?.kind === "model" && m.attachment.spec && (
                <ModelViewer
                  name={m.attachment.prompt || "model"}
                  source={m.attachment.source}
                  prompt={m.attachment.prompt}
                  spec={m.attachment.spec}
                />
              )}
              {m.attachment?.kind === "song" && (
                <SongBlock messageId={m.id} spec={m.attachment.spec} url={songUrls[m.id]} />
              )}
              {m.attachment?.kind === "web" && m.attachment.project && <WebPreview project={m.attachment.project} />}
            </div>
          ))}
          {busy && <ThinkingTrace mode={thinkingMode} status={status} active />}
          <div ref={bottomRef} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition ${
                mode === m.id ? "border-primary bg-primary/15" : "border-border"
              }`}
            >
              <m.Icon className="h-3.5 w-3.5" />
              {m.label}
            </button>
          ))}
        </div>

        <form
          className="glass mt-2 flex items-end gap-2 rounded-3xl p-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message Zeros…"
            rows={2}
            className="max-h-40 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-2xl bg-primary p-2 text-primary-foreground disabled:opacity-40"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
