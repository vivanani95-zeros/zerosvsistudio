import type { ZeroMode } from "@/lib/zeros";

type Props = {
  mode?: ZeroMode;
  status?: string | null;
  /** Only true while a response is being generated. Never show when idle. */
  active?: boolean;
};

/**
 * Exact thinking indicator: spinning orb + THINKING + cyan dots + live status.
 * Inline colors guarantee visibility over the tunnel background.
 */
export default function ThinkingTrace({ active = false, status }: Props) {
  if (!active) return null;

  return (
    <div
      className="zeros-thinking"
      role="status"
      aria-live="polite"
      aria-label={status || "Thinking"}
      style={{ color: "#f4f7ff" }}
    >
      <span className="zeros-thinking-orb" aria-hidden="true" />
      <span className="zeros-thinking-label" style={{ color: "transparent" }}>
        Thinking
      </span>
      <span className="zeros-thinking-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {status ? (
        <span
          className="zeros-thinking-status"
          style={{ color: "#a8e8d8", marginLeft: "0.35rem", fontSize: "0.75rem" }}
        >
          {status}
        </span>
      ) : null}
    </div>
  );
}
