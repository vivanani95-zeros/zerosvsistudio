import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, Lock, Send, Sparkles, Users, X } from "lucide-react";
import MaiCharacterLogo, { type MaiCharacter } from "@/components/MaiCharacterLogo";
import MaiSplineBackground from "@/components/MaiSplineBackground";

type Message = {
  id: string;
  character: MaiCharacter;
  content: string;
  is_ai: boolean;
  created_at: string;
};

const CHARACTERS: { id: Exclude<MaiCharacter, "MAI">; title: string; subtitle: string }[] = [
  { id: "SPIDER-MAN", title: "Spider-Man", subtitle: "Spider-Guy access" },
  { id: "IRON-MAN", title: "Iron Man", subtitle: "Arc Reactor access" },
  { id: "THOR", title: "Thor", subtitle: "Hammer access" },
];

async function postAccess(body: Record<string, unknown>) {
  const res = await fetch("/api/mai/access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Access denied.");
  return json;
}

function Gate({ onOpen }: { onOpen: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="relative mx-auto w-full max-w-xl overflow-hidden rounded-[2.25rem] border border-white/10 bg-black/55 p-8 text-center shadow-[0_30px_120px_rgba(0,0,0,.65)] backdrop-blur-2xl">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-fuchsia-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="relative mx-auto grid h-24 w-24 place-items-center rounded-[2rem] border border-white/15 bg-white/[0.04] shadow-[0_0_80px_rgba(125,211,252,.16)]">
        <MaiCharacterLogo character="MAI" size={64} />
      </div>
      <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-bold tracking-[0.28em] text-white/45 uppercase">
        <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,.9)]" />
        VsiStudio // classified
      </div>
      <h1 className="mt-4 bg-gradient-to-r from-white via-fuchsia-100 to-cyan-100 bg-clip-text text-6xl font-black tracking-[-0.05em] text-transparent">MAI</h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/60">
        This is not Zeros. It is a separate private room hidden behind the tunnel.
      </p>
      <form
        className="mt-7 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true); setError("");
          try { await postAccess({ stage: "gate", password }); onOpen(); }
          catch (err) { setError(err instanceof Error ? err.message : "Access denied."); }
          finally { setBusy(false); }
        }}
      >
        <input
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="MAI access password"
          className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-fuchsia-300/50"
        />
        <button disabled={busy || !password} className="rounded-2xl bg-white px-5 font-bold text-black transition hover:scale-[1.02] disabled:opacity-50">
          <Lock className="mx-auto h-4 w-4" />
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
    </div>
  );
}

function CharacterSelect({ onEnter }: { onEnter: (character: MaiCharacter) => void }) {
  const [selected, setSelected] = useState<Exclude<MaiCharacter, "MAI"> | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedInfo = CHARACTERS.find((c) => c.id === selected);
  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="text-center">
        <p className="text-xs font-semibold tracking-[0.32em] text-fuchsia-200/70 uppercase">stage 02 // identity</p>
        <h1 className="mt-3 text-4xl font-black">Choose your Avenger.</h1>
        <p className="mt-2 text-sm text-white/55">Your character password unlocks your identity inside the group.</p>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {CHARACTERS.map((item) => (
          <button
            key={item.id}
            onClick={() => { setSelected(item.id); setPassword(""); setError(""); }}
            className={`group relative overflow-hidden rounded-[2rem] border p-6 text-left transition duration-500 hover:-translate-y-1 hover:scale-[1.015] hover:border-white/25 hover:bg-white/[0.07] ${selected === item.id ? "border-fuchsia-300/60 bg-fuchsia-400/10 shadow-[0_0_65px_rgba(232,121,249,0.18)]" : "border-white/10 bg-black/35"}`}
          >
            <MaiCharacterLogo character={item.id} size={72} />
            <div className="mt-5 text-xl font-black">{item.title}</div>
            <div className="mt-1 text-sm text-white/45">{item.subtitle}</div>
          </button>
        ))}
      </div>
      {selected && selectedInfo && (
        <form
          className="mx-auto mt-6 flex max-w-xl gap-2 rounded-[1.7rem] border border-white/10 bg-black/45 p-2 backdrop-blur-xl"
          onSubmit={async (e) => {
            e.preventDefault(); setBusy(true); setError("");
            try { await postAccess({ stage: "character", character: selected, password }); onEnter(selected); }
            catch (err) { setError(err instanceof Error ? err.message : "Character access denied."); }
            finally { setBusy(false); }
          }}
        >
          <MaiCharacterLogo character={selected} size={46} />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder={`Password for ${selectedInfo.title}`}
            className="min-w-0 flex-1 bg-transparent px-2 outline-none"
          />
          <button disabled={busy || !password} className="rounded-2xl bg-white px-5 font-bold text-black disabled:opacity-50">
            Enter
          </button>
        </form>
      )}
      {error && <p className="mt-3 text-center text-sm text-rose-300">{error}</p>}
    </div>
  );
}

function Group({ character, onExit }: { character: MaiCharacter; onExit: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState("");
  const [thinkingLabel, setThinkingLabel] = useState("");
  const [thinkingStep, setThinkingStep] = useState(0);
  const bottom = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    const res = await fetch("/api/mai/messages?limit=80", { cache: "no-store" });
    if (res.status === 401) { onExit(); return; }
    const json = await res.json();
    setMessages(json.messages ?? []);
    setHasMore(Boolean(json.hasMore));
    setLoading(false);
  };

  const loadOlder = async () => {
    const oldest = messages[0]?.created_at;
    if (!oldest || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/mai/messages?limit=80&before=${encodeURIComponent(oldest)}`, { cache: "no-store" });
      if (res.status === 401) { onExit(); return; }
      const json = await res.json();
      const older = (json.messages ?? []) as Message[];
      setMessages((prev) => [...older, ...prev.filter((m) => !older.some((o) => o.id === m.id))]);
      setHasMore(Boolean(json.hasMore));
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 2500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => setThinkingStep((n) => n + 1), 1400);
    return () => window.clearInterval(timer);
  }, [pending]);

  const thinkingSteps = thinkingLabel.startsWith("🔎")
    ? ["Understanding the request", "Searching the web", "Comparing useful sources", "Verifying the facts", "Forming the answer"]
    : ["Understanding the request", "Planning the approach", "Checking context and edge cases", "Reasoning through the solution", "Verifying before answering"];
  const currentThinkingStep = thinkingSteps[thinkingStep % thinkingSteps.length];

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const content = input.trim();
    if (!content) return;
    setInput(""); setPending((n) => n + 1); setError("");
    const isSearchRequest = /\b(?:search|google|browse|look\s*(?:it|this)?\s*up|check|find)\b.{0,160}\b(?:web|internet|online|latest|current|today|date|news|this\s+week)\b|\b(?:web|internet|online)\b.{0,100}\b(?:search|browse|check|find|look)\b|\b(?:what(?:'s| is)?|tell me)\b.{0,80}\b(?:latest|today(?:'s)?|current)\b/i.test(content);
    setThinkingStep(0);\n    setThinkingLabel(isSearchRequest ? "🔎 Web search + deep reasoning" : "🧠 Deep reasoning");
    try {
      const res = await fetch("/api/mai/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Message failed.");
      const saved = json.message as Message;
      setMessages((prev) => [...prev, saved]);

      // MAI answers in a second request so sending never waits for model generation.
      // The UI remains usable for additional messages while this runs.
      void fetch("/api/mai/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "respond", content, messageId: saved.id }),
      })
        .then(async (replyRes) => {
          const replyJson = await replyRes.json().catch(() => ({}));
          if (!replyRes.ok) throw new Error(replyJson.error || "MAI response failed.");
          if (replyJson.mai) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === replyJson.mai.id)) return prev;
              return [...prev, replyJson.mai];
            });
          }
        })
        .catch((err) => {\n          setError(err instanceof Error ? err.message : "MAI could not finish that response.");\n          void load();\n        })
        .finally(() => {
          setPending((n) => Math.max(0, n - 1));
          setThinkingLabel("");
          void load();
        });

      // The response request owns this pending slot; the composer itself stays enabled.
      setTimeout(() => void load(), 250);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Message failed.");
    } finally {
      setPending((n) => Math.max(0, n - 1));
    }
  };

  return (
    <section className="relative mx-auto flex h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[2.25rem] border border-white/10 bg-black/15 shadow-[0_30px_120px_rgba(0,0,0,.45)] backdrop-blur-[2px]">
      <header className="relative flex items-center justify-between border-b border-white/10 bg-black/20 px-5 py-4 backdrop-blur-sm">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-300/70 to-transparent" />
        <div className="flex items-center gap-3">
          <MaiCharacterLogo character="MAI" size={44} />
          <div>
            <div className="bg-gradient-to-r from-white via-fuchsia-100 to-cyan-100 bg-clip-text font-black tracking-tight text-transparent">MAI GROUP</div>
            <div className="flex items-center gap-1 text-xs text-white/45"><Users className="h-3.5 w-3.5" /> 4 members · private</div>
          </div>
        </div>
        <button onClick={onExit} className="rounded-xl p-2 text-white/60 hover:bg-white/10" aria-label="Leave MAI">
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto bg-black/[0.03] px-4 py-5">
        {loading ? (
          <div className="grid h-full place-items-center text-sm text-white/45">Opening the group vault…</div>
        ) : messages.length === 0 ? (
          <div className="grid h-full place-items-center text-center text-white/45">
            <div><div className="text-2xl font-black text-white">The room is quiet. Suspiciously quiet.</div><p className="mt-2">Say something. MAI might roast you. Eventually.</p></div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {hasMore && (
              <div className="flex justify-center pb-2">
                <button
                  type="button"
                  onClick={() => void loadOlder()}
                  disabled={loadingMore}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white/60 transition hover:bg-white/[0.08] disabled:opacity-40"
                >
                  {loadingMore ? "Opening older history…" : "Load older messages"}
                </button>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex gap-3 ${m.character === character ? "justify-end" : "justify-start"}`}>
                {m.character !== character && <MaiCharacterLogo character={m.character} size={42} />}
                <div className={`max-w-[78%] rounded-3xl border px-4 py-3 ${m.character === character ? "border-fuchsia-300/20 bg-fuchsia-400/10" : m.is_ai ? "border-fuchsia-300/25 bg-fuchsia-400/10" : "border-white/10 bg-white/[0.045]"}`}>
                  <div className="mb-1 text-[11px] font-bold tracking-wider text-white/45">{m.character === "MAI" ? "MAI" : m.character}</div>
                  <div className="whitespace-pre-wrap text-sm leading-6 text-white/90">{m.content}</div>
                </div>
                {m.character === character && <MaiCharacterLogo character={m.character} size={42} />}
              </div>
            ))}
            <div ref={bottom} />
          </div>
        )}
      </div>

      {pending > 0 && (
        <div className="border-t border-white/10 bg-black/30 px-4 py-3 backdrop-blur-xl">
          <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border border-fuchsia-300/15 bg-fuchsia-400/[0.06] px-4 py-3 shadow-[0_0_45px_rgba(217,70,239,.08)]">
            <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-fuchsia-300/20 bg-fuchsia-400/10">
              <Sparkles className="h-4 w-4 animate-pulse text-fuchsia-200" />
              <span className="absolute inset-0 animate-ping rounded-xl border border-fuchsia-300/20" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs font-bold text-fuchsia-100">
                <span>{thinkingLabel}</span>
                <span className="inline-flex gap-1">
                  <i className="h-1 w-1 animate-bounce rounded-full bg-fuchsia-200" />
                  <i className="h-1 w-1 animate-bounce rounded-full bg-fuchsia-200 [animation-delay:120ms]" />
                  <i className="h-1 w-1 animate-bounce rounded-full bg-fuchsia-200 [animation-delay:240ms]" />
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-white/45">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
                <span className="truncate">{currentThinkingStep}</span>
              </div>
            </div>
            <div className="hidden shrink-0 text-[10px] font-semibold tracking-wider text-white/25 uppercase sm:block">Gemini 2.5 Pro</div>
          </div>
        </div>
      )}

      <div className="border-t border-white/10 bg-black/20 p-3 backdrop-blur-sm">
        {error && <div className="mb-2 px-2 text-xs text-rose-300">{error}</div>}
        <form onSubmit={send} className="mx-auto flex max-w-3xl gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-2">
          <MaiCharacterLogo character={character} size={42} />
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={pending ? `MAI is working…${pending > 1 ? ` · ${pending} requests in flight` : ""} · you can keep typing` : "Message the group…"} className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" />
          <button disabled={!input.trim()} className="rounded-xl bg-white px-4 text-black disabled:opacity-40" aria-label="Send message"><Send className="h-4 w-4" /></button>
        </form>
      </div>
    </section>
  );
}

export const Route = createFileRoute("/mai")({
  head: () => ({ meta: [{ title: "MAI — Private Avengers Group" }] }),
  component: MaiPage,
});

function MaiPage() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<"gate" | "character" | "group">("gate");
  const [character, setCharacter] = useState<MaiCharacter | null>(null);

  useEffect(() => {
    fetch("/api/mai/access", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated) { setCharacter(data.character); setStage("group"); }
        else if (data.gate) setStage("character");
      })
      .catch(() => {});
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <MaiSplineBackground className="pointer-events-none fixed inset-0 z-0 h-screen w-screen opacity-100" />
      {stage !== "group" && (
        <div className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(135deg,rgba(0,0,0,.38),rgba(14,8,25,.22))]" />
      )}
      <div className="relative z-10 min-h-screen bg-transparent p-4 md:p-8">
        <button onClick={() => navigate({ to: "/chat" })} className="mb-4 rounded-full border border-white/10 bg-black/35 px-4 py-2 text-sm text-white/70 backdrop-blur-xl transition hover:bg-white/10">
          <ArrowLeft className="mr-2 inline h-4 w-4" /> Back to Zeros
        </button>
        {stage === "gate" && <Gate onOpen={() => setStage("character")} />}
        {stage === "character" && <CharacterSelect onEnter={(c) => { setCharacter(c); setStage("group"); }} />}
        {stage === "group" && character && <Group character={character} onExit={async () => { await fetch("/api/mai/access", { method: "DELETE" }); setStage("gate"); setCharacter(null); }} />}
      </div>
    </main>
  );
}
