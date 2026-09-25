import type { ParticleComponent } from "@/lib/particle-model";

function safePaint(paint: string, fallback = "#e11d48"): string {
  const p = paint || fallback;
  if (/^#(f{3,6}|e{2}e{2}e{2}|d{2}d{2}d{2}|c{2}c{2}c{2}|b{2}b{2}b{2})$/i.test(p)) return fallback;
  return p;
}

/** Hard-surface sports car — low blend, wheels outside, crisp silhouette. */
export function studioVehicleBase(paint: string): ParticleComponent[] {
  const body = safePaint(paint, "#e11d48");
  const B = 0.012;
  return [
    { name: "main-body", shape: "rounded-box", position: [0, 0.36, 0.05], scale: [0.78, 0.22, 1.85], material: { color: body, metalness: 0.25, roughness: 0.28 }, blend: B },
    { name: "hood", shape: "rounded-box", position: [0, 0.44, 0.95], scale: [0.72, 0.1, 0.5], rotation: [0.08, 0, 0], material: { color: body, metalness: 0.25, roughness: 0.26 }, blend: B },
    { name: "cabin", shape: "rounded-box", position: [0, 0.62, -0.05], scale: [0.62, 0.22, 0.48], material: { color: "#0a1520", metalness: 0.1, roughness: 0.06 }, blend: 0.02 },
    { name: "rear-deck", shape: "rounded-box", position: [0, 0.38, -0.95], scale: [0.74, 0.12, 0.4], material: { color: body, metalness: 0.22, roughness: 0.3 }, blend: B },
    { name: "spoiler", shape: "box", position: [0, 0.52, -1.25], scale: [0.7, 0.03, 0.1], material: { color: "#1a1a1a", metalness: 0.4, roughness: 0.35 }, blend: 0.008 },
    { name: "front-bumper", shape: "rounded-box", position: [0, 0.14, 1.35], scale: [0.8, 0.08, 0.14], material: { color: "#111", metalness: 0.15, roughness: 0.55 }, blend: 0.01 },
    { name: "rear-bumper", shape: "rounded-box", position: [0, 0.14, -1.35], scale: [0.8, 0.08, 0.14], material: { color: "#111", metalness: 0.15, roughness: 0.55 }, blend: 0.01 },
    { name: "skirt-l", shape: "box", position: [-0.8, 0.16, 0], scale: [0.04, 0.06, 1.3], material: { color: "#1a1a1a", metalness: 0.2, roughness: 0.5 }, blend: 0.008 },
    { name: "skirt-r", shape: "box", position: [0.8, 0.16, 0], scale: [0.04, 0.06, 1.3], material: { color: "#1a1a1a", metalness: 0.2, roughness: 0.5 }, blend: 0.008 },
    ...wheel("fl", -0.95, 0.95, body),
    ...wheel("fr", 0.95, 0.95, body),
    ...wheel("rl", -0.95, -0.95, body),
    ...wheel("rr", 0.95, -0.95, body),
    { name: "hl-l", shape: "ellipsoid", position: [-0.45, 0.32, 1.38], scale: [0.12, 0.07, 0.06], material: { color: "#f1f5f9", metalness: 0.5, roughness: 0.08 }, blend: 0.01 },
    { name: "hl-r", shape: "ellipsoid", position: [0.45, 0.32, 1.38], scale: [0.12, 0.07, 0.06], material: { color: "#f1f5f9", metalness: 0.5, roughness: 0.08 }, blend: 0.01 },
    { name: "tl-l", shape: "ellipsoid", position: [-0.45, 0.34, -1.38], scale: [0.1, 0.05, 0.04], material: { color: "#ef4444", metalness: 0.3, roughness: 0.15 }, blend: 0.01 },
    { name: "tl-r", shape: "ellipsoid", position: [0.45, 0.34, -1.38], scale: [0.1, 0.05, 0.04], material: { color: "#ef4444", metalness: 0.3, roughness: 0.15 }, blend: 0.01 },
    { name: "mirror-l", shape: "box", position: [-0.85, 0.5, 0.3], scale: [0.06, 0.035, 0.09], material: { color: body, metalness: 0.25, roughness: 0.3 }, blend: 0.008 },
    { name: "mirror-r", shape: "box", position: [0.85, 0.5, 0.3], scale: [0.06, 0.035, 0.09], material: { color: body, metalness: 0.25, roughness: 0.3 }, blend: 0.008 },
    { name: "grille", shape: "box", position: [0, 0.26, 1.4], scale: [0.45, 0.07, 0.04], material: { color: "#0a0a0a", metalness: 0.5, roughness: 0.4 }, blend: 0.008 },
  ];
}

function wheel(id: string, x: number, z: number, paint: string): ParticleComponent[] {
  const y = 0.28;
  return [
    { name: id + "-tire", shape: "torus", position: [x, y, z], scale: [0.34, 0.14, 0.34], rotation: [Math.PI / 2, 0, 0], material: { color: "#0a0a0a", metalness: 0, roughness: 0.92 }, blend: 0.006 },
    { name: id + "-rim", shape: "cylinder", position: [x, y, z], scale: [0.18, 0.05, 0.18], rotation: [Math.PI / 2, 0, 0], material: { color: "#c0c8d4", metalness: 0.92, roughness: 0.14 }, blend: 0.006 },
  ];
}

export function studioMotorcycleBase(paint: string): ParticleComponent[] {
  const body = safePaint(paint, "#2563eb");
  return [
    { name: "frame", shape: "capsule", position: [0, 0.42, 0], scale: [0.07, 0.1, 0.65], material: { color: "#1a1a1a", metalness: 0.7, roughness: 0.25 }, blend: 0.02 },
    { name: "tank", shape: "ellipsoid", position: [0, 0.58, 0.12], scale: [0.16, 0.14, 0.3], material: { color: body, metalness: 0.25, roughness: 0.3 }, blend: 0.03 },
    { name: "seat", shape: "ellipsoid", position: [0, 0.54, -0.32], scale: [0.14, 0.07, 0.25], material: { color: "#1a1a1a", metalness: 0.1, roughness: 0.7 }, blend: 0.025 },
    { name: "front-wheel", shape: "torus", position: [0, 0.26, 0.72], scale: [0.3, 0.11, 0.3], rotation: [Math.PI / 2, 0, 0], material: { color: "#0a0a0a", metalness: 0, roughness: 0.9 }, blend: 0.008 },
    { name: "front-rim", shape: "cylinder", position: [0, 0.26, 0.72], scale: [0.16, 0.04, 0.16], rotation: [Math.PI / 2, 0, 0], material: { color: "#c0c8d4", metalness: 0.9, roughness: 0.15 }, blend: 0.008 },
    { name: "rear-wheel", shape: "torus", position: [0, 0.26, -0.68], scale: [0.32, 0.12, 0.32], rotation: [Math.PI / 2, 0, 0], material: { color: "#0a0a0a", metalness: 0, roughness: 0.9 }, blend: 0.008 },
    { name: "rear-rim", shape: "cylinder", position: [0, 0.26, -0.68], scale: [0.17, 0.04, 0.17], rotation: [Math.PI / 2, 0, 0], material: { color: "#c0c8d4", metalness: 0.9, roughness: 0.15 }, blend: 0.008 },
    { name: "fork", shape: "capsule", position: [0, 0.48, 0.52], scale: [0.035, 0.2, 0.035], rotation: [0.3, 0, 0], material: { color: "#888", metalness: 0.8, roughness: 0.2 }, blend: 0.015 },
    { name: "handlebar", shape: "capsule", position: [0, 0.75, 0.52], scale: [0.26, 0.025, 0.025], material: { color: "#222", metalness: 0.4, roughness: 0.4 }, blend: 0.015 },
    { name: "headlight", shape: "sphere", position: [0, 0.52, 0.82], scale: [0.07, 0.07, 0.05], material: { color: "#f8fafc", metalness: 0.4, roughness: 0.1 }, blend: 0.012 },
    { name: "exhaust", shape: "cylinder", position: [0.11, 0.26, -0.18], scale: [0.035, 0.035, 0.35], material: { color: "#aaa", metalness: 0.85, roughness: 0.2 }, blend: 0.015 },
    { name: "engine", shape: "rounded-box", position: [0, 0.32, 0.08], scale: [0.12, 0.12, 0.18], material: { color: "#333", metalness: 0.5, roughness: 0.35 }, blend: 0.02 },
  ];
}

export function studioCharacterBase(skin: string): ParticleComponent[] {
  const s = skin || "#e8b896";
  return [
    { name: "head", shape: "ellipsoid", position: [0, 1.55, 0], scale: [0.2, 0.24, 0.2], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.03 },
    { name: "neck", shape: "cylinder", position: [0, 1.35, 0], scale: [0.07, 0.09, 0.07], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.025 },
    { name: "torso", shape: "ellipsoid", position: [0, 1.05, 0], scale: [0.3, 0.34, 0.18], material: { color: "#1e3a5f", metalness: 0.1, roughness: 0.5 }, blend: 0.03 },
    { name: "pelvis", shape: "ellipsoid", position: [0, 0.72, 0], scale: [0.28, 0.14, 0.16], material: { color: "#1a1a2e", metalness: 0.08, roughness: 0.55 }, blend: 0.025 },
    { name: "upper-arm-l", shape: "capsule", position: [-0.42, 1.05, 0], scale: [0.08, 0.24, 0.08], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.025 },
    { name: "upper-arm-r", shape: "capsule", position: [0.42, 1.05, 0], scale: [0.08, 0.24, 0.08], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.025 },
    { name: "forearm-l", shape: "capsule", position: [-0.46, 0.72, 0], scale: [0.07, 0.22, 0.07], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.025 },
    { name: "forearm-r", shape: "capsule", position: [0.46, 0.72, 0], scale: [0.07, 0.22, 0.07], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.025 },
    { name: "hand-l", shape: "ellipsoid", position: [-0.46, 0.48, 0], scale: [0.06, 0.09, 0.05], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.02 },
    { name: "hand-r", shape: "ellipsoid", position: [0.46, 0.48, 0], scale: [0.06, 0.09, 0.05], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.02 },
    { name: "thigh-l", shape: "capsule", position: [-0.14, 0.45, 0], scale: [0.1, 0.26, 0.1], material: { color: "#1a1a2e", metalness: 0.08, roughness: 0.55 }, blend: 0.025 },
    { name: "thigh-r", shape: "capsule", position: [0.14, 0.45, 0], scale: [0.1, 0.26, 0.1], material: { color: "#1a1a2e", metalness: 0.08, roughness: 0.55 }, blend: 0.025 },
    { name: "calf-l", shape: "capsule", position: [-0.14, 0.16, 0], scale: [0.08, 0.22, 0.08], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.025 },
    { name: "calf-r", shape: "capsule", position: [0.14, 0.16, 0], scale: [0.08, 0.22, 0.08], material: { color: s, metalness: 0.05, roughness: 0.55 }, blend: 0.025 },
    { name: "foot-l", shape: "ellipsoid", position: [-0.14, 0.04, 0.08], scale: [0.09, 0.05, 0.18], material: { color: "#222", metalness: 0.1, roughness: 0.7 }, blend: 0.02 },
    { name: "foot-r", shape: "ellipsoid", position: [0.14, 0.04, 0.08], scale: [0.09, 0.05, 0.18], material: { color: "#222", metalness: 0.1, roughness: 0.7 }, blend: 0.02 },
  ];
}

export function studioAnimalBase(fur: string): ParticleComponent[] {
  const f = fur || "#8b6914";
  return [
    { name: "torso", shape: "ellipsoid", position: [0, 0.55, 0], scale: [0.28, 0.28, 0.7], material: { color: f, metalness: 0.05, roughness: 0.7 }, blend: 0.05 },
    { name: "head", shape: "ellipsoid", position: [0, 0.7, 0.75], scale: [0.2, 0.18, 0.22], material: { color: f, metalness: 0.05, roughness: 0.7 }, blend: 0.04 },
    { name: "snout", shape: "ellipsoid", position: [0, 0.62, 0.95], scale: [0.1, 0.08, 0.14], material: { color: f, metalness: 0.05, roughness: 0.7 }, blend: 0.03 },
    { name: "ear-l", shape: "cone", position: [-0.12, 0.88, 0.7], scale: [0.05, 0.1, 0.05], material: { color: f, metalness: 0.05, roughness: 0.7 }, blend: 0.025 },
    { name: "ear-r", shape: "cone", position: [0.12, 0.88, 0.7], scale: [0.05, 0.1, 0.05], material: { color: f, metalness: 0.05, roughness: 0.7 }, blend: 0.025 },
    { name: "leg-fl", shape: "capsule", position: [-0.18, 0.28, 0.4], scale: [0.07, 0.28, 0.07], material: { color: f, metalness: 0.05, roughness: 0.7 }, blend: 0.025 },
    { name: "leg-fr", shape: "capsule", position: [0.18, 0.28, 0.4], scale: [0.07, 0.28, 0.07], material: { color: f, metalness: 0.05, roughness: 0.7 }, blend: 0.025 },
    { name: "leg-rl", shape: "capsule", position: [-0.18, 0.28, -0.4], scale: [0.07, 0.28, 0.07], material: { color: f, metalness: 0.05, roughness: 0.7 }, blend: 0.025 },
    { name: "leg-rr", shape: "capsule", position: [0.18, 0.28, -0.4], scale: [0.07, 0.28, 0.07], material: { color: f, metalness: 0.05, roughness: 0.7 }, blend: 0.025 },
    { name: "tail", shape: "capsule", position: [0, 0.55, -0.75], scale: [0.05, 0.05, 0.25], material: { color: f, metalness: 0.05, roughness: 0.7 }, blend: 0.03 },
    { name: "eye-l", shape: "sphere", position: [-0.08, 0.74, 0.9], scale: [0.03, 0.03, 0.03], material: { color: "#111", metalness: 0.2, roughness: 0.3 }, blend: 0.015 },
    { name: "eye-r", shape: "sphere", position: [0.08, 0.74, 0.9], scale: [0.03, 0.03, 0.03], material: { color: "#111", metalness: 0.2, roughness: 0.3 }, blend: 0.015 },
  ];
}

export function studioProductBase(color: string): ParticleComponent[] {
  const c = safePaint(color, "#c7d2e3");
  return [
    { name: "chassis", shape: "rounded-box", position: [0, 0.08, 0], scale: [0.55, 0.08, 1.1], material: { color: c, metalness: 0.4, roughness: 0.25 }, blend: 0.012 },
    { name: "screen", shape: "box", position: [0, 0.13, 0.05], scale: [0.48, 0.01, 0.9], material: { color: "#0a1520", metalness: 0.2, roughness: 0.06 }, blend: 0.008 },
    { name: "bezel", shape: "rounded-box", position: [0, 0.12, 0], scale: [0.52, 0.02, 1.02], material: { color: "#1a1a1a", metalness: 0.35, roughness: 0.35 }, blend: 0.01 },
    { name: "camera-bump", shape: "rounded-box", position: [-0.15, 0.16, -0.4], scale: [0.14, 0.04, 0.14], material: { color: "#2a2a2a", metalness: 0.4, roughness: 0.3 }, blend: 0.01 },
    { name: "lens", shape: "cylinder", position: [-0.15, 0.18, -0.4], scale: [0.05, 0.02, 0.05], material: { color: "#111122", metalness: 0.55, roughness: 0.12 }, blend: 0.008 },
    { name: "button", shape: "cylinder", position: [0.52, 0.1, 0.2], scale: [0.015, 0.03, 0.015], material: { color: "#444", metalness: 0.4, roughness: 0.4 }, blend: 0.008 },
    { name: "port", shape: "box", position: [0, 0.06, 0.55], scale: [0.12, 0.02, 0.03], material: { color: "#111", metalness: 0.5, roughness: 0.3 }, blend: 0.008 },
  ];
}

export function studioFurnitureBase(wood: string): ParticleComponent[] {
  const w = wood || "#8b5a2b";
  return [
    { name: "seat", shape: "rounded-box", position: [0, 0.45, 0], scale: [0.52, 0.07, 0.52], material: { color: w, metalness: 0.05, roughness: 0.6 }, blend: 0.015 },
    { name: "backrest", shape: "rounded-box", position: [0, 0.88, -0.24], scale: [0.5, 0.42, 0.06], material: { color: w, metalness: 0.05, roughness: 0.6 }, blend: 0.015 },
    { name: "leg-fl", shape: "cylinder", position: [-0.38, 0.22, 0.38], scale: [0.045, 0.22, 0.045], material: { color: "#2a1a0a", metalness: 0.1, roughness: 0.5 }, blend: 0.01 },
    { name: "leg-fr", shape: "cylinder", position: [0.38, 0.22, 0.38], scale: [0.045, 0.22, 0.045], material: { color: "#2a1a0a", metalness: 0.1, roughness: 0.5 }, blend: 0.01 },
    { name: "leg-rl", shape: "cylinder", position: [-0.38, 0.22, -0.38], scale: [0.045, 0.22, 0.045], material: { color: "#2a1a0a", metalness: 0.1, roughness: 0.5 }, blend: 0.01 },
    { name: "leg-rr", shape: "cylinder", position: [0.38, 0.22, -0.38], scale: [0.045, 0.22, 0.045], material: { color: "#2a1a0a", metalness: 0.1, roughness: 0.5 }, blend: 0.01 },
  ];
}

export function studioArchitectureBase(color: string): ParticleComponent[] {
  const c = safePaint(color, "#c4a574");
  return [
    { name: "main-volume", shape: "box", position: [0, 0.6, 0], scale: [1.2, 0.6, 0.9], material: { color: c, metalness: 0.05, roughness: 0.65 }, blend: 0.01 },
    { name: "roof", shape: "cone", position: [0, 1.35, 0], scale: [0.95, 0.35, 0.75], material: { color: "#5c4033", metalness: 0.05, roughness: 0.7 }, blend: 0.015 },
    { name: "door", shape: "box", position: [0, 0.35, 0.91], scale: [0.22, 0.35, 0.04], material: { color: "#3d2914", metalness: 0.1, roughness: 0.6 }, blend: 0.008 },
    { name: "window-l", shape: "box", position: [-0.55, 0.7, 0.91], scale: [0.2, 0.18, 0.03], material: { color: "#1a2838", metalness: 0.15, roughness: 0.1 }, blend: 0.008 },
    { name: "window-r", shape: "box", position: [0.55, 0.7, 0.91], scale: [0.2, 0.18, 0.03], material: { color: "#1a2838", metalness: 0.15, roughness: 0.1 }, blend: 0.008 },
    { name: "steps", shape: "box", position: [0, 0.06, 1.05], scale: [0.35, 0.06, 0.15], material: { color: "#888", metalness: 0.1, roughness: 0.6 }, blend: 0.008 },
    { name: "chimney", shape: "box", position: [0.4, 1.5, -0.15], scale: [0.12, 0.25, 0.12], material: { color: "#6b4423", metalness: 0.05, roughness: 0.7 }, blend: 0.01 },
  ];
}

export function studioGenericBase(color: string): ParticleComponent[] {
  const c = safePaint(color, "#6366f1");
  return [
    { name: "primary-mass", shape: "rounded-box", position: [0, 0.45, 0], scale: [0.6, 0.38, 0.8], material: { color: c, metalness: 0.25, roughness: 0.32 }, blend: 0.02 },
    { name: "secondary", shape: "ellipsoid", position: [0, 0.85, 0.05], scale: [0.38, 0.2, 0.32], material: { color: c, metalness: 0.2, roughness: 0.35 }, blend: 0.03 },
    { name: "accent-ring", shape: "torus", position: [0, 0.45, 0], scale: [0.48, 0.06, 0.48], rotation: [Math.PI / 2, 0, 0], material: { color: "#c0c8d4", metalness: 0.85, roughness: 0.18 }, blend: 0.012 },
    { name: "base-plate", shape: "cylinder", position: [0, 0.05, 0], scale: [0.42, 0.05, 0.42], material: { color: "#1a1a1a", metalness: 0.3, roughness: 0.5 }, blend: 0.015 },
    { name: "detail-l", shape: "capsule", position: [-0.32, 0.5, 0.12], scale: [0.045, 0.16, 0.045], material: { color: "#2a2a2a", metalness: 0.4, roughness: 0.4 }, blend: 0.015 },
    { name: "detail-r", shape: "capsule", position: [0.32, 0.5, 0.12], scale: [0.045, 0.16, 0.045], material: { color: "#2a2a2a", metalness: 0.4, roughness: 0.4 }, blend: 0.015 },
    { name: "top-cap", shape: "sphere", position: [0, 1.02, 0], scale: [0.14, 0.09, 0.14], material: { color: "#e8eef5", metalness: 0.5, roughness: 0.25 }, blend: 0.02 },
  ];
}
