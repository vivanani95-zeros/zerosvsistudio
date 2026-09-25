import {
  studioVehicleBase,
  studioMotorcycleBase,
  studioCharacterBase,
  studioAnimalBase,
  studioProductBase,
  studioFurnitureBase,
  studioArchitectureBase,
  studioGenericBase,
} from "@/lib/studio-bases";

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
    name: typeof v.name === "string" && v.name.trim() ? v.name.trim() : "Zeros Sculpt",
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

type Category =
  | "vehicle" | "motorcycle" | "character" | "animal"
  | "product" | "furniture" | "architecture" | "generic";

export function detectCategory(text: string): Category {
  const t = text.toLowerCase();
  if (/\b(motorcycle|motorbike|bike)\b/.test(t) && !/\b(car|vehicle|truck)\b/.test(t)) return "motorcycle";
  if (/\b(car|vehicle|truck|suv|sedan|sports?\s*car|supercar|wheel|tire|bumper|hood|auto|race\s*car)\b/.test(t)) return "vehicle";
  if (/\b(person|human|character|robot|man|woman|figure|humanoid|android|soldier|hero|astronaut)\b/.test(t)) return "character";
  if (/\b(dog|cat|horse|bird|dragon|creature|animal|wolf|lion|tiger|bear|dinosaur)\b/.test(t)) return "animal";
  if (/\b(phone|laptop|camera|gadget|watch|controller|device|tablet|console)\b/.test(t)) return "product";
  if (/\b(chair|table|sofa|lamp|bed|stool|desk|furniture)\b/.test(t)) return "furniture";
  if (/\b(house|building|tower|castle|architecture|skyscraper|barn)\b/.test(t)) return "architecture";
  return "generic";
}

export function prioritizeComponents(comps: ParticleComponent[]): ParticleComponent[] {
  const rank = (c: ParticleComponent): number => {
    const n = (c.name ?? "").toLowerCase();
    if (/main-body|body|torso|chassis|frame|hull|primary/.test(n)) return 0;
    if (/cabin|hood|deck|underbody|seat|tank|roof/.test(n)) return 1;
    if (/tire|wheel|rim|leg|arm|foot|hand|thigh|calf/.test(n)) return 2;
    if (/head|neck|snout|tail|wing/.test(n)) return 3;
    if (/bumper|spoiler|skirt|fender|arch|fork|exhaust/.test(n)) return 4;
    if (/light|mirror|grille|window|door|lens|button/.test(n)) return 5;
    return 6;
  };
  return [...comps].sort((a, b) => rank(a) - rank(b));
}

export function normalizeSculptBounds(spec: ParticleSculptSpec): ParticleSculptSpec {
  const comps = spec.components;
  if (!comps.length) return spec;
  let minY = Infinity, maxY = -Infinity;
  for (const c of comps) {
    const sy = c.scale[1];
    minY = Math.min(minY, c.position[1] - sy);
    maxY = Math.max(maxY, c.position[1] + sy);
  }
  const height = Math.max(0.1, maxY - minY);
  const targetH = 1.6;
  const scale = Math.min(2.5, Math.max(0.4, targetH / height));
  const groundShift = -minY * scale;
  return {
    ...spec,
    components: comps.map((c) => ({
      ...c,
      position: [
        c.position[0] * scale,
        c.position[1] * scale + groundShift,
        c.position[2] * scale,
      ] as [number, number, number],
      scale: [c.scale[0] * scale, c.scale[1] * scale, c.scale[2] * scale] as [number, number, number],
    })),
  };
}

function studioFor(category: Category, paint: string): ParticleComponent[] {
  switch (category) {
    case "vehicle": return studioVehicleBase(paint);
    case "motorcycle": return studioMotorcycleBase(paint);
    case "character": return studioCharacterBase("#e8b896");
    case "animal": return studioAnimalBase(paint);
    case "product": return studioProductBase(paint);
    case "furniture": return studioFurnitureBase("#8b5a2b");
    case "architecture": return studioArchitectureBase(paint);
    default: return studioGenericBase(paint);
  }
}

/**
 * Always inject production studio hierarchy for known categories.
 * Guarantees multi-part structure (tires, limbs, roof, screen…) every time.
 */
export function refineParticleSculptSpec(
  spec: ParticleSculptSpec,
  userPrompt?: string,
): ParticleSculptSpec {
  const clamped = clampParticleSpec(spec);
  const text = `${userPrompt ?? ""} ${clamped.name}`;
  const category = detectCategory(text);

  const paint =
    clamped.components.find((c) => /body|main|paint|chassis|torso|hull/i.test(c.name ?? ""))?.material?.color ??
    clamped.components[0]?.material?.color ??
    "#e11d48";

  // Always use studio base for known categories — consistent premium structure
  const components = prioritizeComponents(studioFor(category, paint)).slice(0, MAX_COMPONENTS);

  const out: ParticleSculptSpec = {
    ...clamped,
    name: clamped.name || "Zeros Sculpt",
    components,
    detail: 1.0,
    virtualParticles: 50000000,
  };
  return normalizeSculptBounds(out);
}
