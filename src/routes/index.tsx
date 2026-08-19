import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";
import TunnelBackground from "@/components/TunnelBackground";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Zeros — The Funniest Genius AI by VsiStudio" },
      {
        name: "description",
        content:
          "Zeros is an always-on AI by VsiStudio: web search, image generation, 3D modelisation, music and full website building. No API key, no credits, no limits.",
      },
      { property: "og:title", content: "Zeros — AI by VsiStudio" },
      {
        property: "og:description",
        content:
          "Witty, brilliant and always working. Search, images, 3D models, music and websites in one AI.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: "🌐", title: "Web Search", body: "Live results, synthesized and sourced." },
  { icon: "🎨", title: "Image Generation", body: "Any idea, rendered in seconds." },
  { icon: "🧊", title: "Modelisation", body: "High-poly 3D models, downloadable .glb." },
  { icon: "🎵", title: "Music", body: "Full 3-4 minute tracks with lyrics, as .wav." },
  { icon: "⚡", title: "Super Web", body: "Complete websites with live preview." },
  { icon: "♾️", title: "Never Exhausted", body: "No API key. No credits. Always awake." },
];

function Landing() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/chat" });
    });
  }, [navigate]);

  const google = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        setError(result.error.message ?? "Google sign-in failed.");
        setLoading(false);
        return;
      }
      if (result.redirected) return;
      navigate({ to: "/chat" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google sign-in failed.");
      setLoading(false);
    }
  };

  const guest = () => {
    sessionStorage.setItem("zeros_guest", "1");
    navigate({ to: "/chat" });
  };

  return (
    <main className="relative min-h-screen">
      <TunnelBackground />

      <section className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-5 py-20 text-center">
        <span className="glass rounded-full px-4 py-1.5 text-xs tracking-[0.25em] text-muted-foreground uppercase">
          A VsiStudio creation
        </span>

        <h1 className="text-gradient mt-8 text-7xl font-black tracking-tight sm:text-8xl">
          ZEROS
        </h1>
        <p className="mt-5 max-w-xl text-balance text-lg text-muted-foreground">
          The funniest, wittiest, unreasonably intelligent AI in existence. Built by
          VsiStudio, founded by Vivan Sahu. No API key. Credits that never run out.
          Always working.
        </p>

        <div className="mt-10 flex w-full max-w-sm flex-col gap-3">
          <button
            onClick={google}
            disabled={loading}
            className="glass glow-ring flex items-center justify-center gap-3 rounded-2xl px-6 py-4 text-sm font-semibold transition hover:scale-[1.02] disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
              <path
                fill="#EA4335"
                d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1a6.2 6.2 0 1 1 0-12.4c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 2.9 14.7 2 12 2a10 10 0 1 0 0 20c5.8 0 9.6-4 9.6-9.7 0-.7-.1-1.2-.2-1.7H12z"
              />
            </svg>
            {loading ? "Opening Google…" : "Continue with Google"}
          </button>

          <button
            onClick={guest}
            className="rounded-2xl border border-border px-6 py-4 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
          >
            Continue as guest
          </button>
          <p className="text-xs text-muted-foreground">
            Guest sessions are never stored — nothing is saved anywhere. Sign in with
            Google to keep chats and let Zeros remember you.
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="mt-16 grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="glass animate-float rounded-2xl p-5 text-left">
              <div className="text-2xl">{f.icon}</div>
              <h2 className="mt-2 text-sm font-semibold">{f.title}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
