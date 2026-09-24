import {
  extractJsonObject,
  normalizeParticleSculptSpec,
  refineParticleSculptSpec,
  type ParticleSculptSpec,
} from "@/lib/particle-model";
import { extractBlock } from "@/lib/zeros";

/**
 * Premium Meshy-class sculpt user prompts.
 * Forces silhouette → primary mass → secondary parts → tertiary detail
 * with category-specific part lists so shapes read as real products, not fused blobs.
 */
export function buildModelSculptUserMessage(userPrompt: string, attempt: number): string {
  const core = userPrompt.trim();

  if (attempt === 0) {
    return `${core}

═══════════════════════════════════════════════════════════════
ZEROS PREMIUM SCULPT PIPELINE (Meshy-class · local · no external API)
═══════════════════════════════════════════════════════════════

You are a senior hard-surface + character sculptor. Build a PRODUCTION-READY density-field brief.

STEP 1 — UNDERSTAND
- Identify the object category (vehicle / character / animal / product / furniture / architecture / weapon / prop / organic).
- List every feature a human would expect to SEE from 3/4 view.

STEP 2 — BLOCKOUT (primary mass)
- Overall bounding box proportions must be realistic, not toy-like.
- Ground plane: Y=0 is the floor. Anything that rests on the ground must touch Y≈0.
- Center near origin. Front faces +Z unless the object naturally faces another way.

STEP 3 — PART HIERARCHY (secondary forms)
Use SEPARATE components for each distinct part. Never collapse a car into one ellipsoid.
Use 40–64 components for complex objects, 24–40 for medium, 16–28 for simple props.

CATEGORY BLUEPRINTS (follow the matching one):

▸ VEHICLE / CAR / TRUCK / MOTORCYCLE
  Body shell (elongated rounded-box or ellipsoid, low height), cabin/greenhouse (dark glass on top-middle),
  hood, rear deck/trunk, front bumper, rear bumper, 4× wheel assemblies at ground:
  each wheel = black rubber TORUS (tire) + metal CYLINDER (rim) at same center, Y so bottom of tire ≈ 0,
  wheel arches/fenders, side skirts, headlights (bright), taillights (red), side mirrors, optional spoiler/grille.
  Wheelbase must look real.

▸ CHARACTER / HUMANOID / ROBOT
  Head, neck, torso, pelvis, upper arms ×2, forearms ×2, hands ×2, thighs ×2, calves ×2, feet ×2.
  Optional helmet, visor, armor plates. Head ~1/7–1/8 of total height.

▸ ANIMAL / CREATURE
  Head, snout/muzzle, torso, hips, legs, tail, ears, eyes. Legs contact ground.

▸ PRODUCT / GADGET / PHONE / LAPTOP / CAMERA
  Main chassis (rounded-box), screen (dark glass thin box), buttons, ports, camera bumps.
  Sharp edges: blend 0.02–0.08.

▸ FURNITURE / CHAIR / TABLE
  Seat/top, legs (cylinders) touching Y=0, backrest, armrests, optional cushions.

▸ ARCHITECTURE / BUILDING
  Main volume, roof, recessed dark windows, door, steps.

▸ WEAPON / TOOL
  Handle/grip, barrel/blade, trigger, sight — clear silhouette.

STEP 4 — TERTIARY DETAIL
Small fields for seams, vents, panel lines, bezels, fasteners — never one giant blob.

STEP 5 — MATERIALS (vary by part)
- Paint: roughness 0.25–0.45, metalness 0.05–0.2
- Rubber/tire: #1a1a1a, roughness 0.85–0.95, metalness 0
- Metal/rim: metalness 0.7–1.0, roughness 0.12–0.3
- Glass: dark #0a1520–#1a2838, metalness 0.1–0.3, roughness 0.05–0.15

STEP 6 — BLEND & DETAIL
- blend 0.02–0.10 hard-surface (parts stay readable)
- blend 0.08–0.18 organic soft joins only
- detail 0.94–1.0 always
- virtualParticles: 1000000

OUTPUT RULES
- Return ONLY one complete JSON sculpt object (no markdown fences, no commentary).
- schema: { name, virtualParticles, front, detail, seed, components:[{name,shape,position,scale,rotation,material:{color,metalness,roughness},blend}] }
- shapes: sphere | ellipsoid | box | rounded-box | capsule | cylinder | torus | cone
- Name every component clearly (e.g. "front-left-tire", "cabin-glass").
- NO single-blob solutions. If you only output 1–5 big spheres, you FAILED.`;
  }

  if (attempt === 1) {
    return `${core}

RETRY — previous JSON was incomplete or blob-like.
Return ONLY one valid JSON sculpt object.
Requirements:
- virtualParticles 1000000, detail 0.95–1.0
- 36–56 named components with REAL part hierarchy for this object
- Vehicles: body + cabin + 4 tires (torus) + 4 rims (cylinder) on ground + lights + glass
- Characters: head + torso + limbs separately
- Hard-surface blend ≤ 0.1
- Varied materials (paint/rubber/metal/glass)
- No markdown fences, no prose.`;
  }

  return `${core}

FINAL ATTEMPT — keep it valid and readable.
Return ONLY one JSON object: virtualParticles 1000000, 28–48 components.
Preserve recognizable silhouette and separate major parts (never one ellipsoid).
detail 0.94, blend 0.03–0.12. No fences.`;
}

/** Parse model-provider text into a refined, viewer-ready sculpt spec. */
export function parseAndRefineSculpt(plan: string): ParticleSculptSpec | null {
  const normalized =
    normalizeParticleSculptSpec(plan) ??
    normalizeParticleSculptSpec(extractBlock(plan, "json")) ??
    normalizeParticleSculptSpec(extractJsonObject(plan));
  if (!normalized) return null;
  return refineParticleSculptSpec(normalized);
}
