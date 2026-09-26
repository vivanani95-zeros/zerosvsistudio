import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import {
  ArrowUp, Boxes, Code2, Globe, Image as ImageIcon, LogOut, Menu,
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
import { renderSong, type SongSpec } from "@/lib/song";
import { parseSongSpecFromResponse } from "@/lib/parse-song-response";
import { uploadChatAsset } from "@/lib/chat-assets";
import {
  hydrateAttachment, persistModelAssets, persistSongAssets, persistWebAssets, type ChatAttachment,
} from "@/lib/chat-attachments";
import { extractWebProject } from "@/lib/web-project";
import { SongBlock } from "@/routes/song-block";
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
  const [songUrls, setSongUrls] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement | null>(null);

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
    const restored: Record<string, string> = {};
    const hydrated = await Promise.all(rows.map(async (r) => {
      const raw = (r.attachment as Attachment | null) ?? null;
      const { attachment, songUrl } = await hydrateAttachment(raw, r.id);
      if (songUrl) restored[r.id] = songUrl;
      return { id: r.id, role: r.role as "user" | "assistant", content: r.content, mode: (r.mode as ZeroMode) ?? undefined, attachment };
    }));
    setMessages(hydrated);
    setSongUrls((p) => ({ ...p, ...restored }));
    setConversationId(convId);
  };

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  const persist = useCallback(async (m: ChatMessage, forcedId?: string) => {
    if (!session) return;
    let cid = forcedId ?? conversationId;
    if (!cid) {
      const { data: created } = await supabase.from("conversations").insert({ user_id: session.uid, title: "New chat" }).select("id, title").single();
      if (!created) { cid = crypto.randomUUID(); setConversationId(cid); return cid; }
      cid = created.id;
      setConversationId(created.id);
      setConversations((prev) => [{ id: created.id, title: created.title ?? "New chat" }, ...prev]);
    }
    const attachment = m.attachment && m.attachment.kind === "image" && m.attachment.src.length > 900000 ? null : (m.attachment ?? null);
    await supabase.from("messages").insert({ conversation_id: cid, user_id: session.uid, role: m.role, content: m.content, mode: m.mode ?? null, attachment: attachment as never });
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
        let project = extractWebProject(full);
        const fileCount = project ? Object.keys(project.files).length : 0;
        const htmlCount = project ? Object.keys(project.files).filter((f) => /\.html$/i.test(f)).length : 0;
        if (!project || htmlCount < 4 || fileCount < 8) {
          setStatus("Finishing website files…");
          try {
            const retry = await streamChat(
              [
                ...history,
                { role: "assistant", content: full },
                {
                  role: "user",
                  content:
                    "INCOMPLETE. Output the FULL premium multi-page site NOW: one short witty Keris line, then 10–15 COMPLETE fenced files using ```file:path — must include index.html, about.html, features.html, pricing.html, contact.html, css/styles.css, js/main.js, README.md. Every nav link must be relative .html that you actually output. Finish every file. No placeholders.",
                },
              ],
              "web",
              [],
              () => {},
            );
            full = retry;
            project = extractWebProject(retry);
          } catch {
            /* keep first parse */
          }
        }
        if (!project || Object.keys(project.files).filter((f) => /\.html$/i.test(f)).length < 4 || Object.keys(project.files).length < 8) {
          setStatus("Expanding to full multi-page site…");
          try {
            const retry2 = await streamChat(
              [
                ...history,
                { role: "assistant", content: full },
                {
                  role: "user",
                  content:
                    "STILL INCOMPLETE. Output 10–15 COMPLETE files NOW with ```file:path fences: index.html, about.html, features.html, pricing.html, contact.html, css/styles.css, js/main.js, README.md + more. Relative .html nav only. Full CSS motion + premium design. Finish every file completely. One witty line first then only fences.",
                },
              ],
              "web",
              [],
              () => {},
            );
            full = retry2;
            const p2 = extractWebProject(retry2);
            if (p2 && Object.keys(p2.files).length >= (project ? Object.keys(project.files).length : 0)) {
              project = p2;
            }
          } catch { /* keep */ }
        }
        if (!project || !Object.keys(project.files).some((f) => /\.html$/i.test(f))) {
          throw new Error("Website response incomplete. Please retry with a clearer site brief.");
        }
        let webStoragePath: string | undefined;
        if (session && activeConversationId) {
          const paths = await persistWebAssets(session.uid, activeConversationId, project);
          webStoragePath = paths.storagePath;
        }
        attachment = { kind: "web", project, ...(webStoragePath ? { storagePath: webStoragePath } : {}) };
        {
          const witty = (full.replace(/```[\s\S]*?```/g, "").trim().split("\n").map((l) => l.trim()).filter(Boolean)[0] ?? "").slice(0, 180);
          content = (witty || "Full project built. ⚡") + `\n\n**${Object.keys(project.files).length} files** generated.`;
        }
      } else if (requestMode === "music") {
        let songSpec = parseSongSpecFromResponse(full, prompt);
        const thin = !full.includes("{") || full.trim().length < 80;
        if (thin) {
          setStatus("Finishing song arrangement…");
          try {
            const retry = await streamChat(
              [
                ...history,
                { role: "assistant", content: full },
                {
                  role: "user",
                  content:
                    "Your previous song response was incomplete. Reply with ONE short witty line, then ONE complete JSON song object only (title, bpm, durationSec, style, voice, vocalStyle, lyrics, chords, melody, drums, arrangement). No markdown fences required.",
                },
              ],
              "music",
              [],
              () => {},
            );
            full = retry;
            songSpec = parseSongSpecFromResponse(retry, prompt);
          } catch {
            /* keep fallback spec */
          }
        }
        attachment = { kind: "song", spec: songSpec };
        {
          const beforeJson = full.split("{")[0]?.replace(/```[\s\S]*?```/g, "").trim() ?? "";
          const witty = beforeJson.split("\n").map((l) => l.trim()).filter(Boolean)[0] ?? "";
          content = witty && witty.length < 180 ? witty : `Track ready. 🎵`;
        }
        setStatus("Rendering audio…");
        try {
          const blob = await renderSong(songSpec);
          setSongUrls((p) => ({ ...p, [assistantId]: URL.createObjectURL(blob) }));
          if (session && activeConversationId) {
            const paths = await persistSongAssets(
              session.uid,
              activeConversationId,
              blob,
              songSpec.title || "zeros-song",
            );
            if (paths.storagePath) attachment = { kind: "song", spec: songSpec, storagePath: paths.storagePath };
          }
        } catch (renderErr) {
          console.warn("[Zeros] song render failed, keeping spec without audio preview:", renderErr);
          content = content || "Track arranged. 🎵";
        }
      }
      const finalMsg: ChatMessage = { id: assistantId, role: "assistant", content, mode: requestMode, attachment };
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? finalMsg : m)));
      await persist(finalMsg, activeConversationId);
    } catch (e) {
      {
        let msg = formatZerosDataError(e, "Unknown error.");
        if (/song response incomplete/i.test(msg)) {
          msg = "Song generation hit a snag. Please try again — a fallback arrangement will be used.";
        }
        if (/website response incomplete/i.test(msg)) {
          msg = "Website generation was cut short. Please try again — ask for a multi-page site.";
        }
        setError(`Message failed: ${msg}`);
      }
      setMessages((prev) => prev.filter((m) => m.id !== assistantId || m.content));
    } finally {
      setBusy(false); setStatus(null);
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
    if (maiTimer.current !== null) { window.clearInterval(maiTimer.current); maiTimer.current = null; }
  };
  useEffect(() => () => { if (maiTimer.current !== null) window.clearInterval(maiTimer.current); }, []);

  const signOut = async () => {
    sessionStorage.removeItem("keris_guest");
    sessionStorage.removeItem("zeros_guest");
    await signOutFirebase();
    navigate({ to: "/" });
  };

  const renameConversation = async (convId: string, title: string) => {
    const clean = title.trim().slice(0, 80) || "Chat";
    if (session) await supabase.from("conversations").update({ title: clean }).eq("id", convId).eq("user_id", session.uid);
    setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, title: clean } : c)));
    setRenamingId(null); setRenameValue("");
  };

  const deleteConversation = async (convId: string) => {
    if (session) {
      await supabase.from("messages").delete().eq("conversation_id", convId);
      await supabase.from("conversations").delete().eq("id", convId).eq("user_id", session.uid);
    }
    setConversations((prev) => prev.filter((c) => c.id !== convId));
    if (conversationId === convId) { setConversationId(null); setMessages([]); }
  };

  if (!ready) {
    return (
      <div className="relative min-h-screen">
        <TunnelBackground />
        <div className="relative z-10 flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading Zeros…</div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col" onPointerDown={beginMaiHold} onPointerUp={cancelMaiHold} onPointerCancel={cancelMaiHold} onPointerLeave={cancelMaiHold}>
      <TunnelBackground speed={0.5} />
      {maiUnlocking && (
        <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <p className="text-sm text-white/80">Unlocking Mai…</p>
        </div>
      )}

      <header className="sticky top-0 z-30 px-3 pt-3">
        <div className="glass mx-auto flex max-w-3xl items-center justify-between rounded-full px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={() => setSidebar(true)} className="grid h-8 w-8 place-items-center rounded-full text-foreground/90 hover:bg-white/10" aria-label="Open menu">
              <Menu className="h-4 w-4" />
            </button>
            <span className="text-[15px] font-semibold tracking-tight">Zeros</span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" aria-hidden />
            {isGuest ? "GUEST" : "ACCOUNT"}
          </span>
        </div>
      </header>

      {sidebar && (
        <div className="fixed inset-0 z-40 flex">
          <button type="button" className="absolute inset-0 bg-black/50" onClick={() => setSidebar(false)} aria-label="Close menu" />
          <aside className="relative z-10 flex h-full w-72 flex-col border-r border-white/10 bg-[oklch(0.12_0.014_265)] p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold">Chats</span>
              <button type="button" onClick={() => setSidebar(false)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => { setConversationId(null); setMessages([]); setSidebar(false); }}
              className="mb-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-medium hover:bg-white/10"
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
                      onBlur={() => void renameConversation(c.id, renameValue)}
                      onKeyDown={(e) => { if (e.key === "Enter") void renameConversation(c.id, renameValue); }}
                      className="min-w-0 flex-1 rounded bg-white/10 px-2 py-1 text-sm outline-none"
                    />
                  ) : (
                    <button type="button" onClick={() => { void loadConversation(c.id); setSidebar(false); }} className="min-w-0 flex-1 truncate text-left text-sm">
                      {c.title}
                    </button>
                  )}
                  <button type="button" onClick={() => { setRenamingId(c.id); setRenameValue(c.title); }} className="opacity-0 group-hover:opacity-100" aria-label="Rename">
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button type="button" onClick={() => void deleteConversation(c.id)} className="opacity-0 group-hover:opacity-100" aria-label="Delete">
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => void signOut()} className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-white/5">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </aside>
        </div>
      )}

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-3 pb-36 pt-6">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
            <ZerosOrb className="h-24 w-24" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">What can Zeros build?</h1>
              <p className="mt-1 text-sm text-muted-foreground">Search, images, 3D, songs, or full websites.</p>
            </div>
            <div className="grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  type="button"
                  onClick={() => void send(s.text, s.mode)}
                  className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm hover:bg-white/10"
                >
                  <s.Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((m) => (
              <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
                <div className={m.role === "user" ? "max-w-[85%] rounded-2xl bg-primary/15 px-4 py-3 text-sm" : "max-w-full text-sm"}>
                  {m.role === "assistant" ? (
                    <>
                      <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-invert prose-sm max-w-none">
                        {m.content}
                      </ReactMarkdown>
                      {m.attachment?.kind === "image" && m.attachment.src && (
                        <img src={m.attachment.src} alt="" className="mt-3 max-h-80 rounded-2xl" />
                      )}
                      {m.attachment?.kind === "model" && m.attachment.spec && (
                        <div className="mt-3"><ModelViewer spec={m.attachment.spec} /></div>
                      )}
                      {m.attachment?.kind === "web" && m.attachment.project && (
                        <div className="mt-3"><WebPreview project={m.attachment.project} /></div>
                      )}
                      {m.attachment?.kind === "song" && (
                        <div className="mt-3"><SongBlock title={m.attachment.spec?.title} url={songUrls[m.id]} /></div>
                      )}
                    </>
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-3">
                <ThinkingTrace active status={status} />
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
        {error && <div className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">⚠ {error}</div>}
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-4 pt-2">
        <form
          onSubmit={(e) => { e.preventDefault(); void send(); }}
          className="mx-auto flex max-w-3xl flex-col gap-2 rounded-[1.75rem] border border-white/10 bg-[oklch(0.14_0.014_265_/_0.72)] p-3.5 backdrop-blur-xl"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder="Message Zeros…"
            rows={1}
            className="max-h-32 min-h-[44px] w-full resize-none bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 max-h-[5.5rem] flex-1 flex-row flex-nowrap items-center gap-1.5 overflow-x-auto overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {MODES.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMode(mode === id ? "chat" : id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium transition ${
                    mode === id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "border border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                  {label}
                </button>
              ))}
            </div>
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 text-white shadow-lg disabled:opacity-40"
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
