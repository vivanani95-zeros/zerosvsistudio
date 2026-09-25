import {
  studioVehicleBase,
  studioCharacterBase,
  studioProductBase,
  studioFurnitureBase,
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

/**
 * Prefer good AI multi-part hierarchy (like the Sept 24 sports car).
 * Only inject studio bases when the output is weak (few parts / all boxes / no tires).
 */
export function refineParticleSculptSpec(
  spec: ParticleSculptSpec,
  userPrompt?: string,
): ParticleSculptSpec {
  const clamped = clampParticleSpec(spec);
  const text = `${userPrompt ?? ""} ${clamped.name}`.toLowerCase();
  const isVehicle =
    /\b(car|vehicle|truck|suv|sedan|sports?\s*car|supercar|wheel|tire|bumper|hood|auto|race\s*car|motorcycle|bike)\b/.test(
      text,
    );
  const isCharacter =
    /\b(person|human|character|robot|man|woman|figure|humanoid|android|soldier|hero)\b/.test(text);
  const isProduct =
    /\b(phone|laptop|camera|gadget|watch|controller|device|tablet)\b/.test(text);
  const isFurniture =
    /\b(chair|table|sofa|lamp|bed|stool|desk|furniture)\b/.test(text);

  const paint =
    clamped.components.find((c) => /body|main|paint|chassis/i.test(c.name ?? ""))?.material?.color ??
    clamped.components[0]?.material?.color ??
    "#e11d48";

  let components = clamped.components;
  const allBoxes =
    components.length > 0 &&
    components.every((c) => c.shape === "box" || c.shape === "rounded-box");
  const hasTire = components.some(
    (c) => /tire|wheel/i.test(c.name ?? "") || c.shape === "torus",
  );
  const hasLimb = components.some((c) =>
    /arm|leg|thigh|calf|hand|foot|head/i.test(c.name ?? ""),
  );
  const fewParts = components.length < 12;
  const shapeCount = new Set(components.map((c) => c.shape)).size;

  // Weak = few parts, pure boxes, or vehicle without tires
  if (isVehicle) {
    if (!hasTire || fewParts || allBoxes || shapeCount < 3) {
      components = studioVehicleBase(paint);
    }
  } else if (isCharacter) {
    if (!hasLimb || fewParts || allBoxes) {
      components = studioCharacterBase("#e8b896");
    }
  } else if (isProduct) {
    if (fewParts || allBoxes) components = studioProductBase(paint);
  } else if (isFurniture) {
    if (components.length < 5 || allBoxes) components = studioFurnitureBase("#8b5a2b");
  } else if (fewParts || allBoxes) {
    components = studioGenericBase(paint);
  }

  return {
    ...clamped,
    name:
      clamped.name ||
      (isVehicle ? "Studio Vehicle" : isCharacter ? "Studio Character" : "Zeros Sculpt"),
    components: components.slice(0, MAX_COMPONENTS),
    detail: Math.max(0.95, clamped.detail ?? 0.98),
    virtualParticles: 50000000,
  };
}
