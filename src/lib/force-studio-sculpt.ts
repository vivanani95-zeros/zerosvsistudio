import {
  refineParticleSculptSpec,
  DEFAULT_VIRTUAL_PARTICLES,
  type ParticleSculptSpec,
} from "@/lib/particle-model";

/**
 * Final gate before display/download.
 * Strong AI multi-part sculpts pass through refine as-is.
 * Weak / slab outputs get a studio hierarchy.
 */
export function forceStudioSculpt(
  spec: ParticleSculptSpec | null | undefined,
  userPrompt?: string,
): ParticleSculptSpec {
  const seed: ParticleSculptSpec = spec ?? {
    name: (userPrompt ?? "Zeros Sculpt").slice(0, 48),
    virtualParticles: DEFAULT_VIRTUAL_PARTICLES,
    front: "+z",
    detail: 1,
    seed: 1337,
    components: [
      {
        name: "primary-mass",
        shape: "ellipsoid",
        position: [0, 0.4, 0],
        scale: [0.5, 0.3, 0.8],
        material: { color: "#e11d48", metalness: 0.15, roughness: 0.38 },
        blend: 0.08,
      },
    ],
  };

  return refineParticleSculptSpec(seed, userPrompt ?? seed.name);
}
