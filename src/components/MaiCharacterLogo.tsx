import { Bot, Hammer } from "lucide-react";

export type MaiCharacter = "SPIDER-MAN" | "IRON-MAN" | "THOR" | "MAI";

export default function MaiCharacterLogo({ character, size = 48 }: { character: MaiCharacter; size?: number }) {
  if (character === "MAI") {
    return (
      <div
        className="grid shrink-0 place-items-center rounded-2xl border border-fuchsia-300/30 bg-fuchsia-400/10 text-fuchsia-200 shadow-[0_0_28px_rgba(232,121,249,0.25)]"
        style={{ width: size, height: size }}
        aria-label="MAI logo"
      >
        <Bot size={size * 0.52} />
      </div>
    );
  }
  if (character === "IRON-MAN") {
    return (
      <div
        className="grid shrink-0 place-items-center rounded-2xl border border-red-300/30 bg-red-500/10 text-red-200 shadow-[0_0_28px_rgba(248,113,113,0.22)]"
        style={{ width: size, height: size }}
        aria-label="Iron Man logo"
      >
        <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 48 48" fill="none" aria-hidden>
          <circle cx="24" cy="24" r="17" stroke="currentColor" strokeWidth="3" />
          <circle cx="24" cy="24" r="8" stroke="currentColor" strokeWidth="3" />
          <path d="M24 4v8M24 36v8M4 24h8M36 24h8M10 10l6 6M32 32l6 6M38 10l-6 6M16 32l-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  if (character === "THOR") {
    return (
      <div
        className="grid shrink-0 place-items-center rounded-2xl border border-sky-200/30 bg-sky-400/10 text-sky-100 shadow-[0_0_28px_rgba(125,211,252,0.22)]"
        style={{ width: size, height: size }}
        aria-label="Thor logo"
      >
        <Hammer size={size * 0.55} />
      </div>
    );
  }
  return (
    <div
      className="grid shrink-0 place-items-center rounded-2xl border border-rose-300/30 bg-rose-500/10 text-rose-100 shadow-[0_0_28px_rgba(251,113,133,0.24)]"
      style={{ width: size, height: size }}
      aria-label="Spider-Man logo"
    >
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 48 48" fill="none" aria-hidden>
          <path d="M24 8v32M10 14l10 8M38 14L28 22M8 28l13-4M40 28L27 24M14 38l8-13M34 38l-8-13" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="24" cy="24" rx="8" ry="14" stroke="currentColor" strokeWidth="3" />
        </svg>
    </div>
  );
}
