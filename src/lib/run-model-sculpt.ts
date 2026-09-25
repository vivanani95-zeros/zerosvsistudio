import { buildModelSculptUserMessage, parseAndRefineSculpt } from "@/lib/model-prompt";
import { detectCategory, type ParticleSculptSpec } from "@/lib/particle-model";
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
  const category = detectCategory(`${prompt} ${spec.name}`);
  const comps = spec.components;
  const issues: string[] = [];
  let score = 100;

  if (comps.length < 8) {
    issues.push(`too few parts (${comps.length})`);
    score -= 40;
  }

  const shapes = new Set(comps.map((c) => c.shape));
  if (shapes.size === 1) {
    issues.push("only one shape type — looks like a fused blob");
    score -= 35;
  }

  const boxes = comps.filter((c) => c.shape === "box" || c.shape === "rounded-box");
  if (boxes.length === comps.length && comps.length >= 2) {
    issues.push("all boxes — slab stack");
    score -= 45;
  }

  if (category === "vehicle" || category === "motorcycle") {
    const hasTire = comps.some((c) => /tire|wheel/i.test(c.name ?? "") || c.shape === "torus");
    if (!hasTire) {
      issues.push("missing ground wheels/tires");
      score -= 40;
    }
    if (comps.length < 16) {
      issues.push(`vehicle needs richer hierarchy (has ${comps.length})`);
      score -= 20;
    }
  }

  if (category === "character") {
    const hasHead = comps.some((c) => /head/i.test(c.name ?? ""));
    const hasLimb = comps.some((c) => /arm|leg|thigh|calf|hand|foot/i.test(c.name ?? ""));
    if (!hasHead || !hasLimb) {
      issues.push("character missing head or limbs");
      score -= 35;
    }
  }

  if (category === "animal") {
    const hasLeg = comps.some((c) => /leg|paw|wing/i.test(c.name ?? ""));
    if (!hasLeg) {
      issues.push("creature missing legs/wings");
      score -= 25;
    }
  }

  // Penalize extreme aspect: all parts stacked on Y with near-zero X/Z spread
  let maxX = 0, maxZ = 0;
  for (const c of comps) {
    maxX = Math.max(maxX, Math.abs(c.position[0]) + c.scale[0]);
    maxZ = Math.max(maxZ, Math.abs(c.position[2]) + c.scale[2]);
  }
  if (maxX < 0.25 && maxZ < 0.25 && comps.length > 3) {
    issues.push("parts collapsed on a vertical stick");
    score -= 30;
  }

  return { ok: score >= 55, score, issues };
}

function buildSupervisorCritique(
  prompt: string,
  spec: ParticleSculptSpec,
  issues: string[],
  referenceHint: string,
): string {
  const category = detectCategory(`${prompt} ${spec.name}`);
  return `You are the production supervisor for Zeros 3D Studio.

USER REQUEST: ${prompt}
CATEGORY: ${category}
REFERENCE: ${referenceHint}

CURRENT SCULPT SUMMARY:
${JSON.stringify({
    name: spec.name,
    count: spec.components.length,
    parts: spec.components.slice(0, 40).map((c) => ({
      name: c.name,
      shape: c.shape,
      position: c.position,
      scale: c.scale,
    })),
  })}

FAILURES:
${issues.map((i) => "- " + i).join("\n") || "- below movie-level silhouette"}

Return ONLY a complete ParticleSculptSpec JSON (no markdown).
Rules:
- virtualParticles: 50000000, detail: 0.95–1.0
- 24–56 named components with MIXED shapes
- Y=0 is the floor — resting contact must touch ground
- Vehicles/motorcycles: body + 4 (or 2) ground tires/wheels mandatory, wheels OUTSIDE the body width
- Characters: head + torso + arms + legs + feet mandatory
- Animals: torso + head + 4 legs (or wings) + tail
- NEVER only boxes stacked in Y. NEVER a single ellipsoid for a complex object
- Materials must vary (paint vs rubber vs metal vs glass)`;
}

function buildReferenceBrief(prompt: string): string {
  return `Photorealistic studio product shot of: ${prompt}. Three-quarter angle, sharp silhouette, production design, clean lighting, high detail, no text, no watermark.`;
}

/**
 * Full 3D pipeline for every object type.
 * AI attempts → structural QA → supervisor fix → forceStudio gate.
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
              "\n\nVISUAL REFERENCE INTENT:\n" +
              referenceHint,
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
  return forceStudioSculpt(best, prompt);
}
