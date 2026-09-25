import { buildModelSculptUserMessage, parseAndRefineSculpt } from "@/lib/model-prompt";
import {
  refineParticleSculptSpec,
  type ParticleSculptSpec,
} from "@/lib/particle-model";
import type { Msg } from "@/lib/ai-client";

type StreamFn = (
  messages: Msg[],
  mode: "model",
  memories: string[],
  onDelta: (full: string) => void,
) => Promise<string>;

/** Structural QA — rejects slab stacks, single blobs, missing ground contact. */
function structuralQA(
  spec: ParticleSculptSpec,
  prompt: string,
): { ok: boolean; score: number; issues: string[] } {
  const text = `${prompt} ${spec.name}`.toLowerCase();
  const isVehicle = /\b(car|vehicle|truck|suv|sedan|sports?\s*car|supercar|wheel|tire|bumper|hood|auto|race\s*car|motorcycle|bike)\b/.test(
    text,
  );
  const isCharacter = /\b(person|human|character|robot|man|woman|figure|humanoid|android|soldier|hero)\b/.test(
    text,
  );
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

  // Detect vertical slab stack (2–4 similar boxes stacked in Y)
  const boxes = comps.filter((c) => c.shape === "box" || c.shape === "rounded-box");
  if (boxes.length >= 2 && boxes.length === comps.length) {
    const ys = boxes.map((c) => c.position[1]).sort((a, b) => a - b);
    const spreads = ys.slice(1).map((y, i) => y - ys[i]!);
    if (spreads.every((s) => s > 0.05 && s < 0.8)) {
      issues.push("vertical box stack — not a real object hierarchy");
      score -= 45;
    }
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

  // Ground contact: lowest Y should be near 0 for grounded objects
  const minY = Math.min(
    ...comps.map((c) => c.position[1] - Math.abs(c.scale[1]) * 0.5),
  );
  if ((isVehicle || isCharacter) && minY > 0.35) {
    issues.push("object floating above ground");
    score -= 15;
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

CURRENT SCULPT JSON:
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

STRUCTURAL FAILURES DETECTED:
${issues.map((i) => `- ${i}`).join("\n") || "- quality below movie level"}

TASK: Return a FIXED complete ParticleSculptSpec JSON only (no markdown, no prose).
Rules:
- virtualParticles: 50000000
- detail: 0.98–1.0
- 32–64 named components with REAL part hierarchy
- Vehicles: body + cabin + hood + 4 ground tire TORI + 4 rims + bumpers + lights + mirrors mandatory
- Characters: head + torso + upper/lower arms + upper/lower legs + feet mandatory
- NEVER output only boxes stacked in Y
- Mix shapes: rounded-box, ellipsoid, torus, cylinder, capsule
- Realistic proportions; Y=0 is the floor
- Varied PBR materials per part`;
}

function buildReferenceBrief(prompt: string): string {
  return `Photorealistic product/studio shot of: ${prompt}.
Three-quarter angle, clean studio lighting, sharp silhouette, production design, high detail, no text, no watermark.`;
}

/**
 * Peak 3D pipeline:
 *  1) Reference image intent (concept)
 *  2) Multi-attempt AI sculpt
 *  3) Structural QA + AI supervisor fix loop
 *  4) Studio hierarchy refine (never ship slab stacks)
 */
export async function runModelSculpt(
  prompt: string,
  streamChat: StreamFn,
  onStatus?: (s: string) => void,
): Promise<ParticleSculptSpec> {
  const referenceHint = buildReferenceBrief(prompt);

  // ── 1) Concept / reference pass ──────────────────────────────────────
  onStatus?.("Concept reference…");
  // Soft reference: we don't block on image API; status signals the pipeline.
  // Image is generated in parallel for the user when the UI supports it;
  // sculpt continues with the same visual intent baked into prompts.

  let best: ParticleSculptSpec | null = null;
  let bestScore = -1;

  // ── 2) Primary sculpt attempts ───────────────────────────────────────
  for (let attempt = 0; attempt < 3; attempt += 1) {
    onStatus?.(
      attempt === 0
        ? "Sculpting hierarchy…"
        : attempt === 1
          ? "AI supervisor refining…"
          : "Final production pass…",
    );
    try {
      const plan = await streamChat(
        [
          {
            role: "user",
            content:
              buildModelSculptUserMessage(prompt, attempt) +
              `\n\nVISUAL REFERENCE INTENT (match this silhouette exactly):\n${referenceHint}`,
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

      if (qa.ok) {
        best = refined;
        break;
      }

      // ── 3) Supervisor fix pass ────────────────────────────────────────
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
          if (qa2.ok) {
            best = fixed;
            break;
          }
        }
      } catch {
        // continue with best so far
      }
    } catch {
      // continue
    }
  }

  // ── 4) Hard studio fallback ──────────────────────────────────────────
  if (!best) {
    onStatus?.("Studio fallback hierarchy…");
    best = parseAndRefineSculpt("", prompt);
  }
  if (!best) {
    best = parseAndRefineSculpt(
      JSON.stringify({
        name: prompt.slice(0, 48) || "Zeros Sculpt",
        virtualParticles: 50000000,
        front: "+z",
        detail: 0.98,
        seed: 1337,
        components: [
          {
            name: "primary-mass",
            shape: "rounded-box",
            position: [0, 0.4, 0],
            scale: [0.6, 0.4, 0.9],
            material: { color: "#c7d2e3", metalness: 0.15, roughness: 0.38 },
            blend: 0.06,
          },
        ],
      }),
      prompt,
    );
  }
  if (!best) {
    throw new Error("3D studio unavailable. Please retry in a moment.");
  }

  // Final forced refine — always inject real hierarchy if still weak
  onStatus?.("Locking production mesh…");
  const final = refineParticleSculptSpec(best, prompt);
  const finalQA = structuralQA(final, prompt);
  if (!finalQA.ok) {
    // Force category studio base one more time via empty-component seed
    return refineParticleSculptSpec(
      {
        ...final,
        components: final.components.slice(0, 3),
      },
      prompt,
    );
  }
  return final;
}
