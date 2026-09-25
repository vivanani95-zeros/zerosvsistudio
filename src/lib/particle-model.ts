export type ParticleShape =
  | "sphere" | "ellipsoid" | "box" | "capsule" | "cylinder"
  | "torus" | "cone" | "rounded-box";

export type ParticleMaterial = {
  color?: string;
  metalness?: number;
  roughness?: number;
};

export type ParticleComponent = {
  name?: string;
  shape: ParticleShape;
  position: [number, number, number];
  scale: [number, number, number];
  rotation?: [number, number, number];
  material?: ParticleMaterial;
  blend?: number;
};

export type ParticleSculptSpec = {
  name: string;
  virtualParticles: 50000000;
  front?: "+z" | "-z" | "+x" | "-x";
  components: ParticleComponent[];
  detail?: number;
  seed?: number;
};

export const MAX_COMPONENTS = 64;

const HEX = /^#[0-9a-f]{6}$/i;

function asNum(x: unknown, fallback: number): number {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && x.trim() && Number.isFinite(Number(x))) return Number(x);
  return fallback;
}

function asVec3(x: unknown, fallback: [number, number, number]): [number, number, number] {
  if (Array.isArray(x) && x.length >= 3) {
    return [asNum(x[0], fallback[0]), asNum(x[1], fallback[1]), asNum(x[2], fallback[2])];
  }
  return fallback;
}

function asShape(x: unknown): ParticleShape {
  if (typeof x === "string") {
    const s = x.toLowerCase().trim().replace(/_/g, "-") as ParticleShape;
    if (["sphere","ellipsoid","box","capsule","cylinder","torus","cone","rounded-box"].includes(s)) return s;
    if (s === "cube" || s === "cuboid") return "box";
    if (s === "ball") return "sphere";
  }
  return "ellipsoid";
}

function asColor(x: unknown): string {
  if (typeof x === "string") {
    const c = x.trim();
    if (HEX.test(c)) return c;
    if (/^[0-9a-f]{6}$/i.test(c)) return `#${c}`;
  }
  return "#c7d2e3";
}

export function extractJsonObject(text: string): string | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const inner = fenced[1].trim();
    if (inner.startsWith("{")) return extractJsonObject(inner) ?? inner;
  }
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function isParticleSculptSpec(value: unknown): value is ParticleSculptSpec {
  return normalizeParticleSculptSpec(value) !== null;
}

/** Production sports-car / vehicle hierarchy — real proportions, ground tires, glass, lights. */
function studioVehicleBase(paint: string): ParticleComponent[] {
  const base: ParticleComponent[] = [
    { name: "main-body", shape: "rounded-box", position: [0, 0.38, 0], scale: [1.05, 0.28, 2.15], material: { color: paint, metalness: 0.18, roughness: 0.32 }, blend: 0.06 },
    { name: "hood", shape: "rounded-box", position: [0, 0.48, 0.72], scale: [0.92, 0.1, 0.55], rotation: [0.08, 0, 0], material: { color: paint, metalness: 0.2, roughness: 0.3 }, blend: 0.05 },
    { name: "cabin-greenhouse", shape: "rounded-box", position: [0, 0.72, -0.05], scale: [0.82, 0.28, 0.72], material: { color: "#0d1a28", metalness: 0.15, roughness: 0.08 }, blend: 0.07 },
    { name: "rear-deck", shape: "rounded-box", position: [0, 0.42, -0.85], scale: [0.95, 0.12, 0.4], material: { color: paint, metalness: 0.18, roughness: 0.32 }, blend: 0.05 },
    { name: "front-bumper", shape: "rounded-box", position: [0, 0.18, 1.12], scale: [1.0, 0.12, 0.18], material: { color: "#1a1a1a", metalness: 0.1, roughness: 0.55 }, blend: 0.04 },
    { name: "rear-bumper", shape: "rounded-box", position: [0, 0.18, -1.12], scale: [1.0, 0.12, 0.18], material: { color: "#1a1a1a", metalness: 0.1, roughness: 0.55 }, blend: 0.04 },
    { name: "side-skirt-left", shape: "box", position: [-0.95, 0.2, 0], scale: [0.08, 0.08, 1.4], material: { color: "#1a1a1a", metalness: 0.15, roughness: 0.5 }, blend: 0.04 },
    { name: "side-skirt-right", shape: "box", position: [0.95, 0.2, 0], scale: [0.08, 0.08, 1.4], material: { color: "#1a1a1a", metalness: 0.15, roughness: 0.5 }, blend: 0.04 },
    { name: "roof", shape: "rounded-box", position: [0, 0.88, -0.08], scale: [0.72, 0.06, 0.55], material: { color: paint, metalness: 0.2, roughness: 0.28 }, blend: 0.05 },
    { name: "a-pillar-left", shape: "box", position: [-0.78, 0.7, 0.28], scale: [0.04, 0.22, 0.08], rotation: [0.25, 0, 0], material: { color: "#1a1a1a", metalness: 0.3, roughness: 0.4 }, blend: 0.03 },
    { name: "a-pillar-right", shape: "box", position: [0.78, 0.7, 0.28], scale: [0.04, 0.22, 0.08], rotation: [0.25, 0, 0], material: { color: "#1a1a1a", metalness: 0.3, roughness: 0.4 }, blend: 0.03 },
  ];
  const wheelPos: [number, number, number][] = [[-0.72, 0.16, 0.78], [0.72, 0.16, 0.78], [-0.72, 0.16, -0.78], [0.72, 0.16, -0.78]];
  const labels = ["front-left", "front-right", "rear-left", "rear-right"];
  for (let i = 0; i < 4; i++) {
    const [x, y, z] = wheelPos[i]!;
    const L = labels[i]!;
    base.push(
      { name: `${L}-tire`, shape: "torus", position: [x, y, z], scale: [0.32, 0.14, 0.32], rotation: [Math.PI / 2, 0, 0], material: { color: "#111111", metalness: 0, roughness: 0.92 }, blend: 0.03 },
      { name: `${L}-rim`, shape: "cylinder", position: [x, y, z], scale: [0.18, 0.06, 0.18], rotation: [Math.PI / 2, 0, 0], material: { color: "#c0c8d4", metalness: 0.92, roughness: 0.18 }, blend: 0.02 },
      { name: `${L}-fender`, shape: "ellipsoid", position: [x * 0.95, y + 0.22, z], scale: [0.22, 0.16, 0.38], material: { color: paint, metalness: 0.18, roughness: 0.32 }, blend: 0.08 },
    );
  }
  base.push(
    { name: "headlight-left", shape: "ellipsoid", position: [-0.55, 0.32, 1.05], scale: [0.12, 0.08, 0.08], material: { color: "#f0f4ff", metalness: 0.3, roughness: 0.12 }, blend: 0.04 },
    { name: "headlight-right", shape: "ellipsoid", position: [0.55, 0.32, 1.05], scale: [0.12, 0.08, 0.08], material: { color: "#f0f4ff", metalness: 0.3, roughness: 0.12 }, blend: 0.04 },
    { name: "taillight-left", shape: "ellipsoid", position: [-0.55, 0.35, -1.1], scale: [0.1, 0.06, 0.05], material: { color: "#cc1122", metalness: 0.2, roughness: 0.2 }, blend: 0.04 },
    { name: "taillight-right", shape: "ellipsoid", position: [0.55, 0.35, -1.1], scale: [0.1, 0.06, 0.05], material: { color: "#cc1122", metalness: 0.2, roughness: 0.2 }, blend: 0.04 },
    { name: "side-mirror-left", shape: "box", position: [-0.95, 0.58, 0.35], scale: [0.08, 0.05, 0.12], material: { color: paint, metalness: 0.2, roughness: 0.3 }, blend: 0.03 },
    { name: "side-mirror-right", shape: "box", position: [0.95, 0.58, 0.35], scale: [0.08, 0.05, 0.12], material: { color: paint, metalness: 0.2, roughness: 0.3 }, blend: 0.03 },
    { name: "grille", shape: "box", position: [0, 0.28, 1.15], scale: [0.55, 0.08, 0.06], material: { color: "#0a0a0a", metalness: 0.4, roughness: 0.45 }, blend: 0.03 },
    { name: "spoiler", shape: "box", position: [0, 0.58, -1.05], scale: [0.85, 0.04, 0.12], material: { color: "#1a1a1a", metalness: 0.25, roughness: 0.4 }, blend: 0.03 },
  );
  return base;
}

function studioCharacterBase(skin: string): ParticleComponent[] {
  return [
    { name: "head", shape: "ellipsoid", position: [0, 1.55, 0], scale: [0.18, 0.22, 0.18], material: { color: skin, metalness: 0.05, roughness: 0.55 }, blend: 0.08 },
    { name: "neck", shape: "cylinder", position: [0, 1.35, 0], scale: [0.06, 0.08, 0.06], material: { color: skin, metalness: 0.05, roughness: 0.55 }, blend: 0.06 },
    { name: "torso", shape: "rounded-box", position: [0, 1.05, 0], scale: [0.28, 0.32, 0.16], material: { color: "#2a4a7a", metalness: 0.1, roughness: 0.5 }, blend: 0.07 },
    { name: "pelvis", shape: "rounded-box", position: [0, 0.72, 0], scale: [0.26, 0.12, 0.14], material: { color: "#1a1a2e", metalness: 0.08, roughness: 0.55 }, blend: 0.06 },
    { name: "upper-arm-left", shape: "capsule", position: [-0.38, 1.05, 0], scale: [0.07, 0.22, 0.07], material: { color: skin, metalness: 0.05, roughness: 0.55 }, blend: 0.07 },
    { name: "upper-arm-right", shape: "capsule", position: [0.38, 1.05, 0], scale: [0.07, 0.22, 0.07], material: { color: skin, metalness: 0.05, roughness: 0.55 }, blend: 0.07 },
    { name: "forearm-left", shape: "capsule", position: [-0.42, 0.72, 0], scale: [0.06, 0.2, 0.06], material: { color: skin, metalness: 0.05, roughness: 0.55 }, blend: 0.07 },
    { name: "forearm-right", shape: "capsule", position: [0.42, 0.72, 0], scale: [0.06, 0.2, 0.06], material: { color: skin, metalness: 0.05, roughness: 0.55 }, blend: 0.07 },
    { name: "hand-left", shape: "ellipsoid", position: [-0.42, 0.5, 0], scale: [0.05, 0.08, 0.04], material: { color: skin, metalness: 0.05, roughness: 0.55 }, blend: 0.05 },
    { name: "hand-right", shape: "ellipsoid", position: [0.42, 0.5, 0], scale: [0.05, 0.08, 0.04], material: { color: skin, metalness: 0.05, roughness: 0.55 }, blend: 0.05 },
    { name: "thigh-left", shape: "capsule", position: [-0.12, 0.45, 0], scale: [0.09, 0.25, 0.09], material: { color: "#1a1a2e", metalness: 0.08, roughness: 0.55 }, blend: 0.07 },
    { name: "thigh-right", shape: "capsule", position: [0.12, 0.45, 0], scale: [0.09, 0.25, 0.09], material: { color: "#1a1a2e", metalness: 0.08, roughness: 0.55 }, blend: 0.07 },
    { name: "calf-left", shape: "capsule", position: [-0.12, 0.18, 0], scale: [0.07, 0.2, 0.07], material: { color: skin, metalness: 0.05, roughness: 0.55 }, blend: 0.07 },
    { name: "calf-right", shape: "capsule", position: [0.12, 0.18, 0], scale: [0.07, 0.2, 0.07], material: { color: skin, metalness: 0.05, roughness: 0.55 }, blend: 0.07 },
    { name: "foot-left", shape: "rounded-box", position: [-0.12, 0.04, 0.06], scale: [0.08, 0.04, 0.16], material: { color: "#222222", metalness: 0.1, roughness: 0.7 }, blend: 0.04 },
    { name: "foot-right", shape: "rounded-box", position: [0.12, 0.04, 0.06], scale: [0.08, 0.04, 0.16], material: { color: "#222222", metalness: 0.1, roughness: 0.7 }, blend: 0.04 },
  ];
}

function studioProductBase(color: string): ParticleComponent[] {
  return [
    { name: "chassis", shape: "rounded-box", position: [0, 0.08, 0], scale: [0.55, 0.08, 1.1], material: { color, metalness: 0.25, roughness: 0.35 }, blend: 0.04 },
    { name: "screen", shape: "box", position: [0, 0.13, 0.05], scale: [0.48, 0.01, 0.9], material: { color: "#0a1520", metalness: 0.2, roughness: 0.08 }, blend: 0.02 },
    { name: "bezel", shape: "rounded-box", position: [0, 0.12, 0], scale: [0.52, 0.02, 1.02], material: { color: "#1a1a1a", metalness: 0.3, roughness: 0.4 }, blend: 0.03 },
    { name: "camera-bump", shape: "rounded-box", position: [-0.15, 0.16, -0.4], scale: [0.14, 0.04, 0.14], material: { color: "#2a2a2a", metalness: 0.4, roughness: 0.35 }, blend: 0.03 },
    { name: "lens", shape: "cylinder", position: [-0.15, 0.18, -0.4], scale: [0.05, 0.02, 0.05], material: { color: "#111122", metalness: 0.5, roughness: 0.15 }, blend: 0.02 },
    { name: "button-power", shape: "cylinder", position: [0.52, 0.1, 0.2], scale: [0.015, 0.03, 0.015], material: { color: "#333", metalness: 0.4, roughness: 0.4 }, blend: 0.02 },
    { name: "port", shape: "box", position: [0, 0.06, 0.55], scale: [0.12, 0.02, 0.03], material: { color: "#111", metalness: 0.5, roughness: 0.3 }, blend: 0.02 },
  ];
}

function studioFurnitureBase(wood: string): ParticleComponent[] {
  return [
    { name: "seat", shape: "rounded-box", position: [0, 0.45, 0], scale: [0.5, 0.06, 0.5], material: { color: wood, metalness: 0.05, roughness: 0.6 }, blend: 0.05 },
    { name: "backrest", shape: "rounded-box", position: [0, 0.85, -0.22], scale: [0.48, 0.4, 0.05], material: { color: wood, metalness: 0.05, roughness: 0.6 }, blend: 0.05 },
    { name: "leg-fl", shape: "cylinder", position: [-0.35, 0.22, 0.35], scale: [0.04, 0.22, 0.04], material: { color: "#2a1a0a", metalness: 0.1, roughness: 0.5 }, blend: 0.03 },
    { name: "leg-fr", shape: "cylinder", position: [0.35, 0.22, 0.35], scale: [0.04, 0.22, 0.04], material: { color: "#2a1a0a", metalness: 0.1, roughness: 0.5 }, blend: 0.03 },
    { name: "leg-rl", shape: "cylinder", position: [-0.35, 0.22, -0.35], scale: [0.04, 0.22, 0.04], material: { color: "#2a1a0a", metalness: 0.1, roughness: 0.5 }, blend: 0.03 },
    { name: "leg-rr", shape: "cylinder", position: [0.35, 0.22, -0.35], scale: [0.04, 0.22, 0.04], material: { color: "#2a1a0a", metalness: 0.1, roughness: 0.5 }, blend: 0.03 },
  ];
}

/** Generic production object — never a single rectangle. */
function studioGenericBase(color: string): ParticleComponent[] {
  return [
    { name: "primary-mass", shape: "rounded-box", position: [0, 0.45, 0], scale: [0.7, 0.45, 0.9], material: { color, metalness: 0.2, roughness: 0.35 }, blend: 0.06 },
    { name: "secondary-form", shape: "ellipsoid", position: [0, 0.85, 0.1], scale: [0.45, 0.25, 0.4], material: { color, metalness: 0.18, roughness: 0.38 }, blend: 0.08 },
    { name: "accent-ring", shape: "torus", position: [0, 0.45, 0], scale: [0.55, 0.08, 0.55], rotation: [Math.PI / 2, 0, 0], material: { color: "#c0c8d4", metalness: 0.8, roughness: 0.2 }, blend: 0.03 },
    { name: "base-plate", shape: "cylinder", position: [0, 0.06, 0], scale: [0.5, 0.06, 0.5], material: { color: "#1a1a1a", metalness: 0.3, roughness: 0.5 }, blend: 0.04 },
    { name: "detail-left", shape: "capsule", position: [-0.4, 0.5, 0.2], scale: [0.06, 0.2, 0.06], material: { color: "#2a2a2a", metalness: 0.4, roughness: 0.4 }, blend: 0.04 },
    { name: "detail-right", shape: "capsule", position: [0.4, 0.5, 0.2], scale: [0.06, 0.2, 0.06], material: { color: "#2a2a2a", metalness: 0.4, roughness: 0.4 }, blend: 0.04 },
    { name: "top-cap", shape: "sphere", position: [0, 1.05, 0], scale: [0.18, 0.12, 0.18], material: { color: "#e8eef5", metalness: 0.5, roughness: 0.25 }, blend: 0.05 },
  ];
}

export function normalizeParticleSculptSpec(value: unknown): ParticleSculptSpec | null {
  let v: Record<string, unknown> | null = null;
  if (typeof value === "string") {
    try {
      const raw = extractJsonObject(value) ?? value.trim();
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") v = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (value && typeof value === "object") {
    v = value as Record<string, unknown>;
  }
  if (!v) return null;

  if (!Array.isArray(v.components)) {
    for (const key of ["data", "result", "sculpt", "model", "spec"]) {
      const nested = v[key];
      if (nested && typeof nested === "object" && Array.isArray((nested as Record<string, unknown>).components)) {
        v = nested as Record<string, unknown>;
        break;
      }
    }
  }

  const raw = Array.isArray(v.components) ? v.components : Array.isArray(v.parts) ? v.parts : [];
  const components: ParticleComponent[] = raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .slice(0, MAX_COMPONENTS)
    .map((p, i) => {
      const scale = asVec3(p.scale ?? p.size, [0.4, 0.4, 0.4]).map((n) =>
        Math.max(0.002, Math.min(100, Math.abs(n) || 0.4)),
      ) as [number, number, number];
      const position = asVec3(p.position ?? p.pos, [0, 0, 0]);
      const rotation = asVec3(p.rotation ?? p.rot, [0, 0, 0]);
      const mat = p.material && typeof p.material === "object" ? (p.material as Record<string, unknown>) : { color: p.color };
      return {
        name: typeof p.name === "string" ? p.name : `Component ${i + 1}`,
        shape: asShape(p.shape ?? p.type),
        position,
        scale,
        rotation,
        material: {
          color: asColor(mat.color),
          metalness: Math.max(0, Math.min(1, asNum(mat.metalness, 0.15))),
          roughness: Math.max(0.04, Math.min(1, asNum(mat.roughness, 0.38))),
        },
        blend: Math.max(0, Math.min(0.28, asNum(p.blend, 0.05))),
      };
    });

  if (!components.length) return null;

  return {
    name: typeof v.name === "string" && v.name.trim() ? v.name.trim() : "Keris Sculpt",
    virtualParticles: 50000000,
    front: v.front === "+z" || v.front === "-z" || v.front === "+x" || v.front === "-x" ? v.front : "+z",
    components,
    detail: Math.max(0.5, Math.min(1, asNum(v.detail, 0.98))),
    seed: Number.isFinite(asNum(v.seed, 1337)) ? asNum(v.seed, 1337) : 1337,
  };
}

export function clampParticleSpec(spec: ParticleSculptSpec): ParticleSculptSpec {
  return {
    ...spec,
    virtualParticles: 50000000,
    components: spec.components.slice(0, MAX_COMPONENTS).map((p) => ({
      ...p,
      position: p.position.map((n) => (Number.isFinite(n) ? n : 0)) as [number, number, number],
      scale: p.scale.map((n) => Math.max(0.002, Math.min(100, Number.isFinite(n) ? n : 1))) as [number, number, number],
      rotation: (p.rotation ?? [0, 0, 0]).map((n) => (Number.isFinite(n) ? n : 0)) as [number, number, number],
      material: {
        color: HEX.test(p.material?.color ?? "") ? p.material!.color! : "#c7d2e3",
        metalness: Math.max(0, Math.min(1, p.material?.metalness ?? 0.15)),
        roughness: Math.max(0.04, Math.min(1, p.material?.roughness ?? 0.38)),
      },
      blend: Math.max(0, Math.min(0.28, p.blend ?? 0.05)),
    })),
    detail: Math.max(0.5, Math.min(1, spec.detail ?? 0.98)),
    seed: Number.isFinite(spec.seed) ? spec.seed! : 1337,
  };
}

/**
 * Always produces a production-ready hierarchy (50M particles).
 * Rejects blob / rectangle outputs by injecting full studio category bases.
 */
export function refineParticleSculptSpec(
  spec: ParticleSculptSpec,
  userPrompt?: string,
): ParticleSculptSpec {
  const clamped = clampParticleSpec(spec);
  const text = `${userPrompt ?? ""} ${clamped.name}`.toLowerCase();
  const isVehicle = /\b(car|vehicle|truck|suv|sedan|sports?\s*car|supercar|wheel|tire|bumper|hood|auto|race\s*car)\b/.test(text);
  const isCharacter = /\b(person|human|character|robot|man|woman|figure|humanoid|android|soldier|hero)\b/.test(text);
  const isProduct = /\b(phone|laptop|camera|gadget|watch|controller|device|tablet)\b/.test(text);
  const isFurniture = /\b(chair|table|sofa|lamp|bed|stool|desk|furniture)\b/.test(text);

  const paint =
    clamped.components.find((c) => /body|main|paint|chassis/i.test(c.name ?? ""))?.material?.color ??
    clamped.components[0]?.material?.color ??
    "#c41e3a";

  let components = clamped.components;

  // HARD RULE: never ship a rectangle / blob. Force studio hierarchy when thin.
  if (isVehicle && components.length < 24) {
    components = studioVehicleBase(paint);
  } else if (isCharacter && components.length < 14) {
    components = studioCharacterBase("#e8b896");
  } else if (isProduct && components.length < 6) {
    components = studioProductBase(paint);
  } else if (isFurniture && components.length < 5) {
    components = studioFurnitureBase("#8b5a2b");
  } else if (components.length < 8) {
    // Unknown category with almost no parts → generic multi-part studio object
    components = studioGenericBase(paint);
  }

  // Even if AI returned enough parts, ensure vehicles have ground tires
  if (isVehicle) {
    const hasTire = components.some((c) => /tire|wheel|torus/i.test(c.name ?? "") || c.shape === "torus");
    if (!hasTire) components = studioVehicleBase(paint);
  }

  return {
    ...clamped,
    name: clamped.name || (isVehicle ? "Studio Vehicle" : isCharacter ? "Studio Character" : "Keris Sculpt"),
    components: components.slice(0, MAX_COMPONENTS),
    detail: Math.max(0.98, clamped.detail ?? 0.98),
    virtualParticles: 50000000,
  };
}
