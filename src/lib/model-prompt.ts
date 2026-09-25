import {
  extractJsonObject,
  normalizeParticleSculptSpec,
  refineParticleSculptSpec,
  DEFAULT_VIRTUAL_PARTICLES,
  type ParticleSculptSpec,
} from "@/lib/particle-model";
import { extractBlock } from "@/lib/zeros";

/** Stage 1 — deep understanding of the user request */
export function buildUnderstandMessage(userPrompt: string): string {
  return `You are Zeros MMI — senior industrial designer + 3D technical director.

USER REQUEST:
"""${userPrompt.trim()}"""

TASK: UNDERSTAND (do not sculpt yet).
Write a precise design brief covering:
1) Object identity (what exactly is being built)
2) Category (vehicle / character / product / animal / furniture / architecture / other)
3) Style (sports, realistic, stylized, hard-surface, organic…)
4) Key silhouette features visible from a 3/4 view
5) Material language (paint, rubber, glass, metal, fabric…)
6) Proportions (length vs height vs width ratios)
7) Ground contact points
8) Color intent

Be specific. No JSON. No code. Plain design brief only.`;
}

/** Stage 2 — detailed part plan before JSON */
export function buildPlanMessage(userPrompt: string, brief: string): string {
  return `You are Zeros MMI production supervisor.

USER REQUEST: ${userPrompt.trim()}

DESIGN BRIEF:
${brief.slice(0, 4000)}

TASK: PLAN the multi-part hierarchy before sculpting.
List every named part that must exist, with:
- part name
- shape family (ellipsoid / torus / capsule / cylinder / rounded-box / cone / sphere / box)
- approximate position and relative scale
- material (color + metalness + roughness intent)
- whether it touches the ground (Y≈0)

Rules:
- Vehicles: body + cabin + 4 tires OUTSIDE body + 4 rims + lights + bumpers minimum
- Characters: head + torso + arms + legs + feet
- Never fuse wheels into the body
- 24–48 parts for complex objects

Output a clear numbered part list. No JSON yet.`;
}

/** Stage 3 — full density-field sculpt JSON */
export function buildSculptMessage(
  userPrompt: string,
  brief: string,
  plan: string,
  attempt: number,
): string {
  const core = userPrompt.trim();
  const context = `BRIEF:\n${brief.slice(0, 2500)}\n\nPART PLAN:\n${plan.slice(0, 3500)}`;

  if (attempt === 0) {
    return `${core}

ZEROS LOCAL 3D STUDIO — AI multi-stage production sculpt
3,000,000 virtual particles · density fields · PBR · clean-topology .glb

You already UNDERSTOOD and PLANNED. Now SCULPT.

${context}

You are a senior hard-surface + character sculptor (Blender + Three.js CSG).
Output ONE complete constructive solid geometry brief as JSON.

RULES:
1) Follow the part plan exactly — every planned part becomes a named component
2) Y=0 is the floor. Resting contact touches Y≈0
3) Every distinct part = SEPARATE component. Never fuse wheels into body
4) MIX shapes (ellipsoid, torus, capsule, cylinder, rounded-box). Never only boxes
5) Materials vary by part (paint vs rubber vs metal vs glass)
6) Hard-surface blend 0.02–0.10. Soft organic 0.08–0.16
7) detail 1.0. virtualParticles ALWAYS 3000000
8) 24–56 components for complex objects
9) Vehicles: 4 tires with X outside body half-width (mandatory)

OUTPUT — ONLY one JSON object. No markdown fences. No prose.
{
  "name": string,
  "virtualParticles": 3000000,
  "front": "+z",
  "detail": 1.0,
  "seed": integer,
  "components": [
    {
      "name": string,
      "shape": "sphere" | "ellipsoid" | "box" | "rounded-box" | "capsule" | "cylinder" | "torus" | "cone",
      "position": [x,y,z],
      "scale": [x,y,z],
      "rotation": [x,y,z],
      "material": { "color": "#rrggbb", "metalness": 0-1, "roughness": 0-1 },
      "blend": 0-0.2
    }
  ]
}`;
  }

  if (attempt === 1) {
    return `${core}

RETRY sculpt — previous JSON was incomplete or blob-like.
${context}

Return ONLY valid JSON. virtualParticles: 3000000, detail: 1.0, 24–56 named parts.
Vehicles need 4 ground tires OUTSIDE body. Characters need limbs. Mix shapes.`;
  }

  return `${core}

FINAL sculpt attempt.
Return ONLY JSON: virtualParticles 3000000, detail 1.0, 20–48 named components.
Separate major parts. No markdown.`;
}

export function parseAndRefineSculpt(plan: string, userPrompt?: string): ParticleSculptSpec | null {
  const normalized =
    normalizeParticleSculptSpec(plan) ??
    normalizeParticleSculptSpec(extractBlock(plan, "json")) ??
    normalizeParticleSculptSpec(extractJsonObject(plan));

  if (normalized) {
    return refineParticleSculptSpec(
      {
        ...normalized,
        virtualParticles: DEFAULT_VIRTUAL_PARTICLES,
        detail: Math.max(0.98, normalized.detail ?? 1),
      },
      userPrompt,
    );
  }

  if (userPrompt && userPrompt.trim()) {
    const seed: ParticleSculptSpec = {
      name: userPrompt.trim().slice(0, 48) || "Zeros Sculpt",
      virtualParticles: DEFAULT_VIRTUAL_PARTICLES,
      front: "+z",
      detail: 1,
      seed: 1337,
      components: [
        {
          name: "primary-mass",
          shape: "ellipsoid",
          position: [0, 0.4, 0],
          scale: [0.5, 0.35, 0.7],
          material: { color: "#e11d48", metalness: 0.15, roughness: 0.38 },
          blend: 0.08,
        },
      ],
    };
    return refineParticleSculptSpec(seed, userPrompt);
  }

  return null;
}

/** Legacy single-shot message (kept for fallbacks) */
export function buildModelSculptUserMessage(userPrompt: string, attempt: number): string {
  return buildSculptMessage(userPrompt, "", "", attempt);
}
