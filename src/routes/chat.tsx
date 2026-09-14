import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Session } from "@supabase/supabase-js";
import { ArrowUp, Boxes, Brain, Code2, Globe, Image as ImageIcon, LogOut, Menu, Music4, Plus, Sparkles, User, X } from "lucide-react";

import TunnelBackground from "@/components/TunnelBackground";
import ModelViewer from "@/components/ModelViewer";
import WebPreview from "@/components/WebPreview";
import ZerosOrb from "@/components/ZerosOrb";
import { supabase } from "@/integrations/supabase/client";
import { generateImage, generateModel, streamChat, type Msg } from "@/lib/ai-client";
import { extractBlock, type ZeroMode } from "@/lib/zeros";
import { renderSong, type SongSpec } from "@/lib/song";
import { extractWebProject, type WebProject } from "@/lib/web-project";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Chat with Zeros — AI by VsiStudio" },
      { name: "description", content: "Talk to Zeros: web search, studio image generation, native 3D models, original songs and full website building." },
      { property: "og:title", content: "Chat with Zeros" },
      { property: "og:description", content: "Search, images, 3D models, songs and websites — powered by Zeros." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatPage,
});

type Attachment =
  | { kind: "image"; src: string }
  | { kind: "model"; url: string; source?: string; prompt?: string }
  | { kind: "web"; project: WebProject }
  | { kind: "song"; spec: SongSpec };

type ChatMessage = { id: string; role: "user" | "assistant"; content: string; mode?: ZeroMode; attachment?: Attachment | null };

const MODES: { id: Exclude<ZeroMode, "chat">; label: string; Icon: typeof Globe }[] = [
  { id: "search", label: "Web", Icon: Globe },
  { id: "image", label: "Image", Icon: ImageIcon },
  { id: "model", label: "3D Model", Icon: Boxes },
  { id: "music", label: "Song", Icon: Music4 },
  { id: "web", label: "Code", Icon: Code2 },
];

const SUGGESTIONS: { text: string; Icon: typeof Globe; mode: ZeroMode }[] = [
  { text: "What's new in AI today", Icon: Globe, mode: "search" },
  { text: "Render a cinematic glass orb", Icon: ImageIcon, mode: "image" },
  { text: "Build a detailed 3D sports car", Icon: Boxes, mode: "model" },
  { text: "Write me a song", Icon: Music4, mode: "music" },
  { text: "Build a mini web app", Icon: Code2, mode: "web" },
  { text: "Roast my startup idea", Icon: Sparkles, mode: "chat" },
];

const uid = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);

async function ensurePng(src: string): Promise<string> {
  if (src.startsWith("data:image/png")) return src;
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("PNG canvas unavailable");
        ctx.drawImage(image, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch (error) { reject(error); }
    };
    image.onerror = () => reject(new Error("Generated image could not be decoded."));
    image.src = src;
  });
}

function Thinking({ detail }: { detail?: string | null }) {
  return (
    <div className="flex items-center gap-3 py-2 text-xs text-primary" role="status" aria-live="polite">
      <span className="relative flex h-5 w-5 items-center justify-center">
        <span className="absolute h-5 w-5 animate-ping rounded-full bg-primary/20" />
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/25 border-t-primary shadow-[0_0_14px_color-mix(in_oklch,var(--primary)_55%,transparent)]" />
      </span>
      <span className="font-bold tracking-wide">Thinking</span>
      {detail ? <span className="text-muted-foreground">{detail}</span> : null}
    </div>
  );
}

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

  const loadConversation = useCallback(async (convId: string) => {
    const { data: rows } = await supabase.from("messages").select("id, role, content, mode, attachment").eq("conversation_id", convId).order("created_at", { ascending: true });
    setMessages((rows ?? []).map((r) => ({ id: r.id, role: r.role as "user" | "assistant", content: r.content, mode: (r.mode as ZeroMode) ?? undefined, attachment: (r.attachment as Attachment | null) ?? null })));
    setConversationId(convId);
  }, []);

  useEffect(() => {
    if (!session) return;
    const userId = session.user.id;
    void (async () => {
      await supabase.from("profiles").upsert({ id: userId, display_name: (session.user.user_metadata?.["full_name"] as string) ?? session.user.email ?? "Human", avatar_url: (session.user.user_metadata?.["avatar_url"] as string) ?? null }, { onConflict: "id" });
      const { data: mem } = await supabase.from("memories").select("fact").order("created_at", { ascending: false }).limit(40);
      setMemories((mem ?? []).map((m) => m.fact));
      const { data: convs } = await supabase.from("conversations").select("id, title").order("updated_at", { ascending: false }).limit(30);
      setConversations((convs ?? []).map((c) => ({ id: c.id, title: c.title ?? "Chat" })));
      const existing = convs?.[0]?.id;
      if (existing) await loadConversation(existing);
      else {
        const { data: created } = await supabase.from("conversations").insert({ user_id: userId, title: "New chat" }).select("id, title").single();
        if (created) { setConversationId(created.id); setConversations([{ id: created.id, title: created.title ?? "New chat" }]); }
      }
    })();
  }, [session, loadConversation]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  const persist = useCallback(async (m: ChatMessage) => {
    if (!session || !conversationId) return;
    let attachment = m.attachment ?? null;
    if (attachment?.kind === "image" && attachment.src.length > 900000) attachment = null;
    if (attachment?.kind === "model" && attachment.url.length > 900000) attachment = null;
    await supabase.from("messages").insert({ conversation_id: conversationId, user_id: session.user.id, role: m.role, content: m.content, mode: m.mode ?? null, attachment: attachment as never });
    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
  }, [session, conversationId]);

  const titleIfFirst = useCallback(async (prompt: string) => {
    if (!session || !conversationId || messages.length) return;
    const title = prompt.slice(0, 40);
    await supabase.from("conversations").update({ title }).eq("id", conversationId);
    setConversations((prev) => prev.map((c) => c.id === conversationId ? { ...c, title } : c));
  }, [session, conversationId, messages.length]);

  const rememberIfAsked = useCallback(async (text: string) => {
    if (!session) return;
    const m = text.match(/remember(?:\s+that)?[:,]?\s+(.{4,240})/i);
    if (!m?.[1]) return;
    const fact = m[1].trim();
    await supabase.from("memories").insert({ user_id: session.user.id, fact });
    setMemories((prev) => [fact, ...prev]);
  }, [session]);

  const send = async (override?: string, overrideMode?: ZeroMode) => {
    const prompt = (override ?? input).trim();
    const activeMode = overrideMode ?? mode;
    if (!prompt || busy) return;
    setInput(""); setError(null); setBusy(true); setStatus(null);
    const userMsg: ChatMessage = { id: uid(), role: "user", content: prompt, mode: activeMode };
    const assistantId = uid();
    setMessages((prev) => [...prev, userMsg]);
    void titleIfFirst(prompt); void persist(userMsg); void rememberIfAsked(prompt);

    try {
      if (activeMode === "image") {
        setStatus("Creating and reviewing studio image");
        const raw = await generateImage(prompt);
        setStatus("Preparing lossless PNG preview");
        const src = await ensurePng(raw);
        const msg: ChatMessage = { id: assistantId, role: "assistant", content: `Studio render for **${prompt}**. Preview it below or download the lossless PNG.`, mode: activeMode, attachment: { kind: "image", src } };
        setMessages((prev) => [...prev, msg]); void persist(msg); return;
      }

      if (activeMode === "model") {
        setStatus("Building native 3D geometry");
        const url = await generateModel(prompt, (p) => setStatus(p < 50 ? `Building native 3D geometry · ${Math.round(p)}%` : `Inspecting and refining model · ${Math.round(p)}%`));
        const msg: ChatMessage = { id: assistantId, role: "assistant", content: `Native studio model for **${prompt}**. The interactive preview is the generated asset; download exports it as GLB.`, mode: activeMode, attachment: { kind: "model", url, source: "Zeros Native 3D", prompt } };
        setMessages((prev) => [...prev, msg]); void persist(msg); return;
      }

      setStatus(activeMode === "search" ? "Searching the web" : activeMode === "music" ? "Composing and arranging" : activeMode === "web" ? "Building project" : "Reasoning");
      const history: Msg[] = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
      let streamed = false;
      const full = await streamChat(history, activeMode, memories, (text) => {
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === assistantId);
          streamed = true;
          return exists ? prev.map((m) => m.id === assistantId ? { ...m, content: text } : m) : [...prev, { id: assistantId, role: "assistant", content: text, mode: activeMode }];
        });
      });

      let attachment: Attachment | null = null;
      let content = full;
      if (activeMode === "web") {
        const project = extractWebProject(full);
        if (!project || Object.keys(project.files).length < 3) throw new Error("The website response ended before every file was complete. Please retry it.");
        attachment = { kind: "web", project };
        content = (full.replace(/```[\s\S]*?```/g, "").trim() || "Full project generated.") + `\n\n**${Object.keys(project.files).length} files** generated — preview, browse the code, or download the .zip.`;
      } else if (activeMode === "music") {
        const raw = extractBlock(full, "json");
        if (!raw) throw new Error("The song response ended before composition data was complete.");
        const spec = JSON.parse(raw) as SongSpec;
        attachment = { kind: "song", spec };
        content = (full.replace(/```[\s\S]*?```/, "").trim() || "Track generated.") + `\n\n**${spec.title}** · ${spec.bpm} BPM · ${spec.style ?? "original"}`;
        setStatus("Rendering audio");
        const blob = await renderSong(spec);
        setSongUrls((p) => ({ ...p, [assistantId]: URL.createObjectURL(blob) }));
      }

      const finalMsg: ChatMessage = { id: assistantId, role: "assistant", content, mode: activeMode, attachment };
      setMessages((prev) => streamed || prev.some((m) => m.id === assistantId) ? prev.map((m) => m.id === assistantId ? finalMsg : m) : [...prev, finalMsg]);
      void persist(finalMsg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something broke. Try again.");
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally { setBusy(false); setStatus(null); }
  };

  const signOut = async () => { sessionStorage.removeItem("zeros_guest"); await supabase.auth.signOut(); navigate({ to: "/" }); };
  const newChat = async () => {
    setMessages([]); setSidebar(false);
    if (!session) return;
    const { data } = await supabase.from("conversations").insert({ user_id: session.user.id, title: "New chat" }).select("id, title").single();
    if (data) { setConversations((prev) => [{ id: data.id, title: data.title ?? "New chat" }, ...prev]); setConversationId(data.id); }
  };

  if (!ready) return <main className="relative min-h-screen"><TunnelBackground /><div className="relative z-10 flex min-h-screen items-center justify-center"><Thinking detail="Waking Zeros" /></div></main>;

  return (
    <main className="relative flex min-h-screen flex-col">
      <TunnelBackground speed={0.5} />
      <header className="sticky top-0 z-30 px-3 pt-3"><div className="glass mx-auto flex max-w-3xl items-center justify-between rounded-3xl px-4 py-3"><div className="flex items-center gap-3"><button onClick={() => setSidebar(true)} aria-label="Open menu" className="text-foreground/90 transition hover:text-primary"><Menu className="h-6 w-6" /></button><span className="text-lg font-black tracking-tight">Zeros</span></div><span className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-[11px] tracking-[0.15em] text-muted-foreground uppercase"><span className="h-1.5 w-1.5 rounded-full bg-primary" />{isGuest && !session ? "Guest" : "Memory"}</span></div></header>

      {sidebar && <div className="fixed inset-0 z-40 flex" role="dialog"><div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebar(false)} /><aside className="glass relative flex h-full w-[86%] max-w-sm flex-col rounded-r-3xl p-5"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><ZerosOrb size={32} /><span className="text-lg font-black">Zeros</span></div><button onClick={() => setSidebar(false)} aria-label="Close menu"><X className="h-5 w-5 text-muted-foreground" /></button></div><button onClick={() => void newChat()} className="mt-5 flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"><Plus className="h-4 w-4" /> New chat</button><p className="mt-6 text-[11px] tracking-[0.2em] text-muted-foreground uppercase">Conversations</p><div className="mt-2 max-h-56 space-y-1 overflow-y-auto">{conversations.map((c) => <button key={c.id} onClick={() => { void loadConversation(c.id); setSidebar(false); }} className={"block w-full truncate rounded-xl px-3 py-2 text-left text-sm transition " + (c.id === conversationId ? "bg-white/10 text-foreground" : "text-muted-foreground hover:bg-white/5")}>{c.title}</button>)}</div><p className="mt-6 flex items-center gap-2 text-[11px] tracking-[0.2em] text-muted-foreground uppercase"><Brain className="h-4 w-4 text-accent" /> Memory</p><div className="mt-2 flex-1 space-y-1 overflow-y-auto text-sm text-muted-foreground">{memories.length ? memories.map((m, i) => <p key={i} className="rounded-lg bg-white/5 px-3 py-1.5">{m}</p>) : <p>Zeros remembers durable facts about you as you chat.</p>}</div><button onClick={() => void signOut()} className="mt-4 flex items-center gap-3 rounded-full border border-border px-4 py-3 text-left"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10"><User className="h-4 w-4" /></span><span className="flex-1"><span className="block text-sm font-semibold">{session ? session.user.email ?? "Signed in" : "Guest session"}</span><span className="block text-xs text-muted-foreground">{session ? "Memory & chats saved" : "Chats are not saved"}</span></span><LogOut className="h-4 w-4 text-muted-foreground" /></button></aside></div>}

      <section className="relative z-10 mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-60">
        {messages.length === 0 && <div className="flex flex-col items-center text-center"><div className="mt-6 animate-float"><ZerosOrb size={140} /></div><h1 className="text-gradient mt-8 text-4xl font-black tracking-tight">Meet Zeros</h1><p className="mt-4 max-w-md text-balance text-sm text-muted-foreground">Live web search, professional image generation, native 3D models, original songs and a code canvas — with memory that follows your account.</p><div className="mt-8 w-full space-y-3">{SUGGESTIONS.map((s) => <button key={s.text} onClick={() => { setMode(s.mode); void send(s.text, s.mode); }} className="glass flex w-full items-center gap-4 rounded-full px-5 py-4 text-left text-sm transition hover:bg-white/10"><s.Icon className="h-5 w-5 text-primary" />{s.text}</button>)}</div></div>}

        <div className="space-y-5">
          {messages.map((m) => <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}><div className={m.role === "user" ? "max-w-[85%] rounded-3xl rounded-br-md bg-primary px-4 py-3 text-sm text-primary-foreground" : "glass w-full rounded-3xl rounded-bl-md px-4 py-3 text-sm"}>{m.role === "assistant" ? <><div className="prose prose-invert prose-sm max-w-none prose-pre:bg-[oklch(0.1_0.01_265)]"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown></div>{m.attachment?.kind === "image" && <div className="mt-3"><img src={m.attachment.src} alt="Generated by Zeros" className="w-full rounded-2xl border border-border" /><a href={m.attachment.src} download="zeros-studio-image.png" className="mt-2 inline-block rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Download .png</a></div>}{m.attachment?.kind === "model" && <ModelViewer url={m.attachment.url} source={m.attachment.source} prompt={m.attachment.prompt} />}{m.attachment?.kind === "web" && <WebPreview project={m.attachment.project} />}{m.attachment?.kind === "song" && <SongBlock spec={m.attachment.spec} url={songUrls[m.id]} onRender={async (spec) => { const blob = await renderSong(spec); setSongUrls((p) => ({ ...p, [m.id]: URL.createObjectURL(blob) })); }} />}</> : <span className="whitespace-pre-wrap">{m.content}</span>}</div></div>)}
          {busy && <Thinking detail={status} />}
          {error && <p className="text-xs text-destructive">⚠ {error}</p>}
        </div>
        <div ref={bottomRef} />
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 px-3 pb-4"><div className="glass mx-auto max-w-3xl rounded-3xl p-4"><textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} rows={1} placeholder="Message Zeros…" className="max-h-40 w-full resize-none bg-transparent px-1 py-1 text-base outline-none placeholder:text-muted-foreground" /><div className="mt-3 flex items-center gap-3"><div className="flex flex-1 gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{MODES.map((m) => { const active = mode === m.id; return <button key={m.id} aria-label={m.label} onClick={() => setMode(active ? "chat" : m.id)} className={"flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition " + (active ? "border-transparent bg-primary text-primary-foreground shadow-[var(--glow-primary)]" : "border-border text-muted-foreground hover:text-foreground")}><m.Icon className="h-4 w-4" />{m.label}</button>; })}</div><button onClick={() => void send()} disabled={busy || !input.trim()} aria-label="Send" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-primary-foreground transition disabled:opacity-40" style={{ background: "var(--gradient-zero)" }}><ArrowUp className="h-5 w-5" /></button></div></div></div>
    </main>
  );
}

function SongBlock({ spec, url, onRender }: { spec: SongSpec; url?: string; onRender: (spec: SongSpec) => Promise<void> }) {
  const [rendering, setRendering] = useState(false);
  return <div className="mt-3 rounded-2xl border border-border bg-card/50 p-4"><h3 className="text-sm font-bold">{spec.title}</h3>{url ? <><audio controls src={url} className="mt-3 w-full" /><a href={url} download={`${spec.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.wav`} className="mt-2 inline-block rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Download .wav</a></> : <button onClick={async () => { setRendering(true); try { await onRender(spec); } finally { setRendering(false); } }} disabled={rendering} className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">{rendering ? "Rendering audio…" : "Render audio"}</button>}<div className="mt-4 space-y-3 text-xs text-muted-foreground">{spec.lyrics?.map((s, i) => <div key={i}><p className="font-semibold text-foreground">{s.section}</p>{s.lines?.map((l, j) => <p key={j}>{l}</p>)}</div>)}</div></div>;
}
