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
  virtualParticles: 300000000;
  front?: "+z" | "-z" | "+x" | "-x";
  components: ParticleComponent[];
  detail?: number;
  seed?: number;
};

const HEX = /^#[0-9a-f]{6}$/i;

export function isParticleSculptSpec(value: unknown): value is ParticleSculptSpec {
  const v = value as Partial<ParticleSculptSpec> | null;
  return !!v &&
    v.virtualParticles === 300000000 &&
    Array.isArray(v.components) &&
    v.components.length > 0 &&
    v.components.length <= 48 &&
    v.components.every((p) =>
      !!p &&
      typeof p.shape === "string" &&
      Array.isArray(p.position) && p.position.length === 3 &&
      Array.isArray(p.scale) && p.scale.length === 3 &&
      p.position.every(Number.isFinite) &&
      p.scale.every((n) => Number.isFinite(n) && n > 0)
    );
}

export function clampParticleSpec(spec: ParticleSculptSpec): ParticleSculptSpec {
  return {
    ...spec,
    virtualParticles: 300000000,
    components: spec.components.slice(0, 48).map((p) => ({
      ...p,
      position: p.position.map((n) => Number.isFinite(n) ? n : 0) as [number, number, number],
      scale: p.scale.map((n) => Math.max(0.002, Math.min(100, Number.isFinite(n) ? n : 1))) as [number, number, number],
      rotation: (p.rotation ?? [0, 0, 0]).map((n) => Number.isFinite(n) ? n : 0) as [number, number, number],
      material: {
        color: HEX.test(p.material?.color ?? "") ? p.material!.color : "#c7d2e3",
        metalness: Math.max(0, Math.min(1, p.material?.metalness ?? 0.15)),
        roughness: Math.max(0.04, Math.min(1, p.material?.roughness ?? 0.38)),
      },
      blend: Math.max(0, Math.min(0.35, p.blend ?? 0.06)),
    })),
    detail: Math.max(0, Math.min(1, spec.detail ?? 0.72)),
    seed: Number.isFinite(spec.seed) ? spec.seed : 1337,
  };
}
