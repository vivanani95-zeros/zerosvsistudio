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
  /** 0-1 edge rounding for boxes — real objects have no razor edges. */
  bevel?: number;
  /** Duplicate this part mirrored across the X axis (wheels, lights, doors). */
  mirror?: boolean;
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
const SEG = { radial: 72, height: 24, ring: 96, tube: 28 };

/** Box with softened edges, like a bevel + subdivision pass in a DCC tool. */
function roundedBox(
  THREE: typeof THREE_NS,
  x: number,
  y: number,
  z: number,
  bevel: number,
): THREE_NS.BufferGeometry {
  const geo = new THREE.BoxGeometry(x, y, z, 24, 24, 24);
  const r = Math.min(0.49, Math.max(0.02, bevel));
  const exp = 2 / Math.max(0.04, r * 1.6); // superellipsoid exponent
  const pos = geo.attributes["position"];
  if (!pos) return geo;
  const h: [number, number, number] = [x / 2, y / 2, z / 2];
  for (let i = 0; i < pos.count; i += 1) {
    const nx = pos.getX(i) / h[0];
    const ny = pos.getY(i) / h[1];
    const nz = pos.getZ(i) / h[2];
    const d =
      Math.pow(Math.abs(nx), exp) + Math.pow(Math.abs(ny), exp) + Math.pow(Math.abs(nz), exp);
    const k = 1 / Math.pow(Math.max(d, 1e-6), 1 / exp);
    pos.setXYZ(i, nx * k * h[0], ny * k * h[1], nz * k * h[2]);
  }
  geo.computeVertexNormals();
  return geo;
}

function geometryFor(THREE: typeof THREE_NS, part: ModelPart): THREE_NS.BufferGeometry {
  const [x = 1, y = 1, z = 1] = part.size ?? [1, 1, 1];
  switch (part.shape) {
    case "box":
      return roundedBox(THREE, x, y, z, part.bevel ?? 0.12);
    case "cylinder":
      return new THREE.CylinderGeometry(x / 2, z / 2, y, SEG.radial, SEG.height);
    case "cone":
      return new THREE.ConeGeometry(x / 2, y, SEG.radial, SEG.height);
    case "torus":
      return new THREE.TorusGeometry(x / 2, y / 2, SEG.tube, SEG.ring);
    case "capsule":
      return new THREE.CapsuleGeometry(x / 2, y, 16, SEG.radial);
    case "plane":
      return new THREE.PlaneGeometry(x, z, 64, 64);
    case "lathe": {
      const pts = (part.profile?.length ? part.profile : [[0.05, 0], [x / 2, y / 2], [0.05, y]])
        .map(([r, h]) => new THREE.Vector2(Math.max(0.001, r ?? 0.01), h ?? 0));
      return new THREE.LatheGeometry(pts, SEG.radial);
    }
    case "sphere":
    default:
      return new THREE.SphereGeometry(0.5, SEG.radial, SEG.height + 12);
  }
}

function addRelief(
  THREE: typeof THREE_NS,
  geo: THREE_NS.BufferGeometry,
  amount: number,
  seed: number,
) {
  if (amount <= 0) return;
  const pos = geo.attributes["position"];
  if (!pos) return;
  const v = new THREE.Vector3();
  const n = geo.attributes["normal"];
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i);
    const w =
      Math.sin(v.x * 21 + seed) * Math.sin(v.y * 27 + seed * 0.7) * Math.sin(v.z * 24 + seed * 1.3);
    const d = w * amount * 0.012;
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

/** Procedural micro-surface map so materials read as real manufactured finishes. */
let microMap: THREE_NS.Texture | null = null;
function microSurface(THREE: typeof THREE_NS): THREE_NS.Texture | null {
  if (microMap) return microMap;
  if (typeof document === "undefined") return null;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i += 1) {
    const x = i % size;
    const y = Math.floor(i / size);
    const n =
      120 +
      Math.sin(x * 0.7) * 8 +
      Math.sin(y * 0.31) * 6 +
      (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453 % 1) * 26;
    const v = Math.max(0, Math.min(255, n));
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  microMap = tex;
  return tex;
}

function buildPart(
  THREE: typeof THREE_NS,
  part: ModelPart,
  index: number,
  micro: THREE_NS.Texture | null,
): THREE_NS.Mesh {
  const geo = geometryFor(THREE, part);
  if (part.shape === "sphere") {
    const [x = 1, y = 1, z = 1] = part.size ?? [1, 1, 1];
    geo.scale(x, y, z);
  }
  addRelief(THREE, geo, part.detail ?? 0.25, index * 7.3 + 1);

  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(part.color || "#9aa6b2"),
    metalness: part.metalness ?? 0.35,
    roughness: part.roughness ?? 0.4,
    clearcoat: 0.6,
    clearcoatRoughness: 0.18,
    envMapIntensity: 1.35,
    ...(micro ? { roughnessMap: micro } : {}),
    ...(part.emissive
      ? { emissive: new THREE.Color(part.emissive), emissiveIntensity: 1.8 }
      : {}),
    ...(part.opacity !== undefined && part.opacity < 1
      ? { transparent: true, opacity: part.opacity, transmission: 0.5, thickness: 0.4 }
      : {}),
  });

  const mesh = new THREE.Mesh(geo, mat);
  const [px = 0, py = 0, pz = 0] = part.pos ?? [0, 0, 0];
  mesh.position.set(px, py, pz);
  const [rx = 0, ry = 0, rz = 0] = part.rot ?? [0, 0, 0];
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = part.name ?? `part-${index}`;
  return mesh;
}

/**
 * Builds a real, recognizable object from a structured part list: each part
 * becomes dense, bevelled PBR geometry with surface relief, mirrored where the
 * spec asks for symmetry.
 */
export function buildModelFromSpec(THREE: typeof THREE_NS, spec: ModelSpec): THREE_NS.Group {
  const group = new THREE.Group();
  group.name = spec.name || "Zeros model";
  const micro = microSurface(THREE);

  spec.parts.slice(0, 90).forEach((part, index) => {
    const mesh = buildPart(THREE, part, index, micro);
    group.add(mesh);
    if (part.mirror) {
      const twin = mesh.clone();
      twin.position.x = -mesh.position.x;
      twin.rotation.set(mesh.rotation.x, -mesh.rotation.y, -mesh.rotation.z);
      group.add(twin);
    }
  });

  return group;
}
