import { useEffect, useState } from "react";
import type { ZeroMode } from "@/lib/zeros";

const PLANS: Record<ZeroMode | "default", string[]> = {
  chat: [
    "Reading your message",
    "Pulling the useful angle",
    "Drafting a sharp answer",
    "Adding the witty polish",
  ],
  search: [
    "Planning the search query",
    "Scanning live sources",
    "Cross-checking dates and claims",
    "Writing the cited answer",
  ],
  image: [
    "Locking the composition",
    "Setting light and materials",
    "Rendering the frame",
    "Packing the download",
  ],
  model: [
    "Reading the object brief",
    "Planning primary mass",
    "Laying secondary forms",
    "Adding tertiary detail fields",
    "Assigning materials",
    "Reconstructing the surface",
  ],
  music: [
    "Choosing the emotional lane",
    "Building chords and groove",
    "Writing the hook and lyrics",
    "Arranging the full song",
  ],
  web: [
    "Mapping the product pages",
    "Designing the layout system",
    "Wiring navigation and buttons",
    "Writing production HTML/CSS/JS",
  ],
  default: [
    "Thinking",
    "Working through the steps",
    "Putting the answer together",
  ],
};

type Props = {
  mode?: ZeroMode;
  status?: string | null;
  active?: boolean;
};

/** Visible step-by-step plan so the user always sees Zeros working. */
export default function ThinkingTrace({ mode = "chat", status, active = true }: Props) {
  const steps = PLANS[mode] ?? PLANS.default;
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!active) return;
    setStep(0);
    const id = window.setInterval(() => {
      setStep((s) => (s + 1) % steps.length);
    }, 2200);
    return () => window.clearInterval(id);
  }, [active, mode, steps.length]);

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
      <ol className="zeros-thinking-steps">
        {steps.map((label, i) => {
          const state = i < step ? "done" : i === step ? "active" : "todo";
          return (
            <li key={label} data-state={state}>
              <span className="zeros-thinking-bullet" aria-hidden="true" />
              <span>{label}</span>
            </li>
          );
        })}
      </ol>
      {status && <p className="zeros-thinking-status">{status}</p>}
    </div>
  );
}
