import type { ParticleComponent } from "@/lib/particle-model";

/** Saturated paint — near-white reads as a blob on dark UI. */
function safePaint(paint: string, fallback = "#e11d48"): string {
  const p = paint || fallback;
  if (/^#(f{3,6}|e{2}e{2}e{2}|d{2}d{2}d{2}|c{2}c{2}c{2}|b{2}b{2}b{2})$/i.test(p)) return fallback;
  return p;
}

/** Sports / sedan / supercar — wheels OUTSIDE body, organic ellipsoids, clear silhouette. */
export function studioVehicleBase(paint: string): ParticleComponent[] {
  const body = safePaint(paint, "#e11d48");
  return [
    { name: "main-body", shape: "ellipsoid", position: [0, 0.38, 0.05], scale: [0.82, 0.26, 1.9], material: { color: body, metalness: 0.22, roughness: 0.28 }, blend: 0.09 },
    { name: "underbody", shape: "rounded-box", position: [0, 0.2, 0], scale: [0.78, 0.1, 1.95], material: { color: body, metalness: 0.18, roughness: 0.35 }, blend: 0.06 },
    { name: "hood", shape: "ellipsoid", position: [0, 0.46, 0.9], scale: [0.74, 0.12, 0.55], rotation: [0.12, 0, 0], material: { color: body, metalness: 0.22, roughness: 0.26 }, blend: 0.08 },
    { name: "cabin", shape: "ellipsoid", position: [0, 0.68, -0.08], scale: [0.66, 0.26, 0.52], material: { color: "#0b1520", metalness: 0.12, roughness: 0.07 }, blend: 0.1 },
    { name: "rear-deck", shape: "ellipsoid", position: [0, 0.4, -0.98], scale: [0.76, 0.14, 0.42], material: { color: body, metalness: 0.2, roughness: 0.3 }, blend: 0.08 },
    { name: "spoiler", shape: "rounded-box", position: [0, 0.55, -1.28], scale: [0.72, 0.035, 0.12], material: { color: "#1a1a1a", metalness: 0.4, roughness: 0.35 }, blend: 0.02 },
    { name: "front-bumper", shape: "rounded-box", position: [0, 0.16, 1.38], scale: [0.84, 0.09, 0.16], material: { color: "#111", metalness: 0.15, roughness: 0.55 }, blend: 0.03 },
    { name: "rear-bumper", shape: "rounded-box", position: [0, 0.16, -1.38], scale: [0.84, 0.09, 0.16], material: { color: "#111", metalness: 0.15, roughness: 0.55 }, blend: 0.03 },
    { name: "skirt-l", shape: "box", position: [-0.84, 0.18, 0], scale: [0.05, 0.07, 1.35], material: { color: "#1a1a1a", metalness: 0.2, roughness: 0.5 }, blend: 0.02 },
    { name: "skirt-r", shape: "box", position: [0.84, 0.18, 0], scale: [0.05, 0.07, 1.35], material: { color: "#1a1a1a", metalness: 0.2, roughness: 0.5 }, blend: 0.02 },
    ...wheel("fl", -1.02, 0.98, body),
    ...wheel("fr", 1.02, 0.98, body),
    ...wheel("rl", -1.02, -0.98, body),
    ...wheel("rr", 1.02, -0.98, body),
    { name: "hl-l", shape: "ellipsoid", position: [-0.48, 0.36, 1.42], scale: [0.13, 0.08, 0.07], material: { color: "#f1f5f9", metalness: 0.5, roughness: 0.08 }, blend: 0.02 },
    { name: "hl-r", shape: "ellipsoid", position: [0.48, 0.36, 1.42], scale: [0.13, 0.08, 0.07], material: { color: "#f1f5f9", metalness: 0.5, roughness: 0.08 }, blend: 0.02 },
    { name: "tl-l", shape: "ellipsoid", position: [-0.48, 0.38, -1.42], scale: [0.11, 0.06, 0.05], material: { color: "#ef4444", metalness: 0.3, roughness: 0.15 }, blend: 0.02 },
    { name: "tl-r", shape: "ellipsoid", position: [0.48, 0.38, -1.42], scale: [0.11, 0.06, 0.05], material: { color: "#ef4444", metalness: 0.3, roughness: 0.15 }, blend: 0.02 },
    { name: "mirror-l", shape: "ellipsoid", position: [-0.9, 0.55, 0.32], scale: [0.07, 0.04, 0.1], material: { color: body, metalness: 0.25, roughness: 0.3 }, blend: 0.02 },
    { name: "mirror-r", shape: "ellipsoid", position: [0.9, 0.55, 0.32], scale: [0.07, 0.04, 0.1], material: { color: body, metalness: 0.25, roughness: 0.3 }, blend: 0.02 },
    { name: "grille", shape: "box", position: [0, 0.28, 1.4], scale: [0.5, 0.08, 0.05], material: { color: "#0a0a0a", metalness: 0.5, roughness: 0.4 }, blend: 0.015 },
  ];
}

function wheel(id: string, x: number, z: number, paint: string): ParticleComponent[] {
  const y = 0.3;
  return [
    { name: id + "-tire", shape: "torus", position: [x, y, z], scale: [0.36, 0.15, 0.36], rotation: [Math.PI / 2, 0, 0], material: { color: "#0a0a0a", metalness: 0, roughness: 0.92 }, blend: 0.01 },
    { name: id + "-rim", shape: "cylinder", position: [x, y, z], scale: [0.2, 0.06, 0.2], rotation: [Math.PI / 2, 0, 0], material: { color: "#c0c8d4", metalness: 0.92, roughness: 0.14 }, blend: 0.01 },
    { name: id + "-arch", shape: "ellipsoid", position: [x * 0.7, y + 0.2, z], scale: [0.2, 0.16, 0.34], material: { color: paint, metalness: 0.2, roughness: 0.3 }, blend: 0.07 },
  ];
}

/** Motorcycle / bike */
export function studioMotorcycleBase(paint: string): ParticleComponent[] {
  const body = safePaint(paint, "#2563eb");
  return [
    { name: "frame", shape: "capsule", position: [0, 0.45, 0], scale: [0.08, 0.12, 0.7], material: { color: "#1a1a1a", metalness: 0.7, roughness: 0.25 }, blend: 0.04 },
    { name: "tank", shape: "ellipsoid", position: [0, 0.62, 0.15], scale: [0.18, 0.16, 0.35], material: { color: body, metalness: 0.25, roughness: 0.3 }, blend: 0.06 },
    { name: "seat", shape: "ellipsoid", position: [0, 0.58, -0.35], scale: [0.16, 0.08, 0.28], material: { color: "#1a1a1a", metalness: 0.1, roughness: 0.7 }, blend: 0.05 },
    { name: "front-wheel", shape: "torus", position: [0, 0.28, 0.75], scale: [0.32, 0.12, 0.32], rotation: [Math.PI / 2, 0, 0], material: { color: "#0a0a0a", metalness: 0, roughness: 0.9 }, blend: 0.01 },
    { name: "front-rim", shape: "cylinder", position: [0, 0.28, 0.75], scale: [0.18, 0.05, 0.18], rotation: [Math.PI / 2, 0, 0], material: { color: "#c0c8d4", metalness: 0.9, roughness: 0.15 }, blend: 0.01 },
    { name: "rear-wheel", shape: "torus", position: [0, 0.28, -0.7], scale: [0.34, 0.13, 0.34], rotation: [Math.PI / 2, 0, 0], material: { color: "#0a0a0a", metalness: 0, roughness: 0.9 }, blend: 0.01 },
    { name: "rear-rim", shape: "cylinder", position: [0, 0.28, -0.7], scale: [0.19, 0.05, 0.19], rotation: [Math.PI / 2, 0, 0], material: { color: "#c0c8d4", metalness: 0.9, roughness: 0.15 }, blend: 0.01 },
    { name: "fork", shape: "capsule", position: [0, 0.5, 0.55], scale: [0.04, 0.22, 0.04], rotation: [0.3, 0, 0], material: { color: "#888", metalness: 0.8, roughness: 0.2 }, blend: 0.03 },
    { name: "handlebar", shape: "capsule", position: [0, 0.78, 0.55], scale: [0.28, 0.03, 0.03], material: { color: "#222", metalness: 0.4, roughness: 0.4 }, blend: 0.03 },
    { name: "headlight", shape: "sphere", position: [0, 0.55, 0.85], scale: [0.08, 0.08, 0.06], material: { color: "#f8fafc", metalness: 0.4, roughness: 0.1 }, blend: 0.02 },
    { name: "exhaust", shape: "cylinder", position: [0.12, 0.28, -0.2], scale: [0.04, 0.04, 0.4], material: { color: "#aaa", metalness: 0.85, roughness: 0.2 }, blend: 0.03 },
    { name: "engine", shape: "rounded-box", position: [0, 0.35, 0.1], scale: [0.14, 0.14, 0.2], material: { color: "#333", metalness: 0.5, roughness: 0.35 }, blend: 0.04 },
  ];
}

/** Humanoid / robot */
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

/** Quad animal / creature */
export function studioAnimalBase(fur: string): ParticleComponent[] {
  const f = fur || "#8b6914";
  return [
    { name: "torso", shape: "ellipsoid", position: [0, 0.55, 0], scale: [0.28, 0.28, 0.7], material: { color: f, metalness: 0.05, roughness: 0.7 }, blend: 0.08 },
    { name: "head", shape: "ellipsoid", position: [0, 0.7, 0.75], scale: [0.2, 0.18, 0.22], material: { color: f, metalness: 0.05, roughness: 0.7 }, blend: 0.06 },
    { name: "snout", shape: "ellipsoid", position: [0, 0.62, 0.95], scale: [0.1, 0.08, 0.14], material: { color: f, metalness: 0.05, roughness: 0.7 }, blend: 0.05 },
    { name: "ear-l", shape: "cone", position: [-0.12, 0.88, 0.7], scale: [0.05, 0.1, 0.05], material: { color: f, metalness: 0.05, roughness: 0.7 }, blend: 0.04 },
    { name: "ear-r", shape: "cone", position: [0.12, 0.88, 0.7], scale: [0.05, 0.1, 0.05], material: { color: f, metalness: 0.05, roughness: 0.7 }, blend: 0.04 },
    { name: "leg-fl", shape: "capsule", position: [-0.18, 0.28, 0.4], scale: [0.07, 0.28, 0.07], material: { color: f, metalness: 0.05, roughness: 0.7 }, blend: 0.04 },
    { name: "leg-fr", shape: "capsule", position: [0.18, 0.28, 0.4], scale: [0.07, 0.28, 0.07], material: { color: f, metalness: 0.05, roughness: 0.7 }, blend: 0.04 },
    { name: "leg-rl", shape: "capsule", position: [-0.18, 0.28, -0.4], scale: [0.07, 0.28, 0.07], material: { color: f, metalness: 0.05, roughness: 0.7 }, blend: 0.04 },
    { name: "leg-rr", shape: "capsule", position: [0.18, 0.28, -0.4], scale: [0.07, 0.28, 0.07], material: { color: f, metalness: 0.05, roughness: 0.7 }, blend: 0.04 },
    { name: "tail", shape: "capsule", position: [0, 0.55, -0.75], scale: [0.05, 0.05, 0.25], material: { color: f, metalness: 0.05, roughness: 0.7 }, blend: 0.05 },
    { name: "eye-l", shape: "sphere", position: [-0.08, 0.74, 0.9], scale: [0.03, 0.03, 0.03], material: { color: "#111", metalness: 0.2, roughness: 0.3 }, blend: 0.02 },
    { name: "eye-r", shape: "sphere", position: [0.08, 0.74, 0.9], scale: [0.03, 0.03, 0.03], material: { color: "#111", metalness: 0.2, roughness: 0.3 }, blend: 0.02 },
  ];
}

/** Phone / laptop / gadget */
export function studioProductBase(color: string): ParticleComponent[] {
  const c = safePaint(color, "#c7d2e3");
  return [
    { name: "chassis", shape: "rounded-box", position: [0, 0.08, 0], scale: [0.55, 0.08, 1.1], material: { color: c, metalness: 0.35, roughness: 0.28 }, blend: 0.025 },
    { name: "screen", shape: "box", position: [0, 0.13, 0.05], scale: [0.48, 0.01, 0.9], material: { color: "#0a1520", metalness: 0.2, roughness: 0.06 }, blend: 0.012 },
    { name: "bezel", shape: "rounded-box", position: [0, 0.12, 0], scale: [0.52, 0.02, 1.02], material: { color: "#1a1a1a", metalness: 0.35, roughness: 0.35 }, blend: 0.018 },
    { name: "camera-bump", shape: "rounded-box", position: [-0.15, 0.16, -0.4], scale: [0.14, 0.04, 0.14], material: { color: "#2a2a2a", metalness: 0.4, roughness: 0.3 }, blend: 0.018 },
    { name: "lens", shape: "cylinder", position: [-0.15, 0.18, -0.4], scale: [0.05, 0.02, 0.05], material: { color: "#111122", metalness: 0.55, roughness: 0.12 }, blend: 0.012 },
    { name: "button", shape: "cylinder", position: [0.52, 0.1, 0.2], scale: [0.015, 0.03, 0.015], material: { color: "#444", metalness: 0.4, roughness: 0.4 }, blend: 0.012 },
    { name: "port", shape: "box", position: [0, 0.06, 0.55], scale: [0.12, 0.02, 0.03], material: { color: "#111", metalness: 0.5, roughness: 0.3 }, blend: 0.012 },
  ];
}

/** Chair / table / furniture */
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

/** Building / house */
export function studioArchitectureBase(color: string): ParticleComponent[] {
  const c = safePaint(color, "#c4a574");
  return [
    { name: "main-volume", shape: "box", position: [0, 0.6, 0], scale: [1.2, 0.6, 0.9], material: { color: c, metalness: 0.05, roughness: 0.65 }, blend: 0.02 },
    { name: "roof", shape: "cone", position: [0, 1.35, 0], scale: [0.95, 0.35, 0.75], material: { color: "#5c4033", metalness: 0.05, roughness: 0.7 }, blend: 0.03 },
    { name: "door", shape: "box", position: [0, 0.35, 0.91], scale: [0.22, 0.35, 0.04], material: { color: "#3d2914", metalness: 0.1, roughness: 0.6 }, blend: 0.015 },
    { name: "window-l", shape: "box", position: [-0.55, 0.7, 0.91], scale: [0.2, 0.18, 0.03], material: { color: "#1a2838", metalness: 0.15, roughness: 0.1 }, blend: 0.015 },
    { name: "window-r", shape: "box", position: [0.55, 0.7, 0.91], scale: [0.2, 0.18, 0.03], material: { color: "#1a2838", metalness: 0.15, roughness: 0.1 }, blend: 0.015 },
    { name: "steps", shape: "box", position: [0, 0.06, 1.05], scale: [0.35, 0.06, 0.15], material: { color: "#888", metalness: 0.1, roughness: 0.6 }, blend: 0.015 },
    { name: "chimney", shape: "box", position: [0.4, 1.5, -0.15], scale: [0.12, 0.25, 0.12], material: { color: "#6b4423", metalness: 0.05, roughness: 0.7 }, blend: 0.02 },
  ];
}

/** Abstract / fallback */
export function studioGenericBase(color: string): ParticleComponent[] {
  const c = safePaint(color, "#6366f1");
  return [
    { name: "primary-mass", shape: "ellipsoid", position: [0, 0.45, 0], scale: [0.65, 0.4, 0.85], material: { color: c, metalness: 0.25, roughness: 0.32 }, blend: 0.07 },
    { name: "secondary", shape: "ellipsoid", position: [0, 0.85, 0.05], scale: [0.4, 0.22, 0.35], material: { color: c, metalness: 0.2, roughness: 0.35 }, blend: 0.08 },
    { name: "accent-ring", shape: "torus", position: [0, 0.45, 0], scale: [0.5, 0.07, 0.5], rotation: [Math.PI / 2, 0, 0], material: { color: "#c0c8d4", metalness: 0.85, roughness: 0.18 }, blend: 0.02 },
    { name: "base-plate", shape: "cylinder", position: [0, 0.05, 0], scale: [0.45, 0.05, 0.45], material: { color: "#1a1a1a", metalness: 0.3, roughness: 0.5 }, blend: 0.025 },
    { name: "detail-l", shape: "capsule", position: [-0.35, 0.5, 0.15], scale: [0.05, 0.18, 0.05], material: { color: "#2a2a2a", metalness: 0.4, roughness: 0.4 }, blend: 0.03 },
    { name: "detail-r", shape: "capsule", position: [0.35, 0.5, 0.15], scale: [0.05, 0.18, 0.05], material: { color: "#2a2a2a", metalness: 0.4, roughness: 0.4 }, blend: 0.03 },
    { name: "top-cap", shape: "sphere", position: [0, 1.05, 0], scale: [0.16, 0.1, 0.16], material: { color: "#e8eef5", metalness: 0.5, roughness: 0.25 }, blend: 0.04 },
  ];
}
