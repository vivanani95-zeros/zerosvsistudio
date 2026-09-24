import { useEffect, useRef, useState } from "react";
import type { ZeroMode } from "@/lib/zeros";

type Props = {
  mode?: ZeroMode;
  /** Live status line from the actual request pipeline (preferred). */
  status?: string | null;
  /** Only true while Zeros is generating a response. */
  active?: boolean;
};

/**
 * Claude-style thinking indicator:
 * - Renders NOTHING unless `active` is true (user sent a message and Zeros is working)
 * - No fixed checklist — shows the live status from the pipeline, streaming character by character
 * - Soft fallback phrases only when no status is provided yet
 */
export default function ThinkingTrace({ status, active = false }: Props) {
  const [display, setDisplay] = useState("");
  const [pulse, setPulse] = useState(0);
  const rafRef = useRef(0);

  const ambient = ["Working on it…", "Putting the pieces together…", "Almost there…"];

  useEffect(() => {
    if (!active) {
      setDisplay("");
      return;
    }

    const target = (status && status.trim()) || ambient[pulse % ambient.length]!;

    let i = 0;
    setDisplay("");
    const tick = () => {
      i += 1;
      setDisplay(target.slice(0, i));
      if (i < target.length) {
        rafRef.current = window.setTimeout(tick, 12 + Math.random() * 18) as unknown as number;
      }
    };
    rafRef.current = window.setTimeout(tick, 20) as unknown as number;

    return () => {
      window.clearTimeout(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, status, pulse]);

  useEffect(() => {
    if (!active || (status && status.trim())) return;
    const id = window.setInterval(() => setPulse((p) => p + 1), 2800);
    return () => window.clearInterval(id);
  }, [active, status]);

  // CRITICAL: never show thinking UI when Zeros is idle.
  if (!active) return null;

  return (
    <div className="zeros-thinking-trace" role="status" aria-live="polite" aria-label="Zeros is thinking">
      <div className="zeros-thinking">
        <span className="zeros-thinking-orb" aria-hidden="true" />
        <span className="zeros-thinking-label">Thinking</span>
        <span className="zeros-thinking-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>
      <p className="zeros-thinking-stream">
        {display}
        <span className="zeros-thinking-caret" aria-hidden="true" />
      </p>
    </div>
  );
}
