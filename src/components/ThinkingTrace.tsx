import type { ZeroMode } from "@/lib/zeros";

type Props = {
  mode?: ZeroMode;
  status?: string | null;
  /** Only true while a response is being generated. Never show when idle. */
  active?: boolean;
};

/**
 * Thinking indicator: spinning orb + THINKING + cyan dots + live status.
 * Inline styles so it stays visible over the tunnel background.
 */
export default function ThinkingTrace({ active = false, status }: Props) {
  if (!active) return null;

  return (
    <div
      className="zeros-thinking flex items-center gap-2"
      role="status"
      aria-live="polite"
      aria-label={status || "Thinking"}
      style={{ color: "#f4f7ff" }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: "radial-gradient(circle at 30% 30%, #7ef9d8, #22d3ee 45%, #6366f1 100%)",
          boxShadow: "0 0 12px rgba(34,211,238,0.7)",
          animation: "zeros-spin 1.1s linear infinite",
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          background: "linear-gradient(90deg,#e0e7ff,#67e8f9,#c4b5fd)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        Thinking
      </span>
      <span aria-hidden="true" className="flex items-center gap-1" style={{ marginLeft: 2 }}>
        {[0, 1, 2].map((i) => (
          <i
            key={i}
            style={{
              display: "inline-block",
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "#67e8f9",
              opacity: 0.35,
              animation: `zeros-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </span>
      {status ? (
        <span style={{ color: "#a8e8d8", marginLeft: 6, fontSize: 12, fontWeight: 500 }}>
          {status}
        </span>
      ) : null}
      <style>{`
        @keyframes zeros-spin { to { transform: rotate(360deg); } }
        @keyframes zeros-dot {
          0%, 80%, 100% { opacity: 0.25; transform: scale(0.85); }
          40% { opacity: 1; transform: scale(1.15); }
        }
      `}</style>
    </div>
  );
}
