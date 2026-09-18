import { Bot, Hammer, Shield } from "lucide-react";

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
        <Shield size={size * 0.55} />
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
      <span className="text-2xl font-black" style={{ fontSize: size * 0.55 }}>🕷</span>
    </div>
  );
}
