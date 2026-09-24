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
          : { color: p.color, metalness: p.metalness, roughness: p.roughness };
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
    name: typeof v.name === "string" && v.name.trim() ? v.name.trim() : "Keris Sculpt",
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
      scale: p.scale.map((n) => Math.max(0.002, Math.min(100, Number.isFinite(n) ? n : 1))) as [number, number, number],
      rotation: (p.rotation ?? [0, 0, 0]).map((n) => (Number.isFinite(n) ? n : 0)) as [number, number, number],
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

/** Category-aware refine: ground, center, high detail; optional userPrompt for vehicle detect. */
export function refineParticleSculptSpec(
  spec: ParticleSculptSpec,
  userPrompt?: string,
): ParticleSculptSpec {
  const clamped = clampParticleSpec(spec);
  if (!clamped.components.length) return clamped;

  const text = `${userPrompt ?? ""} ${clamped.name} ${clamped.components.map((c) => c.name ?? "").join(" ")}`.toLowerCase();
  const isVehicle = /\b(car|vehicle|truck|suv|sedan|sports?\s*car|supercar|wheel|tire|bumper|hood)\b/.test(text)
    || /\b(tire|wheel|rim|bumper|hood|cabin|fender)\b/.test(clamped.components.map((c) => (c.name ?? "").toLowerCase()).join(" "));

  let components = clamped.components;

  // ALWAYS inject studio production car base when vehicle detected (prevents rectangle/blob)
  if (isVehicle) {
    const names = components.map((c) => (c.name ?? "").toLowerCase()).join(" ");
    const hasTire = /\b(tire|tyre|wheel)\b/.test(names) && components.some((c) => c.shape === "torus");
    if (!hasTire || components.length < 20) {
      const paint = components.find((c) => /body|main|shell|paint/i.test(c.name ?? ""))?.material?.color ?? "#c41e3a";
      const base: ParticleComponent[] = [
        { name: "main-body", shape: "rounded-box", position: [0, 0.38, 0], scale: [1.05, 0.28, 2.15], material: { color: paint, metalness: 0.18, roughness: 0.32 }, blend: 0.06 },
        { name: "hood", shape: "rounded-box", position: [0, 0.48, 0.72], scale: [0.92, 0.1, 0.55], rotation: [0.08, 0, 0], material: { color: paint, metalness: 0.2, roughness: 0.3 }, blend: 0.05 },
        { name: "cabin-greenhouse", shape: "rounded-box", position: [0, 0.72, -0.05], scale: [0.82, 0.28, 0.72], material: { color: "#0d1a28", metalness: 0.15, roughness: 0.08 }, blend: 0.07 },
        { name: "rear-deck", shape: "rounded-box", position: [0, 0.42, -0.85], scale: [0.95, 0.12, 0.4], material: { color: paint, metalness: 0.18, roughness: 0.32 }, blend: 0.05 },
        { name: "front-bumper", shape: "rounded-box", position: [0, 0.18, 1.12], scale: [1.0, 0.12, 0.18], material: { color: "#1a1a1a", metalness: 0.1, roughness: 0.55 }, blend: 0.04 },
        { name: "rear-bumper", shape: "rounded-box", position: [0, 0.18, -1.12], scale: [1.0, 0.12, 0.18], material: { color: "#1a1a1a", metalness: 0.1, roughness: 0.55 }, blend: 0.04 },
        { name: "side-skirt-left", shape: "box", position: [-0.95, 0.2, 0], scale: [0.08, 0.08, 1.4], material: { color: "#1a1a1a", metalness: 0.15, roughness: 0.5 }, blend: 0.04 },
        { name: "side-skirt-right", shape: "box", position: [0.95, 0.2, 0], scale: [0.08, 0.08, 1.4], material: { color: "#1a1a1a", metalness: 0.15, roughness: 0.5 }, blend: 0.04 },
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
      );
      const baseNames = new Set(base.map((c) => (c.name ?? "").toLowerCase()));
      const extras = components.filter((c) => {
        const n = (c.name ?? "").toLowerCase();
        if (baseNames.has(n)) return false;
        if (c.scale[0] > 1.5 && c.scale[1] > 1.0 && c.scale[2] > 1.5) return false;
        return true;
      });
      components = [...base, ...extras].slice(0, MAX_COMPONENTS);
    }
  }

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const c of components) {
    const [sx, sy, sz] = c.scale;
    const [px, py, pz] = c.position;
    const rx = Math.max(sx, 0.01), ry = Math.max(sy, 0.01), rz = Math.max(sz, 0.01);
    minX = Math.min(minX, px - rx); maxX = Math.max(maxX, px + rx);
    minY = Math.min(minY, py - ry); maxY = Math.max(maxY, py + ry);
    minZ = Math.min(minZ, pz - rz); maxZ = Math.max(maxZ, pz + rz);
  }

  const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-3);
  const targetSize = isVehicle ? 2.6 : 2.2;
  const scale = targetSize / maxDim;
  const centerX = (minX + maxX) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;
  const groundY = minY;

  const out = components.map((c) => {
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
    const organic = /muscle|flesh|skin|organic|cloud/.test(name);
    const isTire = /tire|tyre/.test(name) || (c.shape === "torus" && /wheel/.test(name));
    const isRim = /rim/.test(name) || (c.shape === "cylinder" && /wheel|hub/.test(name));
    const isGlass = /glass|cabin|window|screen/.test(name);
    let blend = organic ? Math.min(0.18, Math.max(0.06, c.blend ?? 0.1)) : Math.min(0.1, Math.max(0.02, c.blend ?? 0.05));
    if (isTire || isRim) blend = Math.min(blend, 0.035);
    let material = {
      color: c.material?.color ?? "#c7d2e3",
      metalness: c.material?.metalness ?? 0.15,
      roughness: c.material?.roughness ?? 0.38,
    };
    if (isTire) material = { color: "#111111", metalness: 0, roughness: 0.92 };
    else if (isRim) material = { color: material.color === "#c7d2e3" ? "#c0c8d4" : material.color, metalness: Math.max(0.75, material.metalness), roughness: Math.min(0.25, material.roughness) };
    else if (isGlass) material = { color: material.color.startsWith("#0") || material.color.startsWith("#1") ? material.color : "#0d1a28", metalness: Math.min(0.25, Math.max(0.08, material.metalness)), roughness: Math.min(0.14, material.roughness) };
    return { ...c, position, scale: scaleV, blend, material };
  });

  for (const c of out) {
    const n = (c.name ?? "").toLowerCase();
    if (c.shape === "torus" && /tire|tyre|wheel/.test(n)) {
      const bottom = c.position[1] - c.scale[1];
      if (Math.abs(bottom) > 0.02) c.position[1] -= bottom;
    }
  }

  return {
    ...clamped,
    components: out,
    detail: Math.max(0.95, clamped.detail ?? 0.95),
    virtualParticles: 1000000,
  };
}
