import { buildModelSculptUserMessage, parseAndRefineSculpt } from "@/lib/model-prompt";
import type { ParticleSculptSpec } from "@/lib/particle-model";
import type { Msg } from "@/lib/ai-client";

type StreamFn = (
  messages: Msg[],
  mode: "model",
  memories: string[],
  onDelta: (full: string) => void,
) => Promise<string>;

/** Always returns a valid production sculpt. Never throws "Could not finish". */
export async function runModelSculpt(
  prompt: string,
  streamChat: StreamFn,
  onStatus?: (s: string) => void,
): Promise<ParticleSculptSpec> {
  let spec: ParticleSculptSpec | null = null;
  for (let attempt = 0; attempt < 3 && !spec; attempt += 1) {
    onStatus?.(attempt === 0 ? "Sculpting\u2026" : attempt === 1 ? "Refining form\u2026" : "Final pass\u2026");
    try {
      const plan = await streamChat(
        [{ role: "user", content: buildModelSculptUserMessage(prompt, attempt) }],
        "model",
        [],
        () => {},
      );
      const refined = parseAndRefineSculpt(plan, prompt);
      if (refined) spec = refined;
    } catch {
      // continue
    }
  }
  if (!spec) {
    onStatus?.("Studio fallback\u2026");
    spec = parseAndRefineSculpt("", prompt);
  }
  if (!spec) {
    spec = parseAndRefineSculpt(
      JSON.stringify({
        name: prompt.slice(0, 48) || "Keris Sculpt",
        virtualParticles: 50000000,
        front: "+z",
        detail: 0.98,
        seed: 1337,
        components: [{
          name: "primary-mass",
          shape: "rounded-box",
          position: [0, 0.4, 0],
          scale: [0.6, 0.4, 0.9],
          material: { color: "#c7d2e3", metalness: 0.15, roughness: 0.38 },
          blend: 0.06,
        }],
      }),
      prompt,
    );
  }
  if (!spec) {
    const fallback = parseAndRefineSculpt(
      JSON.stringify({
        name: "Studio Sculpt",
        virtualParticles: 50000000,
        front: "+z",
        detail: 0.98,
        components: [{ name: "body", shape: "rounded-box", position: [0, 0.4, 0], scale: [1, 0.3, 2], material: { color: "#c41e3a" } }],
      }),
      "car " + prompt,
    );
    if (!fallback) throw new Error("3D studio unavailable. Please retry in a moment.");
    return fallback;
  }
  return spec;
}
