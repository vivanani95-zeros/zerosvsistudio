import type { ZeroMode } from "@/lib/zeros";

type Props = {
  mode?: ZeroMode;
  status?: string | null;
  /** Only true while a response is being generated. Never show when idle. */
  active?: boolean;
};

/**
 * Exact original thinking indicator (matches product screenshots):
 * - Renders NOTHING unless `active`
 * - Compact: spinning orb + THINKING label + cyan dots
 * - No fixed checklist, no always-on UI
 */
export default function ThinkingTrace({ active = false }: Props) {
  if (!active) return null;

  return (
    <div className="zeros-thinking" role="status" aria-live="polite" aria-label="Thinking">
      <span className="zeros-thinking-orb" aria-hidden="true" />
      <span className="zeros-thinking-label">Thinking</span>
      <span className="zeros-thinking-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}
