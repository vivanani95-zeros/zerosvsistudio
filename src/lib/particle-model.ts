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
  virtualParticles: 1000000;
  front?: "+z" | "-z" | "+x" | "-x";
  components: ParticleComponent[];
  detail?: number;
  seed?: number;
};

/** Hard cap for GPU uniforms + clean-topology export. */
export const MAX_COMPONENTS = 64;

const HEX = /^#[0-9a-f]{6}$/i;
const ALLOWED = new Set<ParticleShape>([
  "sphere", "ellipsoid", "box", "capsule", "cylinder", "torus", "cone", "rounded-box",
]);

function asNum(x: unknown, fallback: number): number {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && x.trim() && Number.isFinite(Number(x))) return Number(x);
  return fallback;
}

function asVec3(x: unknown, fallback: [number, number, number]): [number, number, number] {
  if (Array.isArray(x) && x.length >= 3) {
    return [asNum(x[0], fallback[0]), asNum(x[1], fallback[1]), asNum(x[2], fallback[2])];
  }
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    if ("x" in o || "y" in o || "z" in o) {
      return [asNum(o.x, fallback[0]), asNum(o.y, fallback[1]), asNum(o.z, fallback[2])];
    }
  }
  return fallback;
}

function asShape(x: unknown): ParticleShape {
  if (typeof x === "string") {
    const s = x.toLowerCase().trim().replace(/_/g, "-") as ParticleShape;
    if (ALLOWED.has(s)) return s;
    if (s === "cube" || s === "cuboid") return "box";
    if (s === "ball") return "sphere";
    if (s === "tube" || s === "pipe") return "cylinder";
  }
  return "ellipsoid";
}

function asColor(x: unknown): string {
  if (typeof x === "string") {
    const c = x.trim();
    if (HEX.test(c)) return c;
    if (/^[0-9a-f]{6}$/i.test(c)) return `#${c}`;
    if (/^#[0-9a-f]{3}$/i.test(c)) {
      const h = c.slice(1);
      return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
    }
  }
  return "#c7d2e3";
}

/** Pull the first balanced JSON object from free-form model text. */
export function extractJsonObject(text: string): string | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const inner = fenced[1].trim();
    if (inner.startsWith("{")) return extractJsonObject(inner) ?? inner;
  }
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function isParticleSculptSpec(value: unknown): value is ParticleSculptSpec {
  return normalizeParticleSculptSpec(value) !== null;
}

/** Accept imperfect provider JSON and coerce it into a valid sculpt. */
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

  const raw = Array.isArray(v.components)
    ? v.components
    : Array.isArray(v.parts)
      ? v.parts
      : Array.isArray(v.shapes)
        ? v.shapes
        : [];

  const components: ParticleComponent[] = raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .slice(0, MAX_COMPONENTS)
    .map((p, i) => {
      const scale = asVec3(p.scale ?? p.size ?? p.dimensions, [0.4, 0.4, 0.4]).map((n) =>
        Math.max(0.002, Math.min(100, Math.abs(n) || 0.4)),
      ) as [number, number, number];
      const position = asVec3(p.position ?? p.pos ?? p.center, [0, 0, 0]);
      const rotation = asVec3(p.rotation ?? p.rot ?? p.euler, [0, 0, 0]);
      const mat =
        p.material && typeof p.material === "object"
          ? (p.material as Record<string, unknown>)
          : {
              color: p.color,
              metalness: p.metalness,
              roughness: p.roughness,
            };
      return {
        name: typeof p.name === "string" ? p.name : `Component ${i + 1}`,
        shape: asShape(p.shape ?? p.type ?? p.primitive),
        position,
        scale,
        rotation,
        material: {
          color: asColor(mat.color),
          metalness: Math.max(0, Math.min(1, asNum(mat.metalness, 0.15))),
          roughness: Math.max(0.04, Math.min(1, asNum(mat.roughness, 0.38))),
        },
        blend: Math.max(0, Math.min(0.28, asNum(p.blend ?? p.smooth, 0.05))),
      };
    });

  if (!components.length) return null;

  const front =
    v.front === "+z" || v.front === "-z" || v.front === "+x" || v.front === "-x"
      ? v.front
      : "+z";

  return {
    name: typeof v.name === "string" && v.name.trim() ? v.name.trim() : "Zeros Sculpt",
    virtualParticles: 1000000,
    front,
    components,
    detail: Math.max(0.5, Math.min(1, asNum(v.detail, 0.94))),
    seed: Number.isFinite(asNum(v.seed, 1337)) ? asNum(v.seed, 1337) : 1337,
  };
}

export function clampParticleSpec(spec: ParticleSculptSpec): ParticleSculptSpec {
  return {
    ...spec,
    virtualParticles: 1000000,
    components: spec.components.slice(0, MAX_COMPONENTS).map((p) => ({
      ...p,
      position: p.position.map((n) => (Number.isFinite(n) ? n : 0)) as [number, number, number],
      scale: p.scale.map((n) => Math.max(0.002, Math.min(100, Number.isFinite(n) ? n : 1))) as [
        number,
        number,
        number,
      ],
      rotation: (p.rotation ?? [0, 0, 0]).map((n) => (Number.isFinite(n) ? n : 0)) as [
        number,
        number,
        number,
      ],
      material: {
        color: HEX.test(p.material?.color ?? "") ? p.material!.color! : "#c7d2e3",
        metalness: Math.max(0, Math.min(1, p.material?.metalness ?? 0.15)),
        roughness: Math.max(0.04, Math.min(1, p.material?.roughness ?? 0.38)),
      },
      blend: Math.max(0, Math.min(0.28, p.blend ?? 0.05)),
    })),
    detail: Math.max(0.5, Math.min(1, spec.detail ?? 0.94)),
    seed: Number.isFinite(spec.seed) ? spec.seed! : 1337,
  };
}

/**
 * Post-process a valid sculpt into a production-readable layout:
 * normalize size, ground contact, center XZ, readable hard-surface blends, high detail.
 */
export function refineParticleSculptSpec(spec: ParticleSculptSpec): ParticleSculptSpec {
  const clamped = clampParticleSpec(spec);
  if (!clamped.components.length) return clamped;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const c of clamped.components) {
    const [sx, sy, sz] = c.scale;
    const [px, py, pz] = c.position;
    const r = Math.max(sx, sy, sz);
    minX = Math.min(minX, px - r);
    maxX = Math.max(maxX, px + r);
    minY = Math.min(minY, py - r);
    maxY = Math.max(maxY, py + r);
    minZ = Math.min(minZ, pz - r);
    maxZ = Math.max(maxZ, pz + r);
  }

  const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-3);
  const scale = 2.2 / maxDim;
  const centerX = (minX + maxX) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;
  const groundY = minY;

  const components = clamped.components.map((c) => {
    const position: [number, number, number] = [
      (c.position[0] - centerX) * scale,
      (c.position[1] - groundY) * scale,
      (c.position[2] - centerZ) * scale,
    ];
    const scaleV: [number, number, number] = [
      Math.max(0.002, c.scale[0] * scale),
      Math.max(0.002, c.scale[1] * scale),
      Math.max(0.002, c.scale[2] * scale),
    ];
    const name = (c.name ?? "").toLowerCase();
    const organic =
      name.includes("muscle") ||
      name.includes("flesh") ||
      name.includes("skin") ||
      name.includes("organic") ||
      name.includes("cloud");
    const blend = organic
      ? Math.min(0.2, Math.max(0.06, c.blend ?? 0.1))
      : Math.min(0.12, Math.max(0.02, c.blend ?? 0.05));

    return {
      ...c,
      position,
      scale: scaleV,
      blend,
      material: {
        color: c.material?.color ?? "#c7d2e3",
        metalness: c.material?.metalness ?? 0.15,
        roughness: c.material?.roughness ?? 0.38,
      },
    };
  });

  return {
    ...clamped,
    components,
    detail: Math.max(0.94, clamped.detail ?? 0.94),
    virtualParticles: 1000000,
  };
}
