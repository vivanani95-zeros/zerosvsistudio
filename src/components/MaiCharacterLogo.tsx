import { Hammer } from "lucide-react";
import ZerosOrb from "@/components/ZerosOrb";

export type MaiCharacter = "SPIDER-MAN" | "IRON-MAN" | "THOR" | "MAI";

function Shell({ size, className, children, label }: { size: number; className: string; children: React.ReactNode; label: string }) {
  return (
    <div
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-[28%] border backdrop-blur-xl ${className}`}
      style={{ width: size, height: size }}
      aria-label={label}
      title={label}
    >
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_35%_20%,rgba(255,255,255,.24),transparent_34%)]" />
      <span className="pointer-events-none absolute -inset-3 rounded-full opacity-50 blur-xl bg-current" />
      <span className="relative z-10">{children}</span>
    </div>
  );
}

export default function MaiCharacterLogo({ character, size = 48 }: { character: MaiCharacter; size?: number }) {
  if (character === "MAI") {
    return (
      <div className="relative shrink-0" style={{ width: size, height: size }} aria-label="MAI logo" title="MAI">
        <span className="absolute -inset-2 rounded-full bg-cyan-300/15 blur-lg" />
        <ZerosOrb size={size} />
      </div>
    );
  }

  if (character === "IRON-MAN") {
    return (
      <Shell size={size} label="Iron Man" className="border-red-300/35 bg-[linear-gradient(145deg,#2a0505,#160b0b_48%,#4b1111)] text-amber-200 shadow-[0_0_35px_rgba(248,113,113,.25)]">
        <svg width={size * .72} height={size * .72} viewBox="0 0 100 100" fill="none" aria-hidden>
          <defs>
            <linearGradient id="ironGold" x1="10" y1="10" x2="90" y2="90">
              <stop stopColor="#fff4b0"/><stop offset=".45" stopColor="#f5b942"/><stop offset="1" stopColor="#8a4d08"/>
            </linearGradient>
          </defs>
          <path d="M50 8 73 15 87 35 82 65 62 88 50 94 38 88 18 65 13 35 27 15Z" stroke="url(#ironGold)" strokeWidth="6" strokeLinejoin="round"/>
          <path d="M50 20 68 27 76 42 68 68 50 80 32 68 24 42 32 27Z" fill="rgba(255,255,255,.06)" stroke="url(#ironGold)" strokeWidth="3"/>
          <path d="M50 32v36M32 50h36" stroke="#fff7cf" strokeWidth="4" strokeLinecap="round"/>
          <circle cx="50" cy="50" r="8" fill="#fff9db" stroke="#f5b942" strokeWidth="3"/>
        </svg>
      </Shell>
    );
  }

  if (character === "THOR") {
    return (
      <Shell size={size} label="Thor" className="border-sky-200/35 bg-[linear-gradient(145deg,#07182c,#0b2846_52%,#0a4a72)] text-sky-100 shadow-[0_0_35px_rgba(56,189,248,.24)]">
        <svg width={size * .72} height={size * .72} viewBox="0 0 100 100" fill="none" aria-hidden>
          <defs>
            <linearGradient id="thorSilver" x1="15" y1="15" x2="80" y2="85">
              <stop stopColor="#ffffff"/><stop offset=".5" stopColor="#9edfff"/><stop offset="1" stopColor="#4d7fa3"/>
            </linearGradient>
          </defs>
          <path d="M30 13h40l11 13-7 25H57l-5 36h-9l5-36H26l-7-25Z" fill="url(#thorSilver)" stroke="#d8f5ff" strokeWidth="3" strokeLinejoin="round"/>
          <path d="M24 30h52M50 51l-8 9" stroke="#4b7190" strokeWidth="3"/>
          <path d="M20 19 13 11M78 19l9-8M74 69l10 10M26 69 16 79" stroke="#b9efff" strokeWidth="4" strokeLinecap="round"/>
        </svg>
      </Shell>
    );
  }

  return (
    <Shell size={size} label="Spider-Man" className="border-rose-300/35 bg-[linear-gradient(145deg,#26050b,#13070b_48%,#5d0d18)] text-rose-100 shadow-[0_0_35px_rgba(244,63,94,.25)]">
      <svg width={size * .72} height={size * .72} viewBox="0 0 100 100" fill="none" aria-hidden>
        <circle cx="50" cy="50" r="39" fill="rgba(8,10,18,.38)" stroke="#ff506b" strokeWidth="4"/>
        <path d="M50 11v78M11 50h78M22 22l56 56M78 22 22 78" stroke="#ffb1bd" strokeWidth="2.6" opacity=".9"/>
        <path d="M50 18c-8 12-12 22-12 32s4 20 12 32c8-12 12-22 12-32s-4-20-12-32Z" stroke="#fff" strokeWidth="3" opacity=".9"/>
        <path d="M25 33c8 5 14 8 25 8s17-3 25-8M18 69c10-5 20-8 32-8s22 3 32 8" stroke="#ff506b" strokeWidth="2.5" opacity=".85"/>
        <path d="M38 45c5-3 9-4 12-4M62 45c-5-3-9-4-12-4" stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
      </svg>
    </Shell>
  );
}
