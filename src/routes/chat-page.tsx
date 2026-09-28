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
import { renderVideoWithMeta } from "@/lib/render-video";
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
  const [conversations, setConversations] = useState<{ id: string; title: string }[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
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
          try {
            const rows = await loadMessagesForConversation(session, first.id);
            const restoredSongs: Record<string, string> = {};
            const restoredVideos: Record<string, string> = {};
            const hydrated = await Promise.all(rows.map(async (r) => {
              const raw = (r.attachment as Attachment | null) ?? null;
              const { attachment, songUrl, videoUrl } = await hydrateAttachment(raw, r.id);
              if (songUrl) restoredSongs[r.id] = songUrl;
              if (videoUrl) restoredVideos[r.id] = videoUrl;
              return { id: r.id, role: r.role as "user" | "assistant", content: r.content, mode: (r.mode as ZeroMode) ?? undefined, attachment };
            }));
            if (!cancelled) {
              setMessages(hydrated);
              setSongUrls((p) => ({ ...p, ...restoredSongs }));
              setVideoUrls((p) => ({ ...p, ...restoredVideos }));
              setConversationId(first.id);
            }
          } catch {
            if (!cancelled) { setConversationId(first.id); setMessages([]); }
          }
        }
      } catch (e) {
        if (!cancelled) setError(`Could not load saved chats (${formatZerosDataError(e, "unknown")}).`);
      } finally {
        if (!cancelled) { setAccountDataReady(true); setReady(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [session]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy, status]);

  const persist = useCallback(async (m: ChatMessage, forcedId?: string) => {
    if (!session) return;
    try { await session.getIdToken(true); } catch {
      try { await session.getIdToken(false); } catch {}
    }
    let cid = forcedId ?? conversationId;
    if (!cid) {
      const title = (m.role === "user" ? m.content : "New chat").replace(/\s+/g, " ").trim().slice(0, 60) || "New chat";
      const res = await supabase.from("conversations").insert({ user_id: session.uid, title }).select("id, title").single();
      if (res.error || !res.data) {
        setError(`Chat could not be saved. Messages still work in this tab.`);
        return undefined;
      }
      cid = res.data.id;
      setConversationId(res.data.id);
      setConversations((prev) => [{ id: res.data!.id, title: res.data!.title ?? title }, ...prev]);
    }
    await supabase.from("messages").insert({
      conversation_id: cid, user_id: session.uid, role: m.role, content: m.content, mode: m.mode ?? null, attachment: (m.attachment ?? null) as never,
    });
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
        let project = extractWebProject(full);
        if (!project || Object.keys(project.files).filter((f) => /\.html$/i.test(f)).length < 1) {
          const { buildFallbackWebProject } = await import("@/lib/web-project");
          project = buildFallbackWebProject(prompt);
        }
        let webStoragePath: string | undefined;
        if (session && activeConversationId) {
          try { webStoragePath = (await persistWebAssets(session.uid, activeConversationId, project)).storagePath; } catch {}
        }
        attachment = { kind: "web", project, ...(webStoragePath ? { storagePath: webStoragePath } : {}) };
        const witty = (full.replace(/```[\s\S]*?```/g, "").trim().split("\n").map((l) => l.trim()).filter(Boolean)[0] ?? "").slice(0, 180);
        content = (witty || "Studio site ready. ⚡") + `\n\n**${Object.keys(project.files).length} files** generated.`;
      } else if (requestMode === "music") {
        let songSpec = parseSongSpecFromResponse(full, prompt);
        attachment = { kind: "song", spec: songSpec };
        const witty = (full.split("{")[0] ?? "").replace(/```[\s\S]*?```/g, "").trim().split("\n").map((l) => l.trim()).filter(Boolean)[0] ?? "";
        content = witty && witty.length < 180 ? witty : `Track ready. 🎵`;
        setStatus(null);
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
          try {
            full = await streamChat(
              [...history, { role: "assistant", content: full }, {
                role: "user",
                content: "Reply with ONE short witty line, then ONE complete JSON VideoSpec only. No markdown fences.",
              }],
              "video", [], () => {},
            );
            videoSpec = parseVideoSpecFromResponse(full, prompt);
          } catch {}
        }
        attachment = { kind: "video", spec: videoSpec };
        const witty = (full.split("{")[0] ?? "").replace(/```[\s\S]*?```/g, "").trim().split("\n").map((l) => l.trim()).filter(Boolean)[0] ?? "";
        content = witty && witty.length < 180 ? witty : `Video ready. 🎬`;
        // No "Rendering frames %" UI — encode silently, show player immediately
        setStatus(null);
        try {
          const { blob, ext } = await renderVideoWithMeta(videoSpec);
          const url = URL.createObjectURL(blob);
          setVideoUrls((p) => ({ ...p, [assistantId]: url }));
          setVideoFormats((p) => ({ ...p, [assistantId]: ext }));
          const readyMsg: ChatMessage = { id: assistantId, role: "assistant", content, mode: requestMode, attachment };
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? readyMsg : m)));
          setBusy(false);
          if (session && activeConversationId) {
            try {
              const paths = await persistVideoAssets(session.uid, activeConversationId, blob, videoSpec);
              if (paths.storagePath) {
                attachment = { kind: "video", spec: videoSpec, storagePath: paths.storagePath };
                setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...readyMsg, attachment } : m)));
              }
            } catch (upErr) {
              console.warn("[Zeros] video upload failed (local preview still works):", upErr);
            }
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
      setBusy(false);
      setStatus(null);
    }
  };

  if (!ready) {
    return (
      <div className="relative flex min-h-screen items-center justify-center text-white">
        <TunnelBackground />
        <p className="relative z-10 text-white/70">Loading…</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen text-white">
      <TunnelBackground />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col px-3 pb-32 pt-4">
        <div className="mb-3 flex items-center justify-between rounded-full border border-white/10 bg-black/50 px-3 py-2 backdrop-blur-md">
          <button type="button" onClick={() => setSidebar((s) => !s)} className="rounded-full p-2 hover:bg-white/10" aria-label="Menu">
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold tracking-wide">Zeros</span>
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-white/80">{isGuest || !session ? "Guest" : "You"}</span>
        </div>

        {sidebar && (
          <div className="fixed inset-0 z-40 flex">
            <div className="absolute inset-0 bg-black/60" onClick={() => setSidebar(false)} />
            <div className="relative z-10 flex h-full w-72 flex-col border-r border-white/10 bg-[#0a0a12] p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold">Chats</span>
                <button type="button" onClick={() => setSidebar(false)}><X className="h-4 w-4" /></button>
              </div>
              <button type="button" className="mb-2 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm" onClick={() => { setMessages([]); setConversationId(null); setSidebar(false); }}>
                <Plus className="h-4 w-4" /> New chat
              </button>
              <div className="flex-1 overflow-y-auto">
                {conversations.map((c) => (
                  <button key={c.id} type="button" className="mb-1 w-full rounded-lg px-2 py-2 text-left text-sm text-white/80 hover:bg-white/10" onClick={() => { setConversationId(c.id); setSidebar(false); }}>
                    {c.title}
                  </button>
                ))}
              </div>
              {session && (
                <button type="button" className="mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-white/60 hover:bg-white/10" onClick={() => signOutFirebase()}>
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              )}
            </div>
          </div>
        )}

        {!messages.length && (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
            <ZerosOrb />
            <h1 className="bg-gradient-to-r from-violet-200 via-fuchsia-200 to-cyan-200 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">Meet Zeros</h1>
            <div className="flex w-full max-w-md flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s.text} type="button" onClick={() => void send(s.text, s.mode)} className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm text-white/90 hover:bg-white/[0.08]">
                  <s.Icon className="h-4 w-4 shrink-0 text-white/50" />
                  {s.text}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
          {messages.map((m) => (
            <div key={m.id} className={`rounded-2xl px-3 py-2.5 ${m.role === "user" ? "ml-6 bg-violet-600/25" : "mr-2 bg-white/[0.04]"}`}>
              {m.role === "assistant" ? (
                <div className="prose prose-invert max-w-none text-sm"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content || " "}</ReactMarkdown></div>
              ) : (
                <p className="text-sm text-white/95">{m.content}</p>
              )}
              {m.attachment?.kind === "video" && videoUrls[m.id] && (
                <div className="mt-2"><VideoPreview src={videoUrls[m.id]} format={videoFormats[m.id] || "webm"} /></div>
              )}
              {m.attachment?.kind === "song" && songUrls[m.id] && <div className="mt-2"><SongBlock url={songUrls[m.id]} /></div>}
              {m.attachment?.kind === "image" && m.attachment.src && <img src={m.attachment.src} alt="" className="mt-2 max-h-80 max-w-full rounded-xl" />}
              {m.attachment?.kind === "model" && m.attachment.spec && <div className="mt-2"><ModelViewer spec={m.attachment.spec as never} /></div>}
              {m.attachment?.kind === "web" && m.attachment.project && <div className="mt-2"><WebPreview project={m.attachment.project} /></div>}
            </div>
          ))}
          {busy && <ThinkingTrace mode={thinkingMode} status={status} />}
          {error && <p className="text-center text-sm text-red-300">{error}</p>}
          <div ref={bottomRef} />
        </div>

        <form
          className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/10 bg-black/75 p-3 backdrop-blur-lg"
          onSubmit={(e) => { e.preventDefault(); void send(); }}
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            <div className="flex gap-1 overflow-x-auto pb-0.5">
              {MODES.map((m) => (
                <button key={m.id} type="button" onClick={() => setMode(m.id)} className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs ${mode === m.id ? "bg-violet-500 text-white" : "bg-white/10 text-white/75"}`}>
                  <m.Icon className="h-3.5 w-3.5" />{m.label}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={1}
                placeholder="Message Zeros…"
                className="max-h-32 flex-1 resize-none rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/40"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
              />
              <button type="submit" disabled={busy || !input.trim()} className="rounded-full bg-violet-500 p-3 disabled:opacity-40" aria-label="Send">
                <ArrowUp className="h-5 w-5" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
