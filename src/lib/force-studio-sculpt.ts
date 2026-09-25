import {
  refineParticleSculptSpec,
  type ParticleSculptSpec,
} from "@/lib/particle-model";

/**
 * Final gate before display/download.
 * - Strong AI multi-part sculpts (like the Sept 24 sports car) pass through refine as-is.
 * - Weak / slab outputs get a studio hierarchy injected by refine.
 */
export function forceStudioSculpt(
  spec: ParticleSculptSpec | null | undefined,
  userPrompt?: string,
): ParticleSculptSpec {
  const seed: ParticleSculptSpec = spec ?? {
    name: (userPrompt ?? "Zeros Sculpt").slice(0, 48),
    virtualParticles: 50000000,
    front: "+z",
    detail: 0.98,
    seed: 1337,
    components: [
      {
        name: "primary-mass",
        shape: "rounded-box",
        position: [0, 0.4, 0],
        scale: [0.5, 0.3, 0.8],
        material: { color: "#e11d48", metalness: 0.15, roughness: 0.38 },
        blend: 0.05,
      },
    ],
  };

  // Pass full hierarchy into refine — refine only replaces when weak
  return refineParticleSculptSpec(seed, userPrompt ?? seed.name);
}
