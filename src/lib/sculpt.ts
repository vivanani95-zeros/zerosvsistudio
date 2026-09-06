import type * as THREE_NS from "three";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";
import type { ModelPart, ModelSpec } from "@/lib/model-spec";

/**
 * A Blender-like sculpting pass: every part of a model spec is turned into a
 * signed distance field, the fields are smooth-unioned into ONE continuous
 * volume, that volume is re-meshed with marching cubes, and the resulting
 * single surface is displaced with multi-octave noise for pore-level detail.
 *
 * The output is one watertight-ish mesh — not a pile of primitives.
 */
export type SculptOptions = {
  /** Voxel grid resolution per axis (higher = more polygons). */
  resolution?: number;
  /** 0-1 how much the parts melt into each other. */
  fusion?: number;
  /** 0-1 micro-displacement strength. */
  detail?: number;
};

type Prim = {
  center: [number, number, number];
  half: [number, number, number];
  inv: number[]; // 3x3 inverse rotation, row-major
  shape: ModelPart["shape"];
  color: [number, number, number];
  metalness: number;
  roughness: number;
  radius: number;
};

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

function rotationInverse(rx: number, ry: number, rz: number): number[] {
  const cx = Math.cos(rx),
    sx = Math.sin(rx),
    cy = Math.cos(ry),
    sy = Math.sin(ry),
    cz = Math.cos(rz),
    sz = Math.sin(rz);
  // R = Rz * Ry * Rx  (three's default XYZ order applied as R = Rx then Ry then Rz)
  const m = [
    cy * cz,
    sx * sy * cz - cx * sz,
    cx * sy * cz + sx * sz,
    cy * sz,
    sx * sy * sz + cx * cz,
    cx * sy * sz - sx * cz,
    -sy,
    sx * cy,
    cx * cy,
  ];
  // inverse of a rotation is its transpose
  return [m[0]!, m[3]!, m[6]!, m[1]!, m[4]!, m[7]!, m[2]!, m[5]!, m[8]!];
}

function hexToRgb(hex?: string): [number, number, number] {
  const h = (hex ?? "#9aa6b2").replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0.6, 0.65, 0.7];
  // approximate sRGB -> linear so colors read correctly under ACES tone mapping
  const srgb = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  return srgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ];
}

function toPrims(spec: ModelSpec): Prim[] {
  const prims: Prim[] = [];
  for (const part of spec.parts.slice(0, 120)) {
    const [sx = 1, sy = 1, sz = 1] = part.size ?? [1, 1, 1];
    const [px = 0, py = 0, pz = 0] = part.pos ?? [0, 0, 0];
    const [rx = 0, ry = 0, rz = 0] = part.rot ?? [0, 0, 0];
    const base: Prim = {
      center: [px, py, pz],
      half: [Math.abs(sx) / 2 || 0.01, Math.abs(sy) / 2 || 0.01, Math.abs(sz) / 2 || 0.01],
      inv: rotationInverse(rx, ry, rz),
      shape: part.shape,
      color: hexToRgb(part.color),
      metalness: part.metalness ?? 0.35,
      roughness: part.roughness ?? 0.4,
      radius: Math.max(Math.abs(sx), Math.abs(sy), Math.abs(sz)) / 2,
    };
    prims.push(base);
    if (part.mirror) prims.push({ ...base, center: [-px, py, pz] });
  }
  return prims;
}

/** Signed distance of world point p to a primitive (negative = inside). */
function primDistance(prim: Prim, x: number, y: number, z: number): number {
  const dx = x - prim.center[0];
  const dy = y - prim.center[1];
  const dz = z - prim.center[2];
  const i = prim.inv;
  const lx = i[0]! * dx + i[1]! * dy + i[2]! * dz;
  const ly = i[3]! * dx + i[4]! * dy + i[5]! * dz;
  const lz = i[6]! * dx + i[7]! * dy + i[8]! * dz;
  const [hx, hy, hz] = prim.half;

  switch (prim.shape) {
    case "sphere": {
      const k = Math.hypot(lx / hx, ly / hy, lz / hz);
      return (k - 1) * Math.min(hx, hy, hz);
    }
    case "cylinder":
    case "lathe": {
      const r = Math.hypot(lx / hx, lz / hz) - 1;
      const h = Math.abs(ly) - hy;
      const a = Math.max(r * Math.min(hx, hz), h);
      return a;
    }
    case "cone": {
      const t = clamp((ly + hy) / (2 * hy), 0, 1); // 0 at tip-top
      const rr = Math.max(0.02, (1 - t) * hx);
      const r = Math.hypot(lx, lz) - rr;
      return Math.max(r, Math.abs(ly) - hy);
    }
    case "capsule": {
      const yy = Math.max(0, Math.abs(ly) - hy);
      return Math.hypot(lx, yy, lz) - hx;
    }
    case "torus": {
      const q = Math.hypot(lx, lz) - hx;
      return Math.hypot(q, ly) - Math.max(0.02, hy * 0.5);
    }
    case "plane": {
      const qx = Math.abs(lx) - hx;
      const qy = Math.abs(ly) - 0.02;
      const qz = Math.abs(lz) - hz;
      return (
        Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) +
        Math.min(Math.max(qx, Math.max(qy, qz)), 0)
      );
    }
    case "box":
    default: {
      const qx = Math.abs(lx) - hx;
      const qy = Math.abs(ly) - hy;
      const qz = Math.abs(lz) - hz;
      const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
      return outside + Math.min(Math.max(qx, Math.max(qy, qz)), 0);
    }
  }
}

/** Polynomial smooth minimum — the "remesh + smooth" a sculptor would apply. */
function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b * (1 - h) + a * h - k * h * (1 - h);
}

function noise3(x: number, y: number, z: number): number {
  return (
    Math.sin(x * 1.7 + Math.sin(y * 2.3)) * 0.5 +
    Math.sin(y * 2.1 + Math.sin(z * 1.9)) * 0.3 +
    Math.sin(z * 2.7 + Math.sin(x * 1.3)) * 0.2
  );
}

export type SculptResult = {
  mesh: THREE_NS.Mesh;
  triangles: number;
  vertices: number;
};

/**
 * Sculpts a model spec into a single high-density mesh with vertex colors,
 * per-vertex material blending and micro surface detail.
 */
export function sculptSingleMesh(
  THREE: typeof THREE_NS,
  spec: ModelSpec,
  opts: SculptOptions = {},
): SculptResult {
  const prims = toPrims(spec);
  if (!prims.length) throw new Error("Nothing to sculpt");

  const resolution = clamp(Math.round(opts.resolution ?? 120), 32, 176);
  const detail = clamp(opts.detail ?? 0.5, 0, 1);

  // World bounds of the whole assembly.
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) {
    for (let a = 0; a < 3; a += 1) {
      const r = p.radius;
      min[a] = Math.min(min[a]!, p.center[a]! - r);
      max[a] = Math.max(max[a]!, p.center[a]! + r);
    }
  }
  const center = [0, 1, 2].map((a) => (min[a]! + max[a]!) / 2);
  const extent = Math.max(...[0, 1, 2].map((a) => max[a]! - min[a]!), 0.2) * 1.18;
  const halfExtent = extent / 2;
  const voxel = extent / resolution;
  // Fusion radius scales with the object so parts weld instead of floating apart.
  const k = Math.max(voxel * 1.4, extent * 0.012 * (1 + (opts.fusion ?? 0.5)));

  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    metalness: 0.45,
    roughness: 0.38,
    clearcoat: 0.65,
    clearcoatRoughness: 0.2,
    envMapIntensity: 1.4,
  });

  const mc = new MarchingCubes(resolution, material, true, true, 3_000_000);
  mc.isolation = 0;
  const field = mc.field;
  const size = mc.size;
  const size2 = mc.size2;

  // Sample the fused SDF into the voxel grid.
  for (let z = 0; z < size; z += 1) {
    const wz = center[2]! + ((z / (size - 1)) * 2 - 1) * halfExtent;
    const zo = z * size2;
    for (let y = 0; y < size; y += 1) {
      const wy = center[1]! + ((y / (size - 1)) * 2 - 1) * halfExtent;
      const yo = zo + y * size;
      for (let x = 0; x < size; x += 1) {
        const wx = center[0]! + ((x / (size - 1)) * 2 - 1) * halfExtent;
        let d = Infinity;
        for (let i = 0; i < prims.length; i += 1) {
          const p = prims[i]!;
          const bx = Math.abs(wx - p.center[0]!) - p.radius - k;
          const by = Math.abs(wy - p.center[1]!) - p.radius - k;
          const bz = Math.abs(wz - p.center[2]!) - p.radius - k;
          if (bx > 0 || by > 0 || bz > 0) continue; // outside influence
          d = i === 0 || d === Infinity ? primDistance(p, wx, wy, wz) : smin(d, primDistance(p, wx, wy, wz), k);
        }
        field[yo + x] = d === Infinity ? -1 : -d;
      }
    }
  }

  mc.update();

  const src = mc.geometry.getAttribute("position");
  const count = mc.count;
  if (!count) throw new Error("Sculpt produced no surface");

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  const scaleToWorld = halfExtent; // MC space is [-1,1]
  for (let v = 0; v < count; v += 1) {
    const wx = center[0]! + src.getX(v) * scaleToWorld;
    const wy = center[1]! + src.getY(v) * scaleToWorld;
    const wz = center[2]! + src.getZ(v) * scaleToWorld;

    // nearest primitive drives colour + material feel
    let best = Infinity;
    let bestPrim = prims[0]!;
    for (const p of prims) {
      const d = primDistance(p, wx, wy, wz);
      if (d < best) {
        best = d;
        bestPrim = p;
      }
    }

    // multi-octave micro relief along the surface, like a sculpt detail layer
    const n =
      noise3(wx * 9, wy * 9, wz * 9) * 0.6 +
      noise3(wx * 23, wy * 23, wz * 23) * 0.28 +
      noise3(wx * 61, wy * 61, wz * 61) * 0.12;
    const amp = voxel * 0.5 * detail * (0.4 + bestPrim.roughness);

    positions[v * 3] = wx + n * amp;
    positions[v * 3 + 1] = wy + n * amp;
    positions[v * 3 + 2] = wz + n * amp;

    const shade = 0.92 + n * 0.06;
    colors[v * 3] = clamp(bestPrim.color[0] * shade, 0, 1);
    colors[v * 3 + 1] = clamp(bestPrim.color[1] * shade, 0, 1);
    colors[v * 3 + 2] = clamp(bestPrim.color[2] * shade, 0, 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.computeBoundingBox();

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = spec.name || "Zeros sculpt";
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  // free the marching-cubes scratch buffers
  mc.geometry.dispose();

  return { mesh, triangles: Math.floor(count / 3), vertices: count };
}
