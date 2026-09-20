import React from "react";
import ironManLogo from "../../Background/IronMan.jpg";
import spiderManLogo from "../../Background/SpiderMan.jpg";
import thorLogo from "../../Background/Thor.jpg";
import maiLogo from "../../Background/Mai.jpg";

export type MaiCharacter = "SPIDER-MAN" | "IRON-MAN" | "THOR" | "MAI";

const LOGOS: Record<MaiCharacter, string> = {
  "SPIDER-MAN": spiderManLogo,
  "IRON-MAN": ironManLogo,
  "THOR": thorLogo,
  "MAI": maiLogo,
};

const LABELS: Record<MaiCharacter, string> = {
  "SPIDER-MAN": "Spider-Man",
  "IRON-MAN": "Iron Man",
  "THOR": "Thor",
  "MAI": "MAI",
};

export default function MaiCharacterLogo({ character, size = 48 }: { character: MaiCharacter; size?: number }) {
  return (
    <div
      className="relative shrink-0 rounded-full"
      style={{ width: size, height: size }}
      aria-label={LABELS[character]}
      title={LABELS[character]}
    >
      <span className="absolute -inset-1 rounded-full bg-white/10 blur-md" />
      <span className="absolute inset-0 overflow-hidden rounded-full border border-white/20 bg-black/50 shadow-[0_0_28px_rgba(255,255,255,.12)]">
        <img
          src={LOGOS[character]}
          alt={LABELS[character]}
          className="h-full w-full rounded-full object-cover"
          draggable={false}
        />
      </span>
    </div>
  );
}
