import type { ParticleComponent } from "@/lib/particle-model";

/**
 * Production sports-car hierarchy optimized for SDF raymarch preview:
 * - Large high-contrast tires (clearly visible)
 * - Low blend so parts do not melt into one slab
 * - Real proportions: long body, greenhouse, ground contact
 */
export function studioVehicleBase(paint: string): ParticleComponent[] {
  const body = paint || "#e11d48";
  return [
    // Main lower body — long sports-car proportions
    {
      name: "main-body",
      shape: "rounded-box",
      position: [0, 0.42, 0],
      scale: [1.1, 0.26, 2.3],
      material: { color: body, metalness: 0.2, roughness: 0.28 },
      blend: 0.02,
    },
    // Hood slope
    {
      name: "hood",
      shape: "rounded-box",
      position: [0, 0.52, 0.78],
      scale: [0.95, 0.1, 0.6],
      rotation: [0.12, 0, 0],
      material: { color: body, metalness: 0.22, roughness: 0.26 },
      blend: 0.02,
    },
    // Cabin / greenhouse (dark glass)
    {
      name: "cabin-greenhouse",
      shape: "rounded-box",
      position: [0, 0.78, -0.1],
      scale: [0.88, 0.32, 0.75],
      material: { color: "#0a1628", metalness: 0.1, roughness: 0.06 },
      blend: 0.03,
    },
    // Roof
    {
      name: "roof",
      shape: "rounded-box",
      position: [0, 0.98, -0.12],
      scale: [0.78, 0.05, 0.55],
      material: { color: body, metalness: 0.22, roughness: 0.26 },
      blend: 0.02,
    },
    // Rear deck
    {
      name: "rear-deck",
      shape: "rounded-box",
      position: [0, 0.48, -0.95],
      scale: [1.0, 0.14, 0.42],
      material: { color: body, metalness: 0.2, roughness: 0.28 },
      blend: 0.02,
    },
    // Bumpers
    {
      name: "front-bumper",
      shape: "rounded-box",
      position: [0, 0.2, 1.22],
      scale: [1.05, 0.14, 0.2],
      material: { color: "#111111", metalness: 0.15, roughness: 0.55 },
      blend: 0.015,
    },
    {
      name: "rear-bumper",
      shape: "rounded-box",
      position: [0, 0.2, -1.22],
      scale: [1.05, 0.14, 0.2],
      material: { color: "#111111", metalness: 0.15, roughness: 0.55 },
      blend: 0.015,
    },
    // Side skirts
    {
      name: "side-skirt-l",
      shape: "box",
      position: [-1.0, 0.22, 0],
      scale: [0.07, 0.09, 1.5],
      material: { color: "#1a1a1a", metalness: 0.2, roughness: 0.5 },
      blend: 0.01,
    },
    {
      name: "side-skirt-r",
      shape: "box",
      position: [1.0, 0.22, 0],
      scale: [0.07, 0.09, 1.5],
      material: { color: "#1a1a1a", metalness: 0.2, roughness: 0.5 },
      blend: 0.01,
    },
    // === WHEELS — large, high contrast, ground contact ===
    ...makeWheel("fl", -0.78, 0.85, body),
    ...makeWheel("fr", 0.78, 0.85, body),
    ...makeWheel("rl", -0.78, -0.85, body),
    ...makeWheel("rr", 0.78, -0.85, body),
    // Lights
    {
      name: "headlight-l",
      shape: "ellipsoid",
      position: [-0.58, 0.36, 1.15],
      scale: [0.16, 0.1, 0.1],
      material: { color: "#f8fafc", metalness: 0.4, roughness: 0.08 },
      blend: 0.02,
    },
    {
      name: "headlight-r",
      shape: "ellipsoid",
      position: [0.58, 0.36, 1.15],
      scale: [0.16, 0.1, 0.1],
      material: { color: "#f8fafc", metalness: 0.4, roughness: 0.08 },
      blend: 0.02,
    },
    {
      name: "taillight-l",
      shape: "ellipsoid",
      position: [-0.58, 0.4, -1.2],
      scale: [0.14, 0.08, 0.06],
      material: { color: "#ef4444", metalness: 0.25, roughness: 0.15 },
      blend: 0.02,
    },
    {
      name: "taillight-r",
      shape: "ellipsoid",
      position: [0.58, 0.4, -1.2],
      scale: [0.14, 0.08, 0.06],
      material: { color: "#ef4444", metalness: 0.25, roughness: 0.15 },
      blend: 0.02,
    },
    // Mirrors
    {
      name: "mirror-l",
      shape: "box",
      position: [-1.0, 0.62, 0.35],
      scale: [0.1, 0.06, 0.14],
      material: { color: body, metalness: 0.25, roughness: 0.3 },
      blend: 0.01,
    },
    {
      name: "mirror-r",
      shape: "box",
      position: [1.0, 0.62, 0.35],
      scale: [0.1, 0.06, 0.14],
      material: { color: body, metalness: 0.25, roughness: 0.3 },
      blend: 0.01,
    },
    // Grille + spoiler
    {
      name: "grille",
      shape: "box",
      position: [0, 0.3, 1.28],
      scale: [0.6, 0.1, 0.06],
      material: { color: "#0a0a0a", metalness: 0.5, roughness: 0.4 },
      blend: 0.01,
    },
    {
      name: "spoiler",
      shape: "box",
      position: [0, 0.62, -1.15],
      scale: [0.9, 0.04, 0.14],
      material: { color: "#1a1a1a", metalness: 0.3, roughness: 0.4 },
      blend: 0.01,
    },
  ];
}

function makeWheel(
  id: string,
  x: number,
  z: number,
  paint: string,
): ParticleComponent[] {
  // Y so tire bottom sits near ground (radius ~0.34)
  const y = 0.34;
  return [
    {
      name: `${id}-tire`,
      shape: "torus",
      position: [x, y, z],
      scale: [0.42, 0.18, 0.42],
      rotation: [Math.PI / 2, 0, 0],
      material: { color: "#0a0a0a", metalness: 0, roughness: 0.95 },
      blend: 0.008,
    },
    {
      name: `${id}-rim`,
      shape: "cylinder",
      position: [x, y, z],
      scale: [0.24, 0.08, 0.24],
      rotation: [Math.PI / 2, 0, 0],
      material: { color: "#d4d4d8", metalness: 0.95, roughness: 0.12 },
      blend: 0.008,
    },
    {
      name: `${id}-fender`,
      shape: "ellipsoid",
      position: [x * 0.92, y + 0.28, z],
      scale: [0.28, 0.2, 0.42],
      material: { color: paint, metalness: 0.2, roughness: 0.3 },
      blend: 0.03,
    },
  ];
}

export function studioCharacterBase(skin: string): ParticleComponent[] {
  const s = skin || "#e8b896";
  return [
    { name: "head", shape: "ellipsoid", position: [0, 1.55, 0], scale: [0.2, 0.24, 0.2], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.04 },
    { name: "neck", shape: "cylinder", position: [0, 1.35, 0], scale: [0.07, 0.09, 0.07], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.03 },
    { name: "torso", shape: "rounded-box", position: [0, 1.05, 0], scale: [0.3, 0.34, 0.18], material: { color: "#1e3a5f", metalness: 0.1, roughness: 0.5 }, blend: 0.04 },
    { name: "pelvis", shape: "rounded-box", position: [0, 0.72, 0], scale: [0.28, 0.14, 0.16], material: { color: "#1a1a2e", metalness: 0.08, roughness: 0.55 }, blend: 0.03 },
    { name: "upper-arm-l", shape: "capsule", position: [-0.42, 1.05, 0], scale: [0.08, 0.24, 0.08], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.03 },
    { name: "upper-arm-r", shape: "capsule", position: [0.42, 1.05, 0], scale: [0.08, 0.24, 0.08], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.03 },
    { name: "forearm-l", shape: "capsule", position: [-0.46, 0.72, 0], scale: [0.07, 0.22, 0.07], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.03 },
    { name: "forearm-r", shape: "capsule", position: [0.46, 0.72, 0], scale: [0.07, 0.22, 0.07], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.03 },
    { name: "hand-l", shape: "ellipsoid", position: [-0.46, 0.48, 0], scale: [0.06, 0.09, 0.05], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.02 },
    { name: "hand-r", shape: "ellipsoid", position: [0.46, 0.48, 0], scale: [0.06, 0.09, 0.05], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.02 },
    { name: "thigh-l", shape: "capsule", position: [-0.14, 0.45, 0], scale: [0.1, 0.26, 0.1], material: { color: "#1a1a2e", metalness: 0.08, roughness: 0.55 }, blend: 0.03 },
    { name: "thigh-r", shape: "capsule", position: [0.14, 0.45, 0], scale: [0.1, 0.26, 0.1], material: { color: "#1a1a2e", metalness: 0.08, roughness: 0.55 }, blend: 0.03 },
    { name: "calf-l", shape: "capsule", position: [-0.14, 0.16, 0], scale: [0.08, 0.22, 0.08], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.03 },
    { name: "calf-r", shape: "capsule", position: [0.14, 0.16, 0], scale: [0.08, 0.22, 0.08], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.03 },
    { name: "foot-l", shape: "rounded-box", position: [-0.14, 0.04, 0.08], scale: [0.09, 0.05, 0.18], material: { color: "#222", metalness: 0.1, roughness: 0.7 }, blend: 0.02 },
    { name: "foot-r", shape: "rounded-box", position: [0.14, 0.04, 0.08], scale: [0.09, 0.05, 0.18], material: { color: "#222", metalness: 0.1, roughness: 0.7 }, blend: 0.02 },
  ];
}

export function studioProductBase(color: string): ParticleComponent[] {
  const c = color || "#c7d2e3";
  return [
    { name: "chassis", shape: "rounded-box", position: [0, 0.08, 0], scale: [0.55, 0.08, 1.1], material: { color: c, metalness: 0.3, roughness: 0.3 }, blend: 0.02 },
    { name: "screen", shape: "box", position: [0, 0.13, 0.05], scale: [0.48, 0.01, 0.9], material: { color: "#0a1520", metalness: 0.2, roughness: 0.06 }, blend: 0.01 },
    { name: "bezel", shape: "rounded-box", position: [0, 0.12, 0], scale: [0.52, 0.02, 1.02], material: { color: "#1a1a1a", metalness: 0.35, roughness: 0.35 }, blend: 0.015 },
    { name: "camera-bump", shape: "rounded-box", position: [-0.15, 0.16, -0.4], scale: [0.14, 0.04, 0.14], material: { color: "#2a2a2a", metalness: 0.4, roughness: 0.3 }, blend: 0.015 },
    { name: "lens", shape: "cylinder", position: [-0.15, 0.18, -0.4], scale: [0.05, 0.02, 0.05], material: { color: "#111122", metalness: 0.55, roughness: 0.12 }, blend: 0.01 },
    { name: "button", shape: "cylinder", position: [0.52, 0.1, 0.2], scale: [0.015, 0.03, 0.015], material: { color: "#444", metalness: 0.4, roughness: 0.4 }, blend: 0.01 },
    { name: "port", shape: "box", position: [0, 0.06, 0.55], scale: [0.12, 0.02, 0.03], material: { color: "#111", metalness: 0.5, roughness: 0.3 }, blend: 0.01 },
  ];
}

export function studioFurnitureBase(wood: string): ParticleComponent[] {
  const w = wood || "#8b5a2b";
  return [
    { name: "seat", shape: "rounded-box", position: [0, 0.45, 0], scale: [0.52, 0.07, 0.52], material: { color: w, metalness: 0.05, roughness: 0.6 }, blend: 0.025 },
    { name: "backrest", shape: "rounded-box", position: [0, 0.88, -0.24], scale: [0.5, 0.42, 0.06], material: { color: w, metalness: 0.05, roughness: 0.6 }, blend: 0.025 },
    { name: "leg-fl", shape: "cylinder", position: [-0.38, 0.22, 0.38], scale: [0.045, 0.22, 0.045], material: { color: "#2a1a0a", metalness: 0.1, roughness: 0.5 }, blend: 0.015 },
    { name: "leg-fr", shape: "cylinder", position: [0.38, 0.22, 0.38], scale: [0.045, 0.22, 0.045], material: { color: "#2a1a0a", metalness: 0.1, roughness: 0.5 }, blend: 0.015 },
    { name: "leg-rl", shape: "cylinder", position: [-0.38, 0.22, -0.38], scale: [0.045, 0.22, 0.045], material: { color: "#2a1a0a", metalness: 0.1, roughness: 0.5 }, blend: 0.015 },
    { name: "leg-rr", shape: "cylinder", position: [0.38, 0.22, -0.38], scale: [0.045, 0.22, 0.045], material: { color: "#2a1a0a", metalness: 0.1, roughness: 0.5 }, blend: 0.015 },
  ];
}

export function studioGenericBase(color: string): ParticleComponent[] {
  const c = color || "#c7d2e3";
  return [
    { name: "primary-mass", shape: "rounded-box", position: [0, 0.45, 0], scale: [0.7, 0.45, 0.9], material: { color: c, metalness: 0.2, roughness: 0.35 }, blend: 0.03 },
    { name: "secondary-form", shape: "ellipsoid", position: [0, 0.85, 0.1], scale: [0.45, 0.25, 0.4], material: { color: c, metalness: 0.18, roughness: 0.38 }, blend: 0.04 },
    { name: "accent-ring", shape: "torus", position: [0, 0.45, 0], scale: [0.55, 0.08, 0.55], rotation: [Math.PI / 2, 0, 0], material: { color: "#c0c8d4", metalness: 0.85, roughness: 0.18 }, blend: 0.015 },
    { name: "base-plate", shape: "cylinder", position: [0, 0.06, 0], scale: [0.5, 0.06, 0.5], material: { color: "#1a1a1a", metalness: 0.3, roughness: 0.5 }, blend: 0.02 },
    { name: "detail-l", shape: "capsule", position: [-0.4, 0.5, 0.2], scale: [0.06, 0.2, 0.06], material: { color: "#2a2a2a", metalness: 0.4, roughness: 0.4 }, blend: 0.02 },
    { name: "detail-r", shape: "capsule", position: [0.4, 0.5, 0.2], scale: [0.06, 0.2, 0.06], material: { color: "#2a2a2a", metalness: 0.4, roughness: 0.4 }, blend: 0.02 },
    { name: "top-cap", shape: "sphere", position: [0, 1.05, 0], scale: [0.18, 0.12, 0.18], material: { color: "#e8eef5", metalness: 0.5, roughness: 0.25 }, blend: 0.025 },
  ];
}
