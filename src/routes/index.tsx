import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { signInWithGoogle } from "@/lib/firebase";
import TunnelBackground from "@/components/TunnelBackground";
import ZerosOrb from "@/components/ZerosOrb";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Zeros — The Funniest Genius AI by VsiStudio" },
      {
        name: "google-site-verification",
        content: "OteH2W5oFjiABCbkPA7NYa9hXnM33m2AI8M0xPRPDAI",
      },
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
      // Google authentication is performed by Firebase — never by Lovable Auth.
      const { googleIdToken } = await signInWithGoogle();
      if (!googleIdToken) {
        throw new Error("Firebase signed in, but Google did not return an ID token.");
      }

      // Firebase is the authentication source. Supabase is configured as a
      // first-class Firebase third-party auth consumer, so its client attaches
      // the current Firebase ID token automatically to database requests.
      // Do NOT exchange the Firebase token through signInWithIdToken(provider:"google"):
      // that API expects an OIDC token for the configured provider, not a Firebase JWT.
      void googleIdToken;

      sessionStorage.removeItem("zeros_guest");
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
    <main className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <TunnelBackground />

      <section className="relative z-10 w-full max-w-md rounded-[2rem] border border-white/8 bg-[oklch(0.13_0.015_220_/_0.82)] px-7 py-10 text-center shadow-[0_30px_80px_-20px_oklch(0_0_0_/_0.9)] backdrop-blur-2xl">
        <div className="flex justify-center">
          <ZerosOrb size={112} />
        </div>

        <h1 className="text-gradient mt-7 text-5xl font-extrabold tracking-tight">
          Zeros
        </h1>
        <p className="mx-auto mt-4 max-w-xs text-balance text-[15px] leading-relaxed text-muted-foreground">
          Sign in and every chat, image and memory stays tied to your Google account —
          across every device.
        </p>

        <div className="mt-9 flex flex-col gap-3.5">
          <button
            onClick={google}
            disabled={loading}
            className="flex items-center justify-center gap-3 rounded-full bg-[oklch(0.97_0.002_250)] px-6 py-4 text-[15px] font-semibold text-[oklch(0.15_0.01_265)] transition hover:brightness-105 disabled:opacity-60"
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
            className="flex items-center justify-center gap-3 rounded-full border border-white/12 bg-white/[0.03] px-6 py-4 text-[15px] font-medium text-foreground/90 transition hover:bg-white/[0.07]"
          >
            Continue as guest <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-7 flex items-center justify-center gap-2 text-[13px] text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Guest chats are never saved.
        </p>
        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      </section>
    </main>
  );
}

