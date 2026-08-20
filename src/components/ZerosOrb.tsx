export default function ZerosOrb({ size = 40 }: { size?: number }) {
  return (
    <span
      className="relative inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background:
          "conic-gradient(from 200deg, oklch(0.88 0.16 180), oklch(0.85 0.19 160), oklch(0.9 0.15 110), oklch(0.88 0.16 180))",
        boxShadow: "0 0 40px oklch(0.85 0.17 175 / 45%)",
      }}
      aria-hidden
    >
      <span
        className="absolute rounded-full"
        style={{
          inset: size * 0.28,
          background: "oklch(0.12 0.02 200)",
        }}
      />
      <span
        className="absolute rounded-full bg-white/70 blur-[3px]"
        style={{ width: size * 0.16, height: size * 0.16, top: size * 0.12, left: size * 0.3 }}
      />
    </span>
  );
}
