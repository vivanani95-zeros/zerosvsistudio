import type * as THREE_NS from "three";

export type ModelPart = {
  name?: string;
  shape:
    | "box"
    | "sphere"
    | "cylinder"
    | "cone"
    | "torus"
    | "capsule"
    | "plane"
    | "lathe";
  pos: [number, number, number];
  rot?: [number, number, number];
  size: [number, number, number];
  color?: string;
  metalness?: number;
  roughness?: number;
  emissive?: string;
  opacity?: number;
  /** Radial profile points for lathe shapes: [radius, height] pairs. */
  profile?: [number, number][];
  /** 0-1 surface relief amount, adds micro geometry detail. */
  detail?: number;
};

export type ModelSpec = {
  name: string;
  parts: ModelPart[];
};

export function isModelSpec(value: unknown): value is ModelSpec {
  const v = value as ModelSpec | null;
  return !!v && Array.isArray(v.parts) && v.parts.length > 0 && !!v.parts[0]?.shape;
}

/** High-density segment counts — dense meshes, still bounded for the browser. */
const SEG = { radial: 192, height: 64, ring: 256, tube: 64 };

function geometryFor(THREE: typeof THREE_NS, part: ModelPart): THREE_NS.BufferGeometry {
  const [x = 1, y = 1, z = 1] = part.size ?? [1, 1, 1];
  switch (part.shape) {
    case "box":
      return new THREE.BoxGeometry(x, y, z, 48, 48, 48);
    case "cylinder":
      return new THREE.CylinderGeometry(x / 2, z / 2, y, SEG.radial, SEG.height);
    case "cone":
      return new THREE.ConeGeometry(x / 2, y, SEG.radial, SEG.height);
    case "torus":
      return new THREE.TorusGeometry(x / 2, y / 2, SEG.tube, SEG.ring);
    case "capsule":
      return new THREE.CapsuleGeometry(x / 2, y, 48, SEG.radial);
    case "plane":
      return new THREE.PlaneGeometry(x, z, 256, 256);
    case "lathe": {
      const pts = (part.profile?.length ? part.profile : [[0.05, 0], [x / 2, y / 2], [0.05, y]])
        .map(([r, h]) => new THREE.Vector2(Math.max(0.001, r ?? 0.01), h ?? 0));
      return new THREE.LatheGeometry(pts, SEG.radial);
    }
    case "sphere":
    default:
      return new THREE.SphereGeometry(0.5, SEG.radial, SEG.height / 2 + 32);
  }
}

function addRelief(THREE: typeof THREE_NS, geo: THREE_NS.BufferGeometry, amount: number, seed: number) {
  if (amount <= 0) return;
  const pos = geo.attributes["position"];
  if (!pos) return;
  const v = new THREE.Vector3();
  const n = geo.attributes["normal"];
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i);
    const w =
      Math.sin(v.x * 21 + seed) * Math.sin(v.y * 27 + seed * 0.7) * Math.sin(v.z * 24 + seed * 1.3);
    const d = w * amount * 0.02;
    if (n) {
      pos.setXYZ(
        i,
        v.x + (n.getX(i) ?? 0) * d,
        v.y + (n.getY(i) ?? 0) * d,
        v.z + (n.getZ(i) ?? 0) * d,
      );
    } else {
      pos.setXYZ(i, v.x * (1 + d), v.y * (1 + d), v.z * (1 + d));
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/**
 * Builds a real, recognizable object from a structured part list instead of a
 * generic blob: each part becomes dense PBR geometry with surface relief.
 */
export function buildModelFromSpec(THREE: typeof THREE_NS, spec: ModelSpec): THREE_NS.Group {
  const group = new THREE.Group();
  group.name = spec.name || "Zeros model";

  spec.parts.slice(0, 80).forEach((part, index) => {
    const geo = geometryFor(THREE, part);
    if (part.shape === "sphere") {
      const [x = 1, y = 1, z = 1] = part.size ?? [1, 1, 1];
      geo.scale(x, y, z);
    }
    addRelief(THREE, geo, part.detail ?? 0.35, index * 7.3 + 1);

    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(part.color || "#9aa6b2"),
      metalness: part.metalness ?? 0.35,
      roughness: part.roughness ?? 0.45,
      clearcoat: 0.35,
      clearcoatRoughness: 0.35,
      ...(part.emissive ? { emissive: new THREE.Color(part.emissive), emissiveIntensity: 1.6 } : {}),
      ...(part.opacity !== undefined && part.opacity < 1
        ? { transparent: true, opacity: part.opacity }
        : {}),
    });

    const mesh = new THREE.Mesh(geo, mat);
    const [px = 0, py = 0, pz = 0] = part.pos ?? [0, 0, 0];
    mesh.position.set(px, py, pz);
    const [rx = 0, ry = 0, rz = 0] = part.rot ?? [0, 0, 0];
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  return group;
}
