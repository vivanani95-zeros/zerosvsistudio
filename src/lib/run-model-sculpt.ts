import { buildModelSculptUserMessage, parseAndRefineSculpt } from "@/lib/model-prompt";
import { type ParticleSculptSpec } from "@/lib/particle-model";
import { forceStudioSculpt } from "@/lib/force-studio-sculpt";
import type { Msg } from "@/lib/ai-client";

type StreamFn = (
  messages: Msg[],
  mode: "model",
  memories: string[],
  onDelta: (full: string) => void,
) => Promise<string>;

function structuralQA(
  spec: ParticleSculptSpec,
  prompt: string,
): { ok: boolean; score: number; issues: string[] } {
  const text = `${prompt} ${spec.name}`.toLowerCase();
  const isVehicle =
    /\b(car|vehicle|truck|suv|sedan|sports?\s*car|supercar|wheel|tire|bumper|hood|auto|race\s*car|motorcycle|bike)\b/.test(
      text,
    );
  const isCharacter =
    /\b(person|human|character|robot|man|woman|figure|humanoid|android|soldier|hero)\b/.test(text);
  const comps = spec.components;
  const issues: string[] = [];
  let score = 100;

  if (comps.length < 8) {
    issues.push(`too few parts (${comps.length})`);
    score -= 40;
  }

  const shapes = new Set(comps.map((c) => c.shape));
  if (shapes.size === 1 && (shapes.has("box") || shapes.has("rounded-box"))) {
    issues.push("all parts are boxes — looks like stacked slabs");
    score -= 50;
  }

  const boxes = comps.filter((c) => c.shape === "box" || c.shape === "rounded-box");
  if (boxes.length >= 2 && boxes.length === comps.length) {
    issues.push("vertical box stack — not a real object hierarchy");
    score -= 45;
  }

  if (isVehicle) {
    const hasTire = comps.some(
      (c) => /tire|wheel/i.test(c.name ?? "") || c.shape === "torus",
    );
    if (!hasTire) {
      issues.push("vehicle missing ground tires");
      score -= 35;
    }
    if (comps.length < 20) {
      issues.push(`vehicle needs 20+ parts (has ${comps.length})`);
      score -= 25;
    }
  }

  if (isCharacter) {
    const hasHead = comps.some((c) => /head/i.test(c.name ?? ""));
    const hasLimb = comps.some((c) => /arm|leg|thigh|calf|hand|foot/i.test(c.name ?? ""));
    if (!hasHead || !hasLimb) {
      issues.push("character missing head or limbs");
      score -= 30;
    }
  }

  return { ok: score >= 55, score, issues };
}

function buildSupervisorCritique(
  prompt: string,
  spec: ParticleSculptSpec,
  issues: string[],
  referenceHint: string,
): string {
  return `You are the production supervisor for Zeros 3D Studio (Manus / Gemini / Groq critique chain).

USER REQUEST: ${prompt}

REFERENCE INTENT: ${referenceHint}

CURRENT SCULPT:
${JSON.stringify({
    name: spec.name,
    componentCount: spec.components.length,
    components: spec.components.map((c) => ({
      name: c.name,
      shape: c.shape,
      position: c.position,
      scale: c.scale,
    })),
  })}

FAILURES:
${issues.map((i) => `- ${i}`).join("\n") || "- quality below movie level"}

Return ONLY a complete ParticleSculptSpec JSON (no markdown).
- virtualParticles: 50000000, detail: 0.98–1.0
- 32–64 named components
- Vehicles: body + cabin + 4 tire TORI + 4 rims + bumpers + lights mandatory
- Characters: head + torso + limbs mandatory
- NEVER only boxes stacked in Y
- Mix shapes; Y=0 is floor`;
}

function buildReferenceBrief(prompt: string): string {
  return `Photorealistic studio shot of: ${prompt}. Three-quarter angle, clean lighting, sharp silhouette, production design, high detail, no text.`;
}

/**
 * Peak 3D pipeline — always ends with forceStudioSculpt so slab stacks never ship.
 */
export async function runModelSculpt(
  prompt: string,
  streamChat: StreamFn,
  onStatus?: (s: string) => void,
): Promise<ParticleSculptSpec> {
  const referenceHint = buildReferenceBrief(prompt);
  let best: ParticleSculptSpec | null = null;
  let bestScore = -1;

  onStatus?.("Concept reference…");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    onStatus?.(attempt === 0 ? "Sculpting hierarchy…" : "AI supervisor refining…");
    try {
      const plan = await streamChat(
        [
          {
            role: "user",
            content:
              buildModelSculptUserMessage(prompt, attempt) +
              `\n\nVISUAL REFERENCE INTENT:\n${referenceHint}`,
          },
        ],
        "model",
        [],
        () => {},
      );
      const refined = parseAndRefineSculpt(plan, prompt);
      if (!refined) continue;

      const qa = structuralQA(refined, prompt);
      if (qa.score > bestScore) {
        best = refined;
        bestScore = qa.score;
      }
      if (qa.ok) break;

      onStatus?.("Supervisor correcting form…");
      try {
        const critique = await streamChat(
          [
            {
              role: "user",
              content: buildSupervisorCritique(prompt, refined, qa.issues, referenceHint),
            },
          ],
          "model",
          [],
          () => {},
        );
        const fixed = parseAndRefineSculpt(critique, prompt);
        if (fixed) {
          const qa2 = structuralQA(fixed, prompt);
          if (qa2.score > bestScore) {
            best = fixed;
            bestScore = qa2.score;
          }
          if (qa2.ok) break;
        }
      } catch {
        /* keep best */
      }
    } catch {
      /* next attempt */
    }
  }

  onStatus?.("Locking production mesh…");
  // GUARANTEE: never return slabs — force full studio hierarchy for the prompt category
  return forceStudioSculpt(best, prompt);
}
