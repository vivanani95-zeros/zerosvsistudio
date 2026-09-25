import {
  extractJsonObject,
  normalizeParticleSculptSpec,
  refineParticleSculptSpec,
  type ParticleSculptSpec,
} from "@/lib/particle-model";
import { extractBlock } from "@/lib/zeros";

const CATEGORY_BLUEPRINTS = `
CATEGORY BLUEPRINTS (follow for the matching category)

▸ VEHICLE / CAR / SPORTS CAR / SEDAN / SUV / TRUCK
  28–48 components. Industrial design, not a toy.
  REQUIRED hierarchy:
  - main-body ellipsoid elongated ~[0.8, 0.26, 1.9] at Y≈0.38
  - cabin (dark glass), hood, rear-deck, bumpers, side skirts
  - 4 tire TORI + 4 rims — wheel X must be OUTSIDE body half-width so tires are visible
  - headlights, taillights, mirrors, grille, optional spoiler
  Proportions: length ≈ 2.2× height. Materials: paint / rubber / chrome / glass.

▸ MOTORCYCLE / BIKE
  Frame + tank + seat + fork + 2 wheels (torus+rim on ground) + handlebars + headlight + exhaust + engine.

▸ CHARACTER / HUMANOID / ROBOT / PERSON
  Head (~1/7 height), neck, torso, pelvis,
  upper-arm L/R, forearm L/R, hand L/R, thigh L/R, calf L/R, foot L/R.
  Feet bottoms at Y≈0. 28–48 components.

▸ ANIMAL / CREATURE / DOG / CAT / HORSE / DRAGON
  Head, snout, torso, 4 legs (or wings), tail, ears, eyes. Ground contact. Species proportions.

▸ PRODUCT / PHONE / LAPTOP / CAMERA / GADGET
  Chassis (rounded-box), screen (thin dark glass), buttons, ports, camera bump. Sharp blend 0.02–0.06.

▸ FURNITURE / CHAIR / TABLE / SOFA / LAMP
  Seat/top + legs (cylinders touching Y=0) + backrest / armrests / shade.

▸ ARCHITECTURE / HOUSE / BUILDING
  Main volume, roof, recessed dark windows, door, steps, optional chimney.

▸ GENERIC / ABSTRACT / OTHER
  Primary mass + secondary form + accent ring + base + 2–3 detail parts. Mixed shapes.
`;

export function buildModelSculptUserMessage(userPrompt: string, attempt: number): string {
  const core = userPrompt.trim();

  if (attempt === 0) {
    return `${core}

ZEROS LOCAL 3D STUDIO — movie-level multi-part sculpt
50M virtual particles · density fields · PBR · clean-topology .glb · no external 3D API

You are a senior hard-surface + character sculptor (Blender + Three.js).
Output a production multi-component constructive solid geometry brief.

RULES:
1) Detect category. List every feature visible from a 3/4 view.
2) Y=0 is the floor. Anything that rests on the ground touches Y≈0.
3) Every distinct part = SEPARATE named component. Never fuse wheels into body.
4) MIX shapes (ellipsoid, torus, capsule, cylinder, rounded-box). Never only boxes.
5) Materials vary by part (paint vs rubber vs metal vs glass).
6) Hard-surface blend 0.02–0.09. Soft organic 0.08–0.16.
7) detail 0.95–1.0. virtualParticles ALWAYS 50000000.
8) 24–48 components for complex objects; 16–28 for simple props.

${CATEGORY_BLUEPRINTS}

OUTPUT — ONLY one JSON object. No markdown fences. No prose.
{
  "name": string,
  "virtualParticles": 50000000,
  "front": "+z",
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
- Name every part clearly ("front-left-tire", "cabin", "main-body").
- Vehicles: 4 tires OUTSIDE body width is mandatory.
- Characters: head + limbs mandatory.
- <12 components or one big blob = FAILED.`;
  }

  if (attempt === 1) {
    return `${core}

RETRY — previous output was incomplete or blob-like.
Return ONLY one valid JSON sculpt. No fences.

HARD REQUIREMENTS:
- virtualParticles: 50000000, detail: 0.95–1.0
- 24–48 named components with real hierarchy
- Vehicles: body + cabin + 4 ground tires OUTSIDE body + 4 rims + lights
- Characters: head + torso + arms + legs + feet
- Animals: torso + head + 4 legs + tail
- Mix shapes; vary materials; Y=0 is floor

${CATEGORY_BLUEPRINTS}`;
  }

  return `${core}

FINAL ATTEMPT — structured, readable hierarchy.
Return ONLY JSON: virtualParticles 50000000, detail 0.95–1.0, 20–40 named components.
Separate major parts. Vehicles need ground tires outside body. Characters need limbs.
No markdown. No commentary.`;
}

export function parseAndRefineSculpt(plan: string, userPrompt?: string): ParticleSculptSpec | null {
  const normalized =
    normalizeParticleSculptSpec(plan) ??
    normalizeParticleSculptSpec(extractBlock(plan, "json")) ??
    normalizeParticleSculptSpec(extractJsonObject(plan));

  if (normalized) {
    return refineParticleSculptSpec(normalized, userPrompt);
  }

  if (userPrompt && userPrompt.trim()) {
    const seed: ParticleSculptSpec = {
      name: userPrompt.trim().slice(0, 48) || "Zeros Sculpt",
      virtualParticles: 50000000,
      front: "+z",
      detail: 0.98,
      seed: 1337,
      components: [
        {
          name: "primary-mass",
          shape: "ellipsoid",
          position: [0, 0.4, 0],
          scale: [0.5, 0.35, 0.7],
          material: { color: "#e11d48", metalness: 0.15, roughness: 0.38 },
          blend: 0.06,
        },
      ],
    };
    return refineParticleSculptSpec(seed, userPrompt);
  }

  return null;
}
