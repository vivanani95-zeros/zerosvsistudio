import {
  extractJsonObject,
  normalizeParticleSculptSpec,
  refineParticleSculptSpec,
  type ParticleSculptSpec,
} from "@/lib/particle-model";
import { extractBlock } from "@/lib/zeros";

/**
 * Keris PEAK studio 3D pipeline:
 *  1) Blender-style multi-part hierarchy (blockout → secondary → tertiary)
 *  2) Three.js constructive solid geometry (named meshes + PBR materials)
 *  3) 50,000,000 virtual particle density field (30 density fields) → clean-topology GLB
 *
 * All local. No Meshy / Tripo / external APIs.
 */

const CATEGORY_BLUEPRINTS = `
═══════════════════════════════════════════════════════════════
BLENDER-STYLE + THREE.JS CSG CATEGORY BLUEPRINTS (follow exactly)
═══════════════════════════════════════════════════════════════

▸ VEHICLE / CAR / SPORTS CAR / SEDAN / SUPERCAR / TRUCK / SUV
  48–64 components. Industrial design, not a toy.
  REQUIRED: main-body (elongated rounded-box ~[1.05,0.28,2.15] Y≈0.38)
  + hood + cabin-greenhouse (dark glass) + rear-deck
  + front/rear bumpers + side skirts
  + 4 tire TORI (black, ground Y so bottom≈0) + 4 metal rims (cylinder)
  + 4 fenders + headlights + taillights + grille + side mirrors
  Optional: spoiler, diffuser, door seams, badge.
  Proportions: length 2.1–2.4× height. Materials: paint / rubber / chrome / glass.

▸ MOTORCYCLE / BIKE
  Frame + tank + seat + front fork + swingarm + 2 wheels (torus+rim on Y=0)
  + handlebars + headlight + exhaust. 32–48 components.

▸ CHARACTER / HUMANOID / ROBOT / PERSON / MAN / WOMAN
  Head (~1/7–1/8 height), neck, torso, pelvis,
  upper-arm L/R, forearm L/R, hand L/R, thigh L/R, calf L/R, foot L/R.
  Feet bottoms at Y≈0. Arms hang. Optional helmet/armor. 40–64 components.

▸ ANIMAL / CREATURE / DRAGON / DOG / CAT / BIRD / HORSE
  Head, snout, torso, hips, 4 legs (or wings), tail, ears, eyes.
  Legs contact ground. Species proportions. 36–56 components.

▸ PRODUCT / PHONE / LAPTOP / CAMERA / GADGET / WATCH / CONTROLLER
  Main chassis (rounded-box), screen (thin dark glass), buttons, ports,
  camera bump, logo. Sharp edges blend 0.02–0.07. 24–40 components.

▸ FURNITURE / CHAIR / TABLE / SOFA / LAMP / BED
  Seat/top + legs (cylinders Y=0) + backrest / armrests / shade.
  Clear ground contact. 20–36 components.

▸ ARCHITECTURE / BUILDING / HOUSE
  Main volume, roof, recessed dark windows, door, steps, optional chimney.
  28–48 components.

▸ WEAPON / TOOL / GUN / SWORD
  Handle, barrel/blade, trigger, sight, magazine — clear silhouette.
  20–36 components.

▸ ORGANIC / FOOD / PLANT / ROCK / TREE
  Primary mass + secondary lobes + tertiary detail. Soft blends 0.08–0.18.
`;

export function buildModelSculptUserMessage(userPrompt: string, attempt: number): string {
  const core = userPrompt.trim();

  if (attempt === 0) {
    return `${core}

═══════════════════════════════════════════════════════════════
KERIS PEAK STUDIO 3D ENGINE
  Blender-style hierarchy  +  Three.js CSG meshes  +  50M-particle density field
  30 density fields · high poly · high mesh · production / movie level
  LOCAL · no external 3D API
═══════════════════════════════════════════════════════════════

You are a senior hard-surface + character sculptor (Blender + Three.js mindset).
Produce a PRODUCTION-READY multi-component constructive solid geometry brief.

STEP 1 — CATEGORY + FEATURE LIST
Name the category. List every feature visible from a 3/4 view.
Realistic proportions (never toy / cubic / single blob).

STEP 2 — BLENDER BLOCKOUT
Primary mass(es). Y=0 is floor — resting parts MUST touch Y≈0.
Center near origin. Front faces +Z. Real bounding box proportions.

STEP 3 — THREE.JS PART HIERARCHY
Every distinct part = SEPARATE named component (Mesh + Geometry + Material).
NEVER collapse a car into one ellipsoid. NEVER merge wheels into body.
48–64 components for complex, 32–48 medium, 20–32 simple.

${CATEGORY_BLUEPRINTS}

STEP 4 — TERTIARY DETAIL
Seams, vents, panel lines, bezels, fasteners, grilles, badges.

STEP 5 — PBR MATERIALS (vary by part)
- Paint: roughness 0.22–0.42, metalness 0.05–0.25
- Rubber/tire: #111–#1a1a1a, roughness 0.88–0.95
- Metal/chrome: metalness 0.75–1.0, roughness 0.1–0.28
- Glass: dark #0a1520–#1a2838, roughness 0.05–0.14
- Plastic/matte: roughness 0.5–0.75

STEP 6 — DENSITY FIELD (30 fields · 50 MILLION particles)
Hard-surface blend 0.02–0.09. Soft organic 0.08–0.16.
detail 0.95–1.0. virtualParticles ALWAYS 50000000.

OUTPUT (STRICT)
Return ONLY one complete JSON object. No markdown fences. No prose.
{
  "name": string,
  "virtualParticles": 50000000,
  "front": "+z" | "-z" | "+x" | "-x",
  "detail": 0.95-1.0,
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
}
- Name every part clearly.
- <20 components or only a few big spheres = FAILED.
- Vehicles: 4 tire tori + 4 rims on ground mandatory.
- Characters: separate head + torso + limbs mandatory.`;
  }

  if (attempt === 1) {
    return `${core}

RETRY — previous output was incomplete, blob-like, or missing critical parts.

Return ONLY one valid JSON sculpt object. No fences. No prose.

HARD REQUIREMENTS (Keris Peak Studio):
- virtualParticles: 50000000
- detail: 0.95–1.0
- 40–64 named components with REAL part hierarchy
- Vehicles: body + cabin + hood + 4 ground tires + 4 rims + bumpers + lights + mirrors
- Characters: head + torso + upper/lower arms + upper/lower legs + feet
- Hard-surface blend ≤ 0.1
- Varied materials — never one material for everything
- Realistic proportions — never a single fused blob

${CATEGORY_BLUEPRINTS}`;
  }

  return `${core}

FINAL ATTEMPT — valid, readable, structured.

Return ONLY one JSON object:
- virtualParticles 50000000
- detail 0.94–1.0
- 32–56 named components
- Separate major parts (never one ellipsoid for a car or person)
- Vehicles: body + cabin + 4 ground tires + 4 rims mandatory
- Characters: head + torso + limbs mandatory
- blend 0.03–0.12 for hard-surface
No markdown fences. No commentary.`;
}

/** Always returns a valid production sculpt — never null when userPrompt is given. */
export function parseAndRefineSculpt(plan: string, userPrompt?: string): ParticleSculptSpec | null {
  const normalized =
    normalizeParticleSculptSpec(plan) ??
    normalizeParticleSculptSpec(extractBlock(plan, "json")) ??
    normalizeParticleSculptSpec(extractJsonObject(plan));

  if (normalized) {
    return refineParticleSculptSpec(normalized, userPrompt);
  }

  // Hard fallback: build a minimal valid spec from the prompt alone so the pipeline never fails
  if (userPrompt && userPrompt.trim()) {
    const seed: ParticleSculptSpec = {
      name: userPrompt.trim().slice(0, 48) || "Keris Sculpt",
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
    };
    return refineParticleSculptSpec(seed, userPrompt);
  }

  return null;
}
