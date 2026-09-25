import {
  refineParticleSculptSpec,
  type ParticleSculptSpec,
} from "@/lib/particle-model";

/**
 * Guaranteed production sculpt for any user prompt.
 * Always runs refine → category studio base (vehicle/character/product/…).
 * Use this at the end of generation AND when displaying/downloading.
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
        material: { color: "#c41e3a", metalness: 0.15, roughness: 0.38 },
        blend: 0.05,
      },
    ],
  };
  // Truncate to force refine to inject full studio hierarchy when weak
  const weak: ParticleSculptSpec = {
    ...seed,
    components: seed.components.slice(0, Math.min(3, seed.components.length)),
  };
  return refineParticleSculptSpec(weak, userPrompt ?? seed.name);
}
