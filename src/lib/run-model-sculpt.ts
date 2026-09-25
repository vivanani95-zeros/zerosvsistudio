import {
  buildUnderstandMessage,
  buildPlanMessage,
  buildSculptMessage,
  parseAndRefineSculpt,
} from "@/lib/model-prompt";
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

  if (comps.length < 10) {
    issues.push(`too few parts (${comps.length})`);
    score -= 40;
  }

  const shapes = new Set(comps.map((c) => c.shape));
  if (shapes.size === 1) {
    issues.push("only one shape type — fused blob");
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
  brief: string,
  plan: string,
): string {
  const category = detectCategory(`${prompt} ${spec.name}`);
  return `You are the production supervisor for Zeros 3D Studio (Manus→Gemini→Groq chain).

USER REQUEST: ${prompt}
CATEGORY: ${category}

BRIEF:
${brief.slice(0, 1500)}

PLAN:
${plan.slice(0, 1500)}

CURRENT SCULPT:
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
${issues.map((i) => "- " + i).join("\n") || "- below production silhouette"}

Return ONLY a complete ParticleSculptSpec JSON (no markdown).
Rules:
- virtualParticles: 3000000, detail: 1.0
- 24–56 named components with MIXED shapes
- Y=0 is the floor
- Vehicles: body + 4 tires OUTSIDE body width + rims + lights mandatory
- Characters: head + torso + arms + legs + feet mandatory
- NEVER only boxes. NEVER a single ellipsoid for a complex object`;
}

/**
 * Full AI multi-stage pipeline (Manus → Gemini → Groq via /api/chat mode=model):
 * 1) UNDERSTAND the request deeply
 * 2) PLAN every part
 * 3) SCULPT density fields (3,000,000 virtual particles)
 * 4) Structural QA + supervisor fix
 * 5) Studio lock for weak outputs
 */
export async function runModelSculpt(
  prompt: string,
  streamChat: StreamFn,
  onStatus?: (s: string) => void,
): Promise<ParticleSculptSpec> {
  let brief = "";
  let plan = "";
  let best: ParticleSculptSpec | null = null;
  let bestScore = -1;

  // ── Stage 1: UNDERSTAND ──────────────────────────────────────────
  onStatus?.("1/5 Understanding request (AI)…");
  try {
    brief = await streamChat(
      [{ role: "user", content: buildUnderstandMessage(prompt) }],
      "model",
      [],
      () => {},
    );
  } catch {
    brief = `Object: ${prompt}. Infer category from keywords. Production design.`;
  }

  // ── Stage 2: PLAN ────────────────────────────────────────────────
  onStatus?.("2/5 Planning hierarchy (AI)…");
  try {
    plan = await streamChat(
      [{ role: "user", content: buildPlanMessage(prompt, brief) }],
      "model",
      [],
      () => {},
    );
  } catch {
    plan = "Use full multi-part hierarchy for the detected category.";
  }

  // ── Stage 3: SCULPT (up to 2 attempts + supervisor) ──────────────
  for (let attempt = 0; attempt < 2; attempt += 1) {
    onStatus?.(attempt === 0 ? "3/5 Sculpting density fields (3M particles)…" : "3/5 Resculpting with corrections…");
    try {
      const sculptText = await streamChat(
        [{ role: "user", content: buildSculptMessage(prompt, brief, plan, attempt) }],
        "model",
        [],
        () => {},
      );
      const refined = parseAndRefineSculpt(sculptText, prompt);
      if (!refined) continue;

      const qa = structuralQA(refined, prompt);
      if (qa.score > bestScore) {
        best = refined;
        bestScore = qa.score;
      }
      if (qa.ok) break;

      // Supervisor correction via same AI chain
      onStatus?.("4/5 Supervisor correcting form…");
      try {
        const critique = await streamChat(
          [
            {
              role: "user",
              content: buildSupervisorCritique(prompt, refined, qa.issues, brief, plan),
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

  // ── Stage 5: LOCK ────────────────────────────────────────────────
  onStatus?.("5/5 Locking production mesh…");
  return forceStudioSculpt(best, prompt);
}
