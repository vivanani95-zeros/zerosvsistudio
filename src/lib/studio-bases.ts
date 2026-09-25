import type { ParticleComponent } from "@/lib/particle-model";

/**
 * Sports-car hierarchy matching the working Sept 24 silhouette:
 * - Wheels OUTSIDE the body (x beyond body half-width) so they are visible
 * - Organic ellipsoids + moderate blend (not pure boxes)
 * - Clear cabin, spoiler, ground contact
 */
export function studioVehicleBase(paint: string): ParticleComponent[] {
  // Prefer saturated paint; avoid near-white so model reads on dark UI
  let body = paint || "#e11d48";
  if (/^#(f{3,6}|e{2}e{2}e{2}|d{2}d{2}d{2}|c{2}c{2}c{2})$/i.test(body)) {
    body = "#e11d48";
  }

  return [
    // Primary hull — slightly narrower so wheels stick out past the sides
    {
      name: "main-body",
      shape: "ellipsoid",
      position: [0, 0.4, 0.05],
      scale: [0.85, 0.28, 1.85],
      material: { color: body, metalness: 0.22, roughness: 0.28 },
      blend: 0.08,
    },
    // Lower rocker / underbody
    {
      name: "underbody",
      shape: "rounded-box",
      position: [0, 0.22, 0],
      scale: [0.82, 0.12, 1.9],
      material: { color: body, metalness: 0.18, roughness: 0.35 },
      blend: 0.06,
    },
    // Hood
    {
      name: "hood",
      shape: "ellipsoid",
      position: [0, 0.48, 0.85],
      scale: [0.78, 0.14, 0.55],
      rotation: [0.1, 0, 0],
      material: { color: body, metalness: 0.22, roughness: 0.26 },
      blend: 0.07,
    },
    // Cabin greenhouse
    {
      name: "cabin",
      shape: "ellipsoid",
      position: [0, 0.72, -0.05],
      scale: [0.7, 0.28, 0.55],
      material: { color: "#0b1520", metalness: 0.12, roughness: 0.08 },
      blend: 0.09,
    },
    // Rear deck / trunk
    {
      name: "rear-deck",
      shape: "ellipsoid",
      position: [0, 0.42, -0.95],
      scale: [0.8, 0.16, 0.45],
      material: { color: body, metalness: 0.2, roughness: 0.3 },
      blend: 0.07,
    },
    // Rear spoiler
    {
      name: "spoiler",
      shape: "rounded-box",
      position: [0, 0.58, -1.25],
      scale: [0.75, 0.04, 0.14],
      material: { color: "#1a1a1a", metalness: 0.35, roughness: 0.35 },
      blend: 0.02,
    },
    // Front bumper lip
    {
      name: "front-bumper",
      shape: "rounded-box",
      position: [0, 0.18, 1.35],
      scale: [0.88, 0.1, 0.18],
      material: { color: "#111", metalness: 0.15, roughness: 0.55 },
      blend: 0.03,
    },
    // Rear bumper
    {
      name: "rear-bumper",
      shape: "rounded-box",
      position: [0, 0.18, -1.35],
      scale: [0.88, 0.1, 0.18],
      material: { color: "#111", metalness: 0.15, roughness: 0.55 },
      blend: 0.03,
    },
    // Side skirts
    {
      name: "skirt-l",
      shape: "box",
      position: [-0.88, 0.2, 0],
      scale: [0.06, 0.08, 1.4],
      material: { color: "#1a1a1a", metalness: 0.2, roughness: 0.5 },
      blend: 0.02,
    },
    {
      name: "skirt-r",
      shape: "box",
      position: [0.88, 0.2, 0],
      scale: [0.06, 0.08, 1.4],
      material: { color: "#1a1a1a", metalness: 0.2, roughness: 0.5 },
      blend: 0.02,
    },

    // === WHEELS — x beyond body half-width (~0.85) so they stick out ===
    ...makeWheel("fl", -1.05, 0.95, body),
    ...makeWheel("fr", 1.05, 0.95, body),
    ...makeWheel("rl", -1.05, -0.95, body),
    ...makeWheel("rr", 1.05, -0.95, body),

    // Headlights (front face)
    {
      name: "hl-l",
      shape: "ellipsoid",
      position: [-0.5, 0.38, 1.4],
      scale: [0.14, 0.09, 0.08],
      material: { color: "#f1f5f9", metalness: 0.45, roughness: 0.08 },
      blend: 0.02,
    },
    {
      name: "hl-r",
      shape: "ellipsoid",
      position: [0.5, 0.38, 1.4],
      scale: [0.14, 0.09, 0.08],
      material: { color: "#f1f5f9", metalness: 0.45, roughness: 0.08 },
      blend: 0.02,
    },
    // Taillights
    {
      name: "tl-l",
      shape: "ellipsoid",
      position: [-0.5, 0.4, -1.4],
      scale: [0.12, 0.07, 0.05],
      material: { color: "#ef4444", metalness: 0.3, roughness: 0.15 },
      blend: 0.02,
    },
    {
      name: "tl-r",
      shape: "ellipsoid",
      position: [0.5, 0.4, -1.4],
      scale: [0.12, 0.07, 0.05],
      material: { color: "#ef4444", metalness: 0.3, roughness: 0.15 },
      blend: 0.02,
    },
    // Mirrors
    {
      name: "mirror-l",
      shape: "ellipsoid",
      position: [-0.95, 0.58, 0.35],
      scale: [0.08, 0.05, 0.12],
      material: { color: body, metalness: 0.25, roughness: 0.3 },
      blend: 0.02,
    },
    {
      name: "mirror-r",
      shape: "ellipsoid",
      position: [0.95, 0.58, 0.35],
      scale: [0.08, 0.05, 0.12],
      material: { color: body, metalness: 0.25, roughness: 0.3 },
      blend: 0.02,
    },
  ];
}

function makeWheel(
  id: string,
  x: number,
  z: number,
  paint: string,
): ParticleComponent[] {
  const y = 0.32;
  return [
    // Tire — large disc, clearly outside body
    {
      name: `${id}-tire`,
      shape: "torus",
      position: [x, y, z],
      scale: [0.38, 0.16, 0.38],
      rotation: [Math.PI / 2, 0, 0],
      material: { color: "#0a0a0a", metalness: 0, roughness: 0.92 },
      blend: 0.01,
    },
    // Rim
    {
      name: `${id}-rim`,
      shape: "cylinder",
      position: [x, y, z],
      scale: [0.22, 0.07, 0.22],
      rotation: [Math.PI / 2, 0, 0],
      material: { color: "#c0c8d4", metalness: 0.92, roughness: 0.15 },
      blend: 0.01,
    },
    // Wheel arch / fender bulge
    {
      name: `${id}-arch",
      shape: "ellipsoid",
      position: [x * 0.72, y + 0.22, z],
      scale: [0.22, 0.18, 0.36],
      material: { color: paint, metalness: 0.2, roughness: 0.3 },
      blend: 0.06,
    },
  ];
}

export function studioCharacterBase(skin: string): ParticleComponent[] {
  const s = skin || "#e8b896";
  return [
    { name: "head", shape: "ellipsoid", position: [0, 1.55, 0], scale: [0.2, 0.24, 0.2], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.05 },
    { name: "neck", shape: "cylinder", position: [0, 1.35, 0], scale: [0.07, 0.09, 0.07], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.04 },
    { name: "torso", shape: "ellipsoid", position: [0, 1.05, 0], scale: [0.3, 0.34, 0.18], material: { color: "#1e3a5f", metalness: 0.1, roughness: 0.5 }, blend: 0.05 },
    { name: "pelvis", shape: "ellipsoid", position: [0, 0.72, 0], scale: [0.28, 0.14, 0.16], material: { color: "#1a1a2e", metalness: 0.08, roughness: 0.55 }, blend: 0.04 },
    { name: "upper-arm-l", shape: "capsule", position: [-0.42, 1.05, 0], scale: [0.08, 0.24, 0.08], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.04 },
    { name: "upper-arm-r", shape: "capsule", position: [0.42, 1.05, 0], scale: [0.08, 0.24, 0.08], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.04 },
    { name: "forearm-l", shape: "capsule", position: [-0.46, 0.72, 0], scale: [0.07, 0.22, 0.07], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.04 },
    { name: "forearm-r", shape: "capsule", position: [0.46, 0.72, 0], scale: [0.07, 0.22, 0.07], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.04 },
    { name: "hand-l", shape: "ellipsoid", position: [-0.46, 0.48, 0], scale: [0.06, 0.09, 0.05], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.03 },
    { name: "hand-r", shape: "ellipsoid", position: [0.46, 0.48, 0], scale: [0.06, 0.09, 0.05], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.03 },
    { name: "thigh-l", shape: "capsule", position: [-0.14, 0.45, 0], scale: [0.1, 0.26, 0.1], material: { color: "#1a1a2e", metalness: 0.08, roughness: 0.55 }, blend: 0.04 },
    { name: "thigh-r", shape: "capsule", position: [0.14, 0.45, 0], scale: [0.1, 0.26, 0.1], material: { color: "#1a1a2e", metalness: 0.08, roughness: 0.55 }, blend: 0.04 },
    { name: "calf-l", shape: "capsule", position: [-0.14, 0.16, 0], scale: [0.08, 0.22, 0.08], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.04 },
    { name: "calf-r", shape: "capsule", position: [0.14, 0.16, 0], scale: [0.08, 0.22, 0.08], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.04 },
    { name: "foot-l", shape: "ellipsoid", position: [-0.14, 0.04, 0.08], scale: [0.09, 0.05, 0.18], material: { color: "#222", metalness: 0.1, roughness: 0.7 }, blend: 0.03 },
    { name: "foot-r", shape: "ellipsoid", position: [0.14, 0.04, 0.08], scale: [0.09, 0.05, 0.18], material: { color: "#222", metalness: 0.1, roughness: 0.7 }, blend: 0.03 },
  ];
}

export function studioProductBase(color: string): ParticleComponent[] {
  const c = color || "#c7d2e3";
  return [
    { name: "chassis", shape: "rounded-box", position: [0, 0.08, 0], scale: [0.55, 0.08, 1.1], material: { color: c, metalness: 0.3, roughness: 0.3 }, blend: 0.03 },
    { name: "screen", shape: "box", position: [0, 0.13, 0.05], scale: [0.48, 0.01, 0.9], material: { color: "#0a1520", metalness: 0.2, roughness: 0.06 }, blend: 0.015 },
    { name: "bezel", shape: "rounded-box", position: [0, 0.12, 0], scale: [0.52, 0.02, 1.02], material: { color: "#1a1a1a", metalness: 0.35, roughness: 0.35 }, blend: 0.02 },
    { name: "camera-bump", shape: "rounded-box", position: [-0.15, 0.16, -0.4], scale: [0.14, 0.04, 0.14], material: { color: "#2a2a2a", metalness: 0.4, roughness: 0.3 }, blend: 0.02 },
    { name: "lens", shape: "cylinder", position: [-0.15, 0.18, -0.4], scale: [0.05, 0.02, 0.05], material: { color: "#111122", metalness: 0.55, roughness: 0.12 }, blend: 0.015 },
    { name: "button", shape: "cylinder", position: [0.52, 0.1, 0.2], scale: [0.015, 0.03, 0.015], material: { color: "#444", metalness: 0.4, roughness: 0.4 }, blend: 0.015 },
    { name: "port", shape: "box", position: [0, 0.06, 0.55], scale: [0.12, 0.02, 0.03], material: { color: "#111", metalness: 0.5, roughness: 0.3 }, blend: 0.015 },
  ];
}

export function studioFurnitureBase(wood: string): ParticleComponent[] {
  const w = wood || "#8b5a2b";
  return [
    { name: "seat", shape: "rounded-box", position: [0, 0.45, 0], scale: [0.52, 0.07, 0.52], material: { color: w, metalness: 0.05, roughness: 0.6 }, blend: 0.03 },
    { name: "backrest", shape: "rounded-box", position: [0, 0.88, -0.24], scale: [0.5, 0.42, 0.06], material: { color: w, metalness: 0.05, roughness: 0.6 }, blend: 0.03 },
    { name: "leg-fl", shape: "cylinder", position: [-0.38, 0.22, 0.38], scale: [0.045, 0.22, 0.045], material: { color: "#2a1a0a", metalness: 0.1, roughness: 0.5 }, blend: 0.02 },
    { name: "leg-fr", shape: "cylinder", position: [0.38, 0.22, 0.38], scale: [0.045, 0.22, 0.045], material: { color: "#2a1a0a", metalness: 0.1, roughness: 0.5 }, blend: 0.02 },
    { name: "leg-rl", shape: "cylinder", position: [-0.38, 0.22, -0.38], scale: [0.045, 0.22, 0.045], material: { color: "#2a1a0a", metalness: 0.1, roughness: 0.5 }, blend: 0.02 },
    { name: "leg-rr", shape: "cylinder", position: [0.38, 0.22, -0.38], scale: [0.045, 0.22, 0.045], material: { color: "#2a1a0a", metalness: 0.1, roughness: 0.5 }, blend: 0.02 },
  ];
}

export function studioGenericBase(color: string): ParticleComponent[] {
  const c = color || "#c7d2e3";
  return [
    { name: "primary-mass", shape: "ellipsoid", position: [0, 0.45, 0], scale: [0.7, 0.45, 0.9], material: { color: c, metalness: 0.2, roughness: 0.35 }, blend: 0.06 },
    { name: "secondary-form", shape: "ellipsoid", position: [0, 0.85, 0.1], scale: [0.45, 0.25, 0.4], material: { color: c, metalness: 0.18, roughness: 0.38 }, blend: 0.07 },
    { name: "accent-ring", shape: "torus", position: [0, 0.45, 0], scale: [0.55, 0.08, 0.55], rotation: [Math.PI / 2, 0, 0], material: { color: "#c0c8d4", metalness: 0.85, roughness: 0.18 }, blend: 0.02 },
    { name: "base-plate", shape: "cylinder", position: [0, 0.06, 0], scale: [0.5, 0.06, 0.5], material: { color: "#1a1a1a", metalness: 0.3, roughness: 0.5 }, blend: 0.03 },
    { name: "detail-l", shape: "capsule", position: [-0.4, 0.5, 0.2], scale: [0.06, 0.2, 0.06], material: { color: "#2a2a2a", metalness: 0.4, roughness: 0.4 }, blend: 0.03 },
    { name: "detail-r", shape: "capsule", position: [0.4, 0.5, 0.2], scale: [0.06, 0.2, 0.06], material: { color: "#2a2a2a", metalness: 0.4, roughness: 0.4 }, blend: 0.03 },
    { name: "top-cap", shape: "sphere", position: [0, 1.05, 0], scale: [0.18, 0.12, 0.18], material: { color: "#e8eef5", metalness: 0.5, roughness: 0.25 }, blend: 0.04 },
  ];
}
