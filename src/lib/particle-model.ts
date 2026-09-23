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

export function isParticleSculptSpec(value: unknown): value is ParticleSculptSpec {
  const v = value as Partial<ParticleSculptSpec> | null;
  return !!v &&
    (v.virtualParticles === 1000000 || v.virtualParticles === 300000000) &&
    Array.isArray(v.components) &&
    v.components.length > 0 &&
    v.components.length <= MAX_COMPONENTS &&
    v.components.every((p) =>
      !!p &&
      typeof p.shape === "string" &&
      Array.isArray(p.position) && p.position.length === 3 &&
      Array.isArray(p.scale) && p.scale.length === 3 &&
      p.position.every(Number.isFinite) &&
      p.scale.every((n) => Number.isFinite(n) && n > 0)
    );
}

export function normalizeParticleSculptSpec(value: unknown): ParticleSculptSpec | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const raw = Array.isArray(v.components) ? v.components : [];
  const allowed = new Set<ParticleShape>([
    "sphere", "ellipsoid", "box", "capsule", "cylinder", "torus", "cone", "rounded-box",
  ]);
  const components: ParticleComponent[] = raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .slice(0, MAX_COMPONENTS)
    .map((p, i) => {
      const pos = Array.isArray(p.position) ? p.position : [0, 0, 0];
      const scale = Array.isArray(p.scale) ? p.scale : [1, 1, 1];
      const rot = Array.isArray(p.rotation) ? p.rotation : [0, 0, 0];
      const n = (x: unknown, fallback: number) => typeof x === "number" && Number.isFinite(x) ? x : fallback;
      const shape = typeof p.shape === "string" && allowed.has(p.shape as ParticleShape)
        ? p.shape as ParticleShape
        : "ellipsoid";
      const mat = p.material && typeof p.material === "object" ? p.material as Record<string, unknown> : {};
      return {
        name: typeof p.name === "string" ? p.name : `Component ${i + 1}`,
        shape,
        position: [n(pos[0], 0), n(pos[1], 0), n(pos[2], 0)],
        scale: [Math.max(0.002, Math.abs(n(scale[0], 1))), Math.max(0.002, Math.abs(n(scale[1], 1))), Math.max(0.002, Math.abs(n(scale[2], 1)))],
        rotation: [n(rot[0], 0), n(rot[1], 0), n(rot[2], 0)],
        material: {
          color: typeof mat.color === "string" && HEX.test(mat.color) ? mat.color : "#c7d2e3",
          metalness: Math.max(0, Math.min(1, n(mat.metalness, 0.15))),
          roughness: Math.max(0.04, Math.min(1, n(mat.roughness, 0.38))),
        },
        blend: Math.max(0, Math.min(0.28, n(p.blend, 0.05))),
      };
    });
  if (!components.length) return null;
  const front = v.front === "+z" || v.front === "-z" || v.front === "+x" || v.front === "-x"
    ? v.front : "+z";
  return {
    name: typeof v.name === "string" && v.name.trim() ? v.name : "Zeros Sculpt",
    virtualParticles: 1000000,
    front,
    components,
    detail: Math.max(0.5, Math.min(1, typeof v.detail === "number" ? v.detail : 0.92)),
    seed: typeof v.seed === "number" && Number.isFinite(v.seed) ? v.seed : 1337,
  };
}

export function clampParticleSpec(spec: ParticleSculptSpec): ParticleSculptSpec {
  return {
    ...spec,
    virtualParticles: 1000000,
    components: spec.components.slice(0, MAX_COMPONENTS).map((p) => ({
      ...p,
      position: p.position.map((n) => Number.isFinite(n) ? n : 0) as [number, number, number],
      scale: p.scale.map((n) => Math.max(0.002, Math.min(100, Number.isFinite(n) ? n : 1))) as [number, number, number],
      rotation: (p.rotation ?? [0, 0, 0]).map((n) => Number.isFinite(n) ? n : 0) as [number, number, number],
      material: {
        color: HEX.test(p.material?.color ?? "") ? p.material!.color : "#c7d2e3",
        metalness: Math.max(0, Math.min(1, p.material?.metalness ?? 0.15)),
        roughness: Math.max(0.04, Math.min(1, p.material?.roughness ?? 0.38)),
      },
      blend: Math.max(0, Math.min(0.28, p.blend ?? 0.05)),
    })),
    detail: Math.max(0.5, Math.min(1, spec.detail ?? 0.92)),
    seed: Number.isFinite(spec.seed) ? spec.seed : 1337,
  };
}
