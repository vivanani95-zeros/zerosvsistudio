import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import {
  ArrowUp, Boxes, Code2, Film, Globe, Image as ImageIcon, LogOut, Menu,
  Music4, Pencil, Plus, Sparkles, Trash2, X,
} from "lucide-react";

import TunnelBackground from "@/components/TunnelBackground";
import ModelViewer from "@/components/ModelViewer";
import WebPreview from "@/components/WebPreview";
import ZerosOrb from "@/components/ZerosOrb";
import ThinkingTrace from "@/components/ThinkingTrace";
import { supabase } from "@/integrations/supabase/client";
import { firebaseAuth, signOutFirebase } from "@/lib/firebase";
import { generateImage, streamChat, type Msg } from "@/lib/ai-client";
import { type ZeroMode } from "@/lib/zeros";
import { runModelSculpt } from "@/lib/run-model-sculpt";
import { renderSong } from "@/lib/song";
import { parseSongSpecFromResponse } from "@/lib/parse-song-response";
import { uploadChatAsset } from "@/lib/chat-assets";
import {
  hydrateAttachment, persistModelAssets, persistSongAssets, persistVideoAssets, persistWebAssets, type ChatAttachment,
} from "@/lib/chat-attachments";
import { extractWebProject } from "@/lib/web-project";
import { SongBlock } from "@/routes/song-block";
import { VideoPreview } from "@/components/VideoPreview";
import { parseVideoSpecFromResponse } from "@/lib/video-spec";
import { renderVideo, renderVideoWithMeta } from "@/lib/render-video";
import {
  formatZerosDataError, loadConversationsList, loadMessagesForConversation,
} from "@/lib/load-conversations";

type Attachment = ChatAttachment;
type ChatMessage = {
  id: string; role: "user" | "assistant"; content: string; mode?: ZeroMode; attachment?: Attachment | null;
};

const MODES: { id: Exclude<ZeroMode, "chat">; label: string; Icon: typeof Globe }[] = [
  { id: "search", label: "Web", Icon: Globe },
  { id: "image", label: "Image", Icon: ImageIcon },
  { id: "model", label: "3D Model", Icon: Boxes },
  { id: "music", label: "Song", Icon: Music4 },
  { id: "web", label: "Code", Icon: Code2 },
  { id: "video", label: "Video", Icon: Film },
];

const SUGGESTIONS: { text: string; Icon: typeof Globe; mode: ZeroMode }[] = [
  { text: "What's new in AI today", Icon: Globe, mode: "search" },
  { text: "Render a 3D glass orb", Icon: ImageIcon, mode: "image" },
  { text: "Build a 3D sports car", Icon: Boxes, mode: "model" },
  { text: "Write me a song", Icon: Music4, mode: "music" },
  { text: "Build a mini web app", Icon: Code2, mode: "web" },
  { text: "Make a 30s product trailer", Icon: Film, mode: "video" },
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
  const [songUrls, setSongUrls] = useState<Record<string, string>>({});
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({});
  const [videoFormats, setVideoFormats] = useState<Record<string, "mp4" | "webm">>({});
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<ChatMessage[]>(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    const guest = sessionStorage.getItem("keris_guest") === "1" || sessionStorage.getItem("zeros_guest") === "1";
    setIsGuest(guest);
    const unsub = onAuthStateChanged(firebaseAuth, (user) => {
      setSession(user);
      if (!user && !guest) navigate({ to: "/" });
      if (!user || guest) { setAccountDataReady(true); setReady(true); }
    });
    return unsub;
  }, [navigate]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      try {
        const convs = await loadConversationsList(session);
        if (cancelled) return;
        setConversations(convs.map((c) => ({ id: c.id, title: c.title ?? "Chat" })));
        const first = convs[0];
        if (first) {
          try { await loadConversation(first.id); }
          catch { setConversationId(first.id); setMessages([]); }
        }
      } catch (e) {
        if (!cancelled) setError(`Could not load saved chats (${formatZerosDataError(e, "unknown")}).`);
      } finally {
        if (!cancelled) { setAccountDataReady(true); setReady(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [session]);

  const loadConversation = async (convId: string) => {
    const rows = await loadMessagesForConversation(session, convId);
    const restoredSongs: Record<string, string> = {};
    const restoredVideos: Record<string, string> = {};
    const hydrated = await Promise.all(rows.map(async (r) => {
      const raw = (r.attachment as Attachment | null) ?? null;
      const { attachment, songUrl, videoUrl } = await hydrateAttachment(raw, r.id);
      if (songUrl) restoredSongs[r.id] = songUrl;
      if (videoUrl) restoredVideos[r.id] = videoUrl;
      return { id: r.id, role: r.role as "user" | "assistant", content: r.content, mode: (r.mode as ZeroMode) ?? undefined, attachment };
    }));
    setMessages(hydrated);
    setSongUrls((p) => ({ ...p, ...restoredSongs }));
    setVideoUrls((p) => ({ ...p, ...restoredVideos }));
    setConversationId(convId);
  };

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy, status]);

  const persist = useCallback(async (m: ChatMessage, forcedId?: string) => {
    if (!session) return;
    try { await session.getIdToken(true); } catch {
      try { await session.getIdToken(false); } catch (e) {
        console.warn("[Zeros] token refresh failed before persist:", e);
      }
    }
    let cid = forcedId ?? conversationId;
    if (!cid) {
      const title = (m.role === "user" ? m.content : "New chat").replace(/\s+/g, " ").trim().slice(0, 60) || "New chat";
      let created: { id: string; title: string | null } | null = null;
      let createErr: unknown = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (attempt > 0) await session.getIdToken(true);
          const res = await supabase.from("conversations").insert({ user_id: session.uid, title }).select("id, title").single();
          if (res.error) createErr = res.error;
          else { created = res.data; createErr = null; break; }
        } catch (e) { createErr = e; }
        if (attempt === 0) await new Promise((r) => setTimeout(r, 350));
      }
      if (createErr || !created) {
        console.warn("[Zeros] conversation create failed:", createErr);
        setError(`Chat could not be saved (${String((createErr as { message?: string })?.message || createErr || "auth")}). Messages still work in this tab.`);
        return undefined;
      }
      cid = created.id;
      setConversationId(created.id);
      setConversations((prev) => [{ id: created!.id, title: created!.title ?? title }, ...prev]);
    }
    const attachment = m.attachment && m.attachment.kind === "image" && m.attachment.src.length > 900000 ? null : (m.attachment ?? null);
    let msgErr: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt > 0) await session.getIdToken(true);
        const res = await supabase.from("messages").insert({
          conversation_id: cid, user_id: session.uid, role: m.role, content: m.content, mode: m.mode ?? null, attachment: attachment as never,
        });
        if (res.error) msgErr = res.error;
        else { msgErr = null; break; }
      } catch (e) { msgErr = e; }
      if (attempt === 0) await new Promise((r) => setTimeout(r, 350));
    }
    if (msgErr) console.warn("[Zeros] message persist failed:", msgErr);
    try { await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", cid).eq("user_id", session.uid); } catch {}
    return cid;
  }, [session, conversationId]);

  const send = async (override?: string, forcedMode?: ZeroMode) => {
    const requestMode = forcedMode ?? mode;
    const prompt = (override ?? input).trim();
    if (!prompt || busy || (session && !accountDataReady)) return;
    setInput(""); setError(null); setBusy(true); setThinkingMode(requestMode);
    setStatus(requestMode === "model" ? "Sculpting…" : "Thinking…");
    const userMsg: ChatMessage = { id: uid(), role: "user", content: prompt, mode: requestMode };
    const assistantId = uid();
    try {
      const activeConversationId = await persist(userMsg);
      setMessages((prev) => [...prev, userMsg]);

      if (requestMode === "image") {
        const src = await generateImage(prompt);
        let storagePath: string | undefined;
        if (session && activeConversationId) {
          const blob = await fetch(src).then((r) => r.blob());
          const asset = await uploadChatAsset(session.uid, activeConversationId, blob, "generated-image.png");
          storagePath = asset.storagePath;
        }
        const msg: ChatMessage = { id: assistantId, role: "assistant", content: `Behold: **${prompt}** — freshly rendered. 🎨`, mode: requestMode, attachment: { kind: "image", src, ...(storagePath ? { storagePath } : {}) } };
        setMessages((prev) => [...prev, msg]);
        await persist(msg);
        return;
      }

      if (requestMode === "model") {
        const spec = await runModelSculpt(prompt, streamChat, setStatus);
        let storagePath: string | undefined;
        let glbPath: string | undefined;
        if (session && activeConversationId) {
          const paths = await persistModelAssets(session.uid, activeConversationId, spec);
          storagePath = paths.storagePath;
          glbPath = paths.glbPath;
        }
        const msg: ChatMessage = {
          id: assistantId, role: "assistant",
          content: `Built **${prompt}** — studio hierarchy, clean topology .glb. 🧬`,
          mode: requestMode,
          attachment: { kind: "model", source: "Zeros Local Studio", prompt, spec, ...(storagePath ? { storagePath } : {}), ...(glbPath ? { glbPath } : {}) },
        };
        setMessages((prev) => [...prev, msg]);
        await persist(msg);
        return;
      }

      const history: Msg[] = [...messagesRef.current.filter((m) => m.id !== assistantId), userMsg]
        .filter((m) => (m.content || "").trim().length > 0)
        .slice(-20)
        .map((m) => ({
          role: m.role,
          content: m.content.length > 12000 ? m.content.slice(0, 12000) + "\n…[truncated]" : m.content,
        }));
      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "", mode: requestMode }]);
      let full = await streamChat(history, requestMode, [], (text) => {
        if (requestMode !== "web" && requestMode !== "music" && requestMode !== "video") {
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: text } : m)));
        }
      });
      let attachment: Attachment | null = null;
      let content = full;
      if (requestMode === "web") {
        const mergeProjects = (a: ReturnType<typeof extractWebProject>, b: ReturnType<typeof extractWebProject>) => {
          if (!a && !b) return null; if (!a) return b; if (!b) return a;
          const files = { ...a.files };
          for (const [path, body] of Object.entries(b.files)) {
            if (!files[path] || body.length > files[path].length) files[path] = body;
          }
          return { files };
        };
        const fileCount = (p: ReturnType<typeof extractWebProject>) => (p ? Object.keys(p.files).length : 0);
        const htmlCount = (p: ReturnType<typeof extractWebProject>) => p ? Object.keys(p.files).filter((f) => /\.html$/i.test(f)).length : 0;
        let project = extractWebProject(full);
        for (let pass = 0; pass < 3 && (fileCount(project) < 10 || htmlCount(project) < 4); pass++) {
          setStatus(pass === 0 ? "Building full multi-page site…" : `Adding more pages (${fileCount(project)} files so far)…`);
          try {
            const have = project ? Object.keys(project.files).join(", ") : "none";
            const retry = await streamChat(
              [...history, { role: "assistant", content: (full || "").slice(0, 4000) }, {
                role: "user",
                content: "STUDIO DELIVERY REQUIRED. Output ONE witty line, then 10–15 COMPLETE fenced files using ```file:path. Must include: index.html, about.html, features.html, pricing.html, contact.html, css/styles.css, js/main.js, README.md. Already have: " + have + ". Finish every file fully. Relative .html nav only.",
              }],
              "web", [], () => {},
            );
            full = ((full || "") + "\n" + retry).slice(-140000);
            project = mergeProjects(project, extractWebProject(retry));
          } catch { break; }
        }
        if (!project || htmlCount(project) < 1) {
          const { buildFallbackWebProject } = await import("@/lib/web-project");
          project = buildFallbackWebProject(prompt);
        }
        let webStoragePath: string | undefined;
        if (session && activeConversationId) {
          try { webStoragePath = (await persistWebAssets(session.uid, activeConversationId, project)).storagePath; } catch {}
        }
        attachment = { kind: "web", project, ...(webStoragePath ? { storagePath: webStoragePath } : {}) };
        const witty = (full.replace(/```[\s\S]*?```/g, "").trim().split("\n").map((l) => l.trim()).filter(Boolean)[0] ?? "").slice(0, 180);
        content = (witty || "Studio site ready. ⚡") + `\n\n**${Object.keys(project.files).length} files** · **${htmlCount(project)} pages** generated.`;
      } else if (requestMode === "music") {
        let songSpec = parseSongSpecFromResponse(full, prompt);
        if (!full.includes("{") || full.trim().length < 80) {
          setStatus("Finishing song arrangement…");
          try {
            full = await streamChat([...history, { role: "assistant", content: full }, { role: "user", content: "Reply with ONE short witty line, then ONE complete JSON song object only." }], "music", [], () => {});
            songSpec = parseSongSpecFromResponse(full, prompt);
          } catch {}
        }
        attachment = { kind: "song", spec: songSpec };
        const witty = (full.split("{")[0] ?? "").replace(/```[\s\S]*?```/g, "").trim().split("\n").map((l) => l.trim()).filter(Boolean)[0] ?? "";
        content = witty && witty.length < 180 ? witty : `Track ready. 🎵`;
        setStatus("Rendering audio…");
        try {
          const blob = await renderSong(songSpec);
          setSongUrls((p) => ({ ...p, [assistantId]: URL.createObjectURL(blob) }));
          if (session && activeConversationId) {
            const paths = await persistSongAssets(session.uid, activeConversationId, blob, songSpec.title || "zeros-song");
            if (paths.storagePath) attachment = { kind: "song", spec: songSpec, storagePath: paths.storagePath };
          }
        } catch { content = content || "Track arranged. 🎵"; }
      } else if (requestMode === "video") {
        let videoSpec = parseVideoSpecFromResponse(full, prompt);
        if (!full.includes("{") || full.trim().length < 80) {
          setStatus("Finishing visual script…");
          try {
            full = await streamChat(
              [...history, { role: "assistant", content: full }, {
                role: "user",
                content: "Reply with ONE short witty line, then ONE complete JSON VideoSpec only (title, durationSec:30, fps, width, height, script, 6 scenes hook-problem-reveal-feature-proof-end, layers orb/glass/pill/text/logo/graph, audio). No markdown fences.",
              }],
              "video", [], () => {},
            );
            videoSpec = parseVideoSpecFromResponse(full, prompt);
          } catch {}
        }
        attachment = { kind: "video", spec: videoSpec };
        const witty = (full.split("{")[0] ?? "").replace(/```[\s\S]*?```/g, "").trim().split("\n").map((l) => l.trim()).filter(Boolean)[0] ?? "";
        content = witty && witty.length < 180 ? witty : `Video ready. 🎬`;
        setStatus("Rendering frames… 0%");
        try {
          const { blob, ext } = await renderVideoWithMeta(videoSpec, (ratio) => {
            setStatus(`Rendering frames… ${Math.round(ratio * 100)}%`);
          });
          setVideoUrls((p) => ({ ...p, [assistantId]: URL.createObjectURL(blob) }));
          setVideoFormats((p) => ({ ...p, [assistantId]: ext }));
          if (session && activeConversationId) {
            const paths = await persistVideoAssets(session.uid, activeConversationId, blob, videoSpec);
            if (paths.storagePath) attachment = { kind: "video", spec: videoSpec, storagePath: paths.storagePath };
          }
        } catch (renderErr) {
          console.warn("[Zeros] video render failed:", renderErr);
          content = content || "Visual script ready — render hit a snag. Try again. 🎬";
        }
      }
      const finalMsg: ChatMessage = { id: assistantId, role: "assistant", content, mode: requestMode, attachment };
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? finalMsg : m)));
      await persist(finalMsg, activeConversationId);
    } catch (e) {
      let msg = formatZerosDataError(e, "Unknown error.");
      if (/empty generation|incomplete/i.test(msg)) msg = "Generation hit a snag. Please try again.";
      setError(`Message failed: ${msg}`);
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setBusy(false); setStatus(null);
    }
  };

  const beginMaiHold = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    setMaiUnlocking(true);
    maiTimer.current = window.setTimeout(() => {
      setMaiUnlocking(false);
      navigate({ to: "/mai" });
    }, 5000);
  };
  const endMaiHold = () => {
    setMaiUnlocking(false);
    if (maiTimer.current) { window.clearTimeout(maiTimer.current); maiTimer.current = null; }
  };

  const signOut = async () => {
    sessionStorage.removeItem("keris_guest"); sessionStorage.removeItem("zeros_guest");
    await signOutFirebase();
    navigate({ to: "/" });
  };

  const renameConversation = async (convId: string) => {
    const clean = renameValue.trim().slice(0, 60);
    if (!clean) { setRenamingId(null); return; }
    if (session) await supabase.from("conversations").update({ title: clean }).eq("id", convId).eq("user_id", session.uid);
    setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, title: clean } : c)));
    setRenamingId(null);
  };

  const deleteConversation = async (convId: string) => {
    if (session) {
      await supabase.from("conversations").delete().eq("id", convId).eq("user_id", session.uid);
    }
    setConversations((prev) => prev.filter((c) => c.id !== convId));
    if (conversationId === convId) { setConversationId(null); setMessages([]); }
  };

  if (!ready) {
    return (
      <div className="relative z-10 flex min-h-dvh items-center justify-center bg-black text-white">
        <TunnelBackground /><ZerosOrb className="relative z-10 h-16 w-16 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="relative z-10 flex min-h-dvh flex-col bg-transparent text-white">
      <TunnelBackground />
      <header className="sticky top-0 z-40 px-3 pt-3 text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between rounded-full border border-white/10 bg-black/55 px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={() => setSidebar(true)} className="grid h-9 w-9 place-items-center rounded-full text-white/90" aria-label="Open sidebar">
              <Menu className="h-5 w-5" />
            </button>
            <p className="text-[17px] font-semibold tracking-tight text-white">Zeros</p>
          </div>
          <div className="flex items-center gap-2">
            {isGuest ? (
              <span className="flex items-center gap-1.5 rounded-full border border-white/12 bg-black/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/85">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" /> Guest
              </span>
            ) : (
              <>
                <span className="max-w-[9rem] truncate text-[11px] text-white/55">{session?.email ?? "Signed in"}</span>
                <button type="button" onClick={() => void signOut()} className="grid h-8 w-8 place-items-center rounded-full border border-white/15 text-white/80" aria-label="Sign out">
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            <button type="button" onPointerDown={beginMaiHold} onPointerUp={endMaiHold} onPointerLeave={endMaiHold} className="rounded-full border border-white/12 px-2.5 py-1 text-[10px] font-medium text-white/55">
              {maiUnlocking ? "…" : "Mai"}
            </button>
          </div>
        </div>
      </header>

      {sidebar && (
        <div className="fixed inset-0 z-50 flex">
          <button type="button" className="absolute inset-0 bg-black/60" onClick={() => setSidebar(false)} aria-label="Close sidebar" />
          <aside className="relative z-10 flex h-full w-[min(20rem,88vw)] flex-col border-r border-white/10 bg-zinc-950 p-3 text-white">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Chats</p>
              <button type="button" onClick={() => setSidebar(false)} className="grid h-8 w-8 place-items-center rounded-lg border border-white/20 text-white" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <button type="button" onClick={() => { setConversationId(null); setMessages([]); setSidebar(false); }} className="mb-3 flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white">
              <Plus className="h-4 w-4" /> New chat
            </button>
            <div className="flex-1 space-y-1 overflow-y-auto">
              {conversations.map((c) => (
                <div key={c.id} className={`group flex items-center gap-1 rounded-xl px-2 py-1.5 ${conversationId === c.id ? "bg-cyan-400/20" : "hover:bg-white/10"}`}>
                  {renamingId === c.id ? (
                    <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void renameConversation(c.id); if (e.key === "Escape") setRenamingId(null); }} className="min-w-0 flex-1 rounded-lg bg-black/40 px-2 py-1 text-sm text-white outline-none" autoFocus />
                  ) : (
                    <button type="button" onClick={() => { void loadConversation(c.id); setSidebar(false); }} className="min-w-0 flex-1 truncate text-left text-sm text-white">{c.title}</button>
                  )}
                  <button type="button" onClick={() => { setRenamingId(c.id); setRenameValue(c.title); }} className="text-white/70 opacity-0 group-hover:opacity-100" aria-label="Rename"><Pencil className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => void deleteConversation(c.id)} className="text-white/70 opacity-0 group-hover:opacity-100" aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col px-3 pb-36 pt-6 text-white">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <ZerosOrb className="h-20 w-20" />
            <h1 className="mt-6 bg-gradient-to-r from-cyan-300 via-sky-300 to-fuchsia-400 bg-clip-text text-3xl font-bold tracking-tight text-transparent">Meet Zeros</h1>
            <p className="mt-4 max-w-md text-balance text-sm leading-relaxed text-white/45">Live web search, image generation, real 3D models, original songs and a code canvas — with memory that follows your account.</p>
            <div className="mt-8 flex w-full max-w-md flex-col gap-2.5 px-1">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  type="button"
                  onClick={() => void send(s.text, s.mode)}
                  className="flex w-full items-center gap-3 rounded-full border border-white/10 bg-[rgba(12,16,28,0.82)] px-5 py-[0.95rem] text-left text-[15px] font-medium text-white/95 shadow-[0_4px_24px_rgba(0,0,0,0.35)] backdrop-blur-xl transition hover:border-cyan-400/30 hover:bg-[rgba(18,24,40,0.9)]"
                >
                  <s.Icon className="h-4 w-4 shrink-0 text-cyan-300" strokeWidth={2} />
                  <span>{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed text-white ${m.role === "user" ? "bg-cyan-400/90 text-black" : "border border-white/20 bg-white/10 backdrop-blur-md"}`}>
                  {m.role === "assistant" ? (
                    <div className="prose prose-invert prose-sm max-w-none text-white">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content || (busy ? "" : "…")}</ReactMarkdown>
                    </div>
                  ) : (m.content)}
                  {m.attachment?.kind === "image" && m.attachment.src && (
                    <img src={m.attachment.src} alt="" className="mt-3 max-h-80 rounded-xl" />
                  )}
                  {m.attachment?.kind === "model" && m.attachment.spec && (
                    <div className="mt-3 overflow-hidden rounded-2xl border border-white/20"><ModelViewer spec={m.attachment.spec} /></div>
                  )}
                  {m.attachment?.kind === "web" && m.attachment.project && (
                    <WebPreview project={m.attachment.project} />
                  )}
                  {m.attachment?.kind === "song" && m.attachment.spec && (
                    <SongBlock spec={m.attachment.spec} url={songUrls[m.id]} />
                  )}
                  {m.attachment?.kind === "video" && m.attachment.spec && (
                    <VideoPreview spec={m.attachment.spec} url={videoUrls[m.id]} format={videoFormats[m.id] || "webm"} />
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="relative z-20 rounded-2xl border border-cyan-400/40 bg-black/70 px-4 py-3 shadow-[0_0_24px_rgba(34,211,238,0.25)] backdrop-blur-md">
                <ThinkingTrace active status={status || "Thinking…"} mode={thinkingMode} />
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
        {error && <div className="mt-3 rounded-2xl border border-red-400/40 bg-red-500/15 px-4 py-3 text-sm text-red-200">⚠ {error}</div>}
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-4 pt-2">
        <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="mx-auto flex max-w-3xl flex-col gap-2 rounded-[1.75rem] border border-white/20 bg-black/70 p-3.5 text-white shadow-[0_8px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Message Zeros…" rows={1} className="max-h-32 min-h-[44px] w-full resize-none bg-transparent px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/45" />
          <div className="flex items-center gap-2 px-1">
            <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {MODES.map((m) => (
                <button key={m.id} type="button" onClick={() => setMode(m.id)} className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium transition ${mode === m.id ? "border border-white/20 bg-white/12 text-white" : "border border-white/12 bg-transparent text-white/70 hover:bg-white/8 hover:text-white"}`}>
                  <m.Icon className="h-3.5 w-3.5" strokeWidth={2} />{m.label}
                </button>
              ))}
            </div>
            <button type="submit" disabled={busy || !input.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-fuchsia-500 text-black shadow-[0_0_20px_rgba(34,211,238,0.4)] transition disabled:opacity-40" aria-label="Send">
              <ArrowUp className="h-5 w-5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
