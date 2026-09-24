import {
  extractJsonObject,
  normalizeParticleSculptSpec,
  refineParticleSculptSpec,
  type ParticleSculptSpec,
} from "@/lib/particle-model";
import { extractBlock } from "@/lib/zeros";

/**
 * Zeros Premium Meshy-class sculpt pipeline.
 *
 * The LLM must:
 * 1) understand the object category
 * 2) choose a real part hierarchy (never a single blob)
 * 3) place secondary + tertiary forms with production proportions
 * 4) return dense, named density components with varied materials
 *
 * Post-process (refineParticleSculptSpec) then grounds, centers, and
 * applies category-aware structural fixes (wheels on ground, elongated body, etc.).
 */

const CATEGORY_BLUEPRINTS = `
═══════════════════════════════════════════════════════════════
CATEGORY BLUEPRINTS — follow the matching one EXACTLY
═══════════════════════════════════════════════════════════════

▸ VEHICLE / CAR / SPORTS CAR / SEDAN / SUPERCAR / TRUCK / SUV
  Think industrial design, not a toy.
  REQUIRED hierarchy (use 48–64 components):
  1. main-body          — elongated rounded-box or ellipsoid, low height (scale ~ [1.05, 0.28, 2.15]), center Y≈0.38
  2. hood               — slightly raised front deck
  3. cabin-greenhouse   — dark glass box/ellipsoid on top-middle (roof + windshield + side glass)
  4. rear-deck / trunk  — rear shelf
  5. front-bumper       — low, wide, slightly forward of body
  6. rear-bumper
  7–10. four WHEEL ASSEMBLIES (CRITICAL — never miss these):
       each tire = black TORUS (scale ~ [0.32, 0.14, 0.32]), Y so BOTTOM of tire ≈ 0
       each rim  = metal CYLINDER at same XY center, slightly smaller radius, same Y
       positions roughly: FL (−0.72, 0.16,  0.78), FR (0.72, 0.16, 0.78),
                         RL (−0.72, 0.16, −0.78), RR (0.72, 0.16, −0.78)
  11–14. wheel arches / fenders over each tire
  15–16. side skirts
  17–18. headlights (bright, front corners) + taillights (red, rear)
  19. grille / lower intake
  20. side mirrors (small boxes or cylinders)
  optional: spoiler, diffuser, roof rails, door seams, badge plate
  Proportions: length ≈ 2.1–2.4× height, width ≈ 0.9–1.1× height, wheelbase readable.
  Materials: paint (metalness 0.05–0.25, roughness 0.22–0.4), rubber tires (#111–#1a1a1a, roughness 0.9),
  metal rims (metalness 0.85–1, roughness 0.15), glass (#0a1520–#1a2838, roughness 0.06–0.12).

▸ MOTORCYCLE / BIKE
  Frame + fuel tank + seat + front fork + rear swingarm + 2 wheels (torus + rim) + handlebars + headlight + exhaust.
  Wheels touch Y=0. Use 32–48 components.

▸ CHARACTER / HUMANOID / ROBOT / PERSON
  Head (sphere/ellipsoid ~1/7–1/8 total height), neck, torso, pelvis,
  upper-arm L/R, forearm L/R, hand L/R, thigh L/R, calf L/R, foot L/R.
  Optional helmet, visor, armor plates, backpack.
  Feet bottoms at Y≈0. Arms hang naturally. 40–64 components.

▸ ANIMAL / CREATURE / DRAGON / DOG / CAT / BIRD
  Head, snout/muzzle, torso, hips, 4 legs (or wings), tail, ears, eyes.
  Legs contact ground. Proportions match the species. 36–56 components.

▸ PRODUCT / PHONE / LAPTOP / CAMERA / GADGET / WATCH
  Main chassis (rounded-box), screen (thin dark glass), buttons, ports, camera bump, logo plate.
  Sharp edges: blend 0.02–0.07. 24–40 components.

▸ FURNITURE / CHAIR / TABLE / SOFA / LAMP
  Seat/top + legs (cylinders touching Y=0) + backrest / armrests / shade.
  Clear ground contact. 20–36 components.

▸ ARCHITECTURE / BUILDING / HOUSE
  Main volume, roof, recessed dark windows, door, steps, optional chimney.
  28–48 components.

▸ WEAPON / TOOL / GUN / SWORD
  Handle/grip, barrel/blade, trigger, sight, magazine — clear silhouette.
  20–36 components.

▸ ORGANIC / FOOD / PLANT / ROCK
  Primary mass + secondary lobes + tertiary surface detail. Soft blends 0.08–0.18.
`;

export function buildModelSculptUserMessage(userPrompt: string, attempt: number): string {
  const core = userPrompt.trim();

  if (attempt === 0) {
    return `${core}

═══════════════════════════════════════════════════════════════
ZEROS PREMIUM SCULPT PIPELINE (Meshy-class · local · no external API)
═══════════════════════════════════════════════════════════════

You are a senior hard-surface + character sculptor at a film VFX studio.
Your job: produce a PRODUCTION-READY multi-component density-field brief that reconstructs into a believable, premium 3D object.

STEP 1 — UNDERSTAND THE OBJECT
- Name the exact category (vehicle / character / animal / product / furniture / architecture / weapon / prop / organic).
- List every feature a human expects to see from a 3/4 view.
- Decide realistic overall proportions (never toy-like or cubic).

STEP 2 — BLOCKOUT (primary mass)
- One or two large forms for the main volume.
- Ground plane: Y = 0 is the floor. Anything that rests on the ground MUST touch Y ≈ 0.
- Center the object near the origin. Front faces +Z unless the object naturally faces another way.
- Overall bounding box must look real (cars are long and low; humans are tall and narrow).

STEP 3 — PART HIERARCHY (secondary forms)
Use SEPARATE named components for every distinct part.
NEVER collapse a car into one ellipsoid. NEVER merge wheels into the body.
Use 48–64 components for complex objects (cars, characters, creatures),
32–48 for medium, 20–32 for simple props.

${CATEGORY_BLUEPRINTS}

STEP 4 — TERTIARY DETAIL
Add small fields for seams, vents, panel lines, bezels, fasteners, grilles, badges —
enough that the silhouette reads as a finished product, not a soft blob.

STEP 5 — MATERIALS (vary by part — never one material for everything)
- Body paint: roughness 0.22–0.42, metalness 0.05–0.25
- Rubber / tire: #111111–#1a1a1a, roughness 0.88–0.95, metalness 0
- Metal / chrome / rim: metalness 0.75–1.0, roughness 0.1–0.28
- Glass: dark #0a1520–#1a2838, metalness 0.05–0.25, roughness 0.05–0.14
- Plastic / matte: roughness 0.5–0.75, metalness 0–0.1

STEP 6 — BLEND & DENSITY
- Hard-surface joins: blend 0.02–0.09 (parts stay readable)
- Soft organic joins only: blend 0.08–0.16
- detail: 0.95–1.0 always
- virtualParticles: 1000000

OUTPUT RULES (STRICT)
- Return ONLY one complete JSON sculpt object. No markdown fences. No commentary. No prose.
- Schema:
{
  "name": string,
  "virtualParticles": 1000000,
  "front": "+z" | "-z" | "+x" | "-x",
  "detail": 0.95-1.0,
  "seed": integer,
  "components": [
    {
      "name": string,
      "shape": "sphere" | "ellipsoid" | "box" | "rounded-box" | "capsule" | "cylinder" | "torus" | "cone",
      "position": [x, y, z],
      "scale": [x, y, z],
      "rotation": [x, y, z],
      "material": { "color": "#rrggbb", "metalness": 0-1, "roughness": 0-1 },
      "blend": 0-0.2
    }
  ]
}
- Name every component clearly (e.g. "front-left-tire", "cabin-glass", "main-body").
- If you output fewer than 20 components OR only 1–5 big spheres/ellipsoids, you FAILED.
- Vehicles MUST include 4 separate tire tori + 4 rims at ground level.
- Characters MUST have separate head, torso, and limbs.`;
  }

  if (attempt === 1) {
    return `${core}

RETRY — previous output was incomplete, blob-like, or missing critical parts.

Return ONLY one valid JSON sculpt object. No fences. No prose.

HARD REQUIREMENTS:
- virtualParticles: 1000000
- detail: 0.95–1.0
- 40–64 named components with REAL part hierarchy
- Vehicles / cars: main-body (elongated) + cabin-glass + hood + 4 tires (torus, black, ground) + 4 rims (cylinder, metal) + bumpers + lights + mirrors
- Characters: separate head + torso + upper/lower arms + upper/lower legs + feet
- Hard-surface blend ≤ 0.1
- Varied materials (paint / rubber / metal / glass)
- Realistic proportions — never a single fused blob

${CATEGORY_BLUEPRINTS}`;
  }

  return `${core}

FINAL ATTEMPT — keep it valid, readable, and structured.

Return ONLY one JSON object:
- virtualParticles 1000000
- detail 0.94–1.0
- 32–56 named components
- Preserve recognizable silhouette
- Separate major parts (never one ellipsoid for a car or person)
- Vehicles: body + cabin + 4 ground tires + 4 rims mandatory
- blend 0.03–0.12 for hard-surface
No markdown fences. No commentary.`;
}

/** Parse model-provider text into a refined, viewer-ready sculpt spec. */
export function parseAndRefineSculpt(plan: string, userPrompt?: string): ParticleSculptSpec | null {
  const normalized =
    normalizeParticleSculptSpec(plan) ??
    normalizeParticleSculptSpec(extractBlock(plan, "json")) ??
    normalizeParticleSculptSpec(extractJsonObject(plan));
  if (!normalized) return null;
  return refineParticleSculptSpec(normalized, userPrompt);
}
