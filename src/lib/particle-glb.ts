import type { ParticleComponent, ParticleSculptSpec, ParticleShape } from "./particle-model";

type V3 = [number, number, number];

function pad4(n: number) {
  return (n + 3) & ~3;
}
function utf8(s: string) {
  return new TextEncoder().encode(s);
}
function chunk(type: number, data: Uint8Array) {
  const out = new Uint8Array(8 + pad4(data.length));
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length, true);
  dv.setUint32(4, type, true);
  out.set(data, 8);
  return out;
}

function hexRgb(c?: string): V3 {
  const h = /^#[0-9a-f]{6}$/i.test(c ?? "") ? (c as string).slice(1) : "c7d2e3";
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

function mul(a: V3, s: number): V3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
function add(a: V3, b: V3): V3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function norm(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function rx(v: V3, a: number): V3 {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2]];
}
function ry(v: V3, a: number): V3 {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [c * v[0] - s * v[2], v[1], s * v[0] + c * v[2]];
}
function rz(v: V3, a: number): V3 {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]];
}
function transformPoint(v: V3, rot: V3, pos: V3, scale: V3): V3 {
  let q: V3 = [v[0] * scale[0], v[1] * scale[1], v[2] * scale[2]];
  q = rx(q, rot[0]);
  q = ry(q, rot[1]);
  q = rz(q, rot[2]);
  return add(q, pos);
}
function transformNormal(v: V3, rot: V3, scale: V3): V3 {
  // Inverse-transpose approximation for non-uniform scale.
  let q: V3 = [v[0] / Math.max(1e-6, scale[0]), v[1] / Math.max(1e-6, scale[1]), v[2] / Math.max(1e-6, scale[2])];
  q = rx(q, rot[0]);
  q = ry(q, rot[1]);
  q = rz(q, rot[2]);
  return norm(q);
}

/** Subdivision level driven by sculpt detail (Meshy-class density). */
function resolutionFor(detail: number): { seg: number; rings: number } {
  const t = Math.max(0.5, Math.min(1, detail));
  const seg = Math.round(28 + t * 36); // 46–64
  const rings = Math.round(16 + t * 24); // 28–40
  return { seg, rings };
}

function pushTri(
  positions: number[],
  normals: number[],
  colors: number[],
  indices: number[],
  a: V3,
  b: V3,
  c: V3,
  na: V3,
  nb: V3,
  nc: V3,
  color: V3,
) {
  const base = positions.length / 3;
  positions.push(...a, ...b, ...c);
  normals.push(...na, ...nb, ...nc);
  colors.push(...color, ...color, ...color);
  indices.push(base, base + 1, base + 2);
}

function meshSphereLike(
  positions: number[],
  normals: number[],
  colors: number[],
  indices: number[],
  p: ParticleComponent,
  seg: number,
  rings: number,
  shape: ParticleShape,
) {
  const rot = (p.rotation ?? [0, 0, 0]) as V3;
  const pos = p.position;
  const scale = p.scale;
  const color = hexRgb(p.material?.color);
  const unitPoint = (u: number, v: number): { point: V3; normal: V3 } => {
    const theta = u * Math.PI * 2;
    const phi = v * Math.PI;
    let x = Math.sin(phi) * Math.cos(theta);
    let y = Math.cos(phi);
    let z = Math.sin(phi) * Math.sin(theta);
    if (shape === "ellipsoid") {
      // Already unit sphere stretched by scale — normals handled in transformNormal.
    } else if (shape === "cone") {
      // Taper radius toward +Y tip.
      const t = (y + 1) * 0.5;
      const r = 1 - t * 0.88;
      x *= r;
      z *= r;
    }
    const n = norm([x, y, z]);
    return { point: [x, y, z], normal: n };
  };

  const grid: { point: V3; normal: V3 }[][] = [];
  for (let r = 0; r <= rings; r++) {
    const row: { point: V3; normal: V3 }[] = [];
    const v = r / rings;
    for (let j = 0; j <= seg; j++) {
      const u = j / seg;
      row.push(unitPoint(u, v));
    }
    grid.push(row);
  }

  for (let r = 0; r < rings; r++) {
    for (let j = 0; j < seg; j++) {
      const a0 = grid[r]![j]!;
      const a1 = grid[r]![j + 1]!;
      const b0 = grid[r + 1]![j]!;
      const b1 = grid[r + 1]![j + 1]!;
      const pa = transformPoint(a0.point, rot, pos, scale);
      const pb = transformPoint(a1.point, rot, pos, scale);
      const pc = transformPoint(b0.point, rot, pos, scale);
      const pd = transformPoint(b1.point, rot, pos, scale);
      const na = transformNormal(a0.normal, rot, scale);
      const nb = transformNormal(a1.normal, rot, scale);
      const nc = transformNormal(b0.normal, rot, scale);
      const nd = transformNormal(b1.normal, rot, scale);
      pushTri(positions, normals, colors, indices, pa, pc, pb, na, nc, nb, color);
      pushTri(positions, normals, colors, indices, pb, pc, pd, nb, nc, nd, color);
    }
  }
}

function meshBox(
  positions: number[],
  normals: number[],
  colors: number[],
  indices: number[],
  p: ParticleComponent,
  divisions: number,
  rounded: boolean,
) {
  const rot = (p.rotation ?? [0, 0, 0]) as V3;
  const pos = p.position;
  const scale = p.scale;
  const color = hexRgb(p.material?.color);
  const faces: { normal: V3; u: V3; v: V3 }[] = [
    { normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { normal: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
    { normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    { normal: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { normal: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
    { normal: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  ];
  const d = Math.max(2, divisions);
  for (const face of faces) {
    for (let i = 0; i < d; i++) {
      for (let j = 0; j < d; j++) {
        const u0 = -1 + (2 * i) / d;
        const u1 = -1 + (2 * (i + 1)) / d;
        const v0 = -1 + (2 * j) / d;
        const v1 = -1 + (2 * (j + 1)) / d;
        const corner = (uu: number, vv: number): { point: V3; normal: V3 } => {
          let local: V3 = add(add(mul(face.u, uu), mul(face.v, vv)), face.normal);
          if (rounded) {
            // Soften toward a rounded cube while keeping quad topology.
            const soft = 0.12;
            local = norm([
              local[0] * (1 - soft) + Math.sign(local[0] || 1) * soft,
              local[1] * (1 - soft) + Math.sign(local[1] || 1) * soft,
              local[2] * (1 - soft) + Math.sign(local[2] || 1) * soft,
            ]);
            // Re-project onto slightly rounded box surface.
            const abs = [Math.abs(local[0]), Math.abs(local[1]), Math.abs(local[2])] as V3;
            const m = Math.max(abs[0], abs[1], abs[2]) || 1;
            local = [local[0] / m, local[1] / m, local[2] / m];
          }
          return {
            point: local,
            normal: rounded ? norm(local) : face.normal,
          };
        };
        const a = corner(u0, v0);
        const b = corner(u1, v0);
        const c = corner(u0, v1);
        const d0 = corner(u1, v1);
        const pa = transformPoint(a.point, rot, pos, scale);
        const pb = transformPoint(b.point, rot, pos, scale);
        const pc = transformPoint(c.point, rot, pos, scale);
        const pd = transformPoint(d0.point, rot, pos, scale);
        const na = transformNormal(a.normal, rot, scale);
        const nb = transformNormal(b.normal, rot, scale);
        const nc = transformNormal(c.normal, rot, scale);
        const nd = transformNormal(d0.normal, rot, scale);
        pushTri(positions, normals, colors, indices, pa, pb, pc, na, nb, nc, color);
        pushTri(positions, normals, colors, indices, pb, pd, pc, nb, nd, nc, color);
      }
    }
  }
}

function meshCylinderOrCapsule(
  positions: number[],
  normals: number[],
  colors: number[],
  indices: number[],
  p: ParticleComponent,
  seg: number,
  rings: number,
  capsule: boolean,
) {
  const rot = (p.rotation ?? [0, 0, 0]) as V3;
  const pos = p.position;
  const scale = p.scale;
  const color = hexRgb(p.material?.color);
  const halfH = 1;
  const bodyRings = Math.max(4, Math.floor(rings * 0.55));
  const capRings = Math.max(4, rings - bodyRings);

  const ringPoint = (u: number, y: number, radius: number, ny: number): { point: V3; normal: V3 } => {
    const th = u * Math.PI * 2;
    const x = Math.cos(th) * radius;
    const z = Math.sin(th) * radius;
    return { point: [x, y, z], normal: norm([x, ny, z]) };
  };

  // Side body
  for (let r = 0; r < bodyRings; r++) {
    const y0 = -halfH + (2 * halfH * r) / bodyRings;
    const y1 = -halfH + (2 * halfH * (r + 1)) / bodyRings;
    for (let j = 0; j < seg; j++) {
      const u0 = j / seg;
      const u1 = (j + 1) / seg;
      const a = ringPoint(u0, y0, 1, 0);
      const b = ringPoint(u1, y0, 1, 0);
      const c = ringPoint(u0, y1, 1, 0);
      const d = ringPoint(u1, y1, 1, 0);
      const pa = transformPoint(a.point, rot, pos, scale);
      const pb = transformPoint(b.point, rot, pos, scale);
      const pc = transformPoint(c.point, rot, pos, scale);
      const pd = transformPoint(d.point, rot, pos, scale);
      const na = transformNormal(a.normal, rot, scale);
      const nb = transformNormal(b.normal, rot, scale);
      const nc = transformNormal(c.normal, rot, scale);
      const nd = transformNormal(d.normal, rot, scale);
      pushTri(positions, normals, colors, indices, pa, pb, pc, na, nb, nc, color);
      pushTri(positions, normals, colors, indices, pb, pd, pc, nb, nd, nc, color);
    }
  }

  if (capsule) {
    // Hemispherical caps
    for (const sign of [-1, 1] as const) {
      for (let r = 0; r < capRings; r++) {
        const v0 = r / capRings;
        const v1 = (r + 1) / capRings;
        const phi0 = v0 * (Math.PI / 2);
        const phi1 = v1 * (Math.PI / 2);
        const y0 = sign * (halfH + Math.sin(phi0));
        const y1 = sign * (halfH + Math.sin(phi1));
        const rad0 = Math.cos(phi0);
        const rad1 = Math.cos(phi1);
        for (let j = 0; j < seg; j++) {
          const u0 = j / seg;
          const u1 = (j + 1) / seg;
          const a = ringPoint(u0, y0, rad0, Math.sin(phi0) * sign);
          const b = ringPoint(u1, y0, rad0, Math.sin(phi0) * sign);
          const c = ringPoint(u0, y1, rad1, Math.sin(phi1) * sign);
          const d = ringPoint(u1, y1, rad1, Math.sin(phi1) * sign);
          const pa = transformPoint(a.point, rot, pos, scale);
          const pb = transformPoint(b.point, rot, pos, scale);
          const pc = transformPoint(c.point, rot, pos, scale);
          const pd = transformPoint(d.point, rot, pos, scale);
          const na = transformNormal(a.normal, rot, scale);
          const nb = transformNormal(b.normal, rot, scale);
          const nc = transformNormal(c.normal, rot, scale);
          const nd = transformNormal(d.normal, rot, scale);
          if (sign > 0) {
            pushTri(positions, normals, colors, indices, pa, pb, pc, na, nb, nc, color);
            pushTri(positions, normals, colors, indices, pb, pd, pc, nb, nd, nc, color);
          } else {
            pushTri(positions, normals, colors, indices, pa, pc, pb, na, nc, nb, color);
            pushTri(positions, normals, colors, indices, pb, pc, pd, nb, nc, nd, color);
          }
        }
      }
    }
  } else {
    // Flat caps
    for (const sign of [-1, 1] as const) {
      const y = sign * halfH;
      const center: V3 = [0, y, 0];
      const cn = transformNormal([0, sign, 0], rot, scale);
      const cp = transformPoint(center, rot, pos, scale);
      for (let j = 0; j < seg; j++) {
        const u0 = j / seg;
        const u1 = (j + 1) / seg;
        const a = ringPoint(u0, y, 1, 0);
        const b = ringPoint(u1, y, 1, 0);
        const pa = transformPoint(a.point, rot, pos, scale);
        const pb = transformPoint(b.point, rot, pos, scale);
        if (sign > 0) pushTri(positions, normals, colors, indices, cp, pa, pb, cn, cn, cn, color);
        else pushTri(positions, normals, colors, indices, cp, pb, pa, cn, cn, cn, color);
      }
    }
  }
}

function meshTorus(
  positions: number[],
  normals: number[],
  colors: number[],
  indices: number[],
  p: ParticleComponent,
  seg: number,
  rings: number,
) {
  const rot = (p.rotation ?? [0, 0, 0]) as V3;
  const pos = p.position;
  const scale = p.scale;
  const color = hexRgb(p.material?.color);
  const R = 0.68;
  const r = 0.28;
  for (let i = 0; i < rings; i++) {
    const v0 = (i / rings) * Math.PI * 2;
    const v1 = ((i + 1) / rings) * Math.PI * 2;
    for (let j = 0; j < seg; j++) {
      const u0 = (j / seg) * Math.PI * 2;
      const u1 = ((j + 1) / seg) * Math.PI * 2;
      const pt = (u: number, v: number): { point: V3; normal: V3 } => {
        const cx = Math.cos(v) * R;
        const cz = Math.sin(v) * R;
        const x = (R + r * Math.cos(u)) * Math.cos(v);
        const y = r * Math.sin(u);
        const z = (R + r * Math.cos(u)) * Math.sin(v);
        const n = norm([x - cx, y, z - cz]);
        return { point: [x, y, z], normal: n };
      };
      const a = pt(u0, v0);
      const b = pt(u1, v0);
      const c = pt(u0, v1);
      const d = pt(u1, v1);
      const pa = transformPoint(a.point, rot, pos, scale);
      const pb = transformPoint(b.point, rot, pos, scale);
      const pc = transformPoint(c.point, rot, pos, scale);
      const pd = transformPoint(d.point, rot, pos, scale);
      const na = transformNormal(a.normal, rot, scale);
      const nb = transformNormal(b.normal, rot, scale);
      const nc = transformNormal(c.normal, rot, scale);
      const nd = transformNormal(d.normal, rot, scale);
      pushTri(positions, normals, colors, indices, pa, pb, pc, na, nb, nc, color);
      pushTri(positions, normals, colors, indices, pb, pd, pc, nb, nd, nc, color);
    }
  }
}

function addComponentMesh(
  positions: number[],
  normals: number[],
  colors: number[],
  indices: number[],
  p: ParticleComponent,
  detail: number,
) {
  const { seg, rings } = resolutionFor(detail);
  const shape = p.shape;
  if (shape === "box") meshBox(positions, normals, colors, indices, p, Math.max(4, Math.floor(seg / 8)), false);
  else if (shape === "rounded-box") meshBox(positions, normals, colors, indices, p, Math.max(6, Math.floor(seg / 6)), true);
  else if (shape === "cylinder") meshCylinderOrCapsule(positions, normals, colors, indices, p, seg, rings, false);
  else if (shape === "capsule") meshCylinderOrCapsule(positions, normals, colors, indices, p, seg, rings, true);
  else if (shape === "torus") meshTorus(positions, normals, colors, indices, p, seg, rings);
  else meshSphereLike(positions, normals, colors, indices, p, seg, rings, shape); // sphere | ellipsoid | cone
}

/**
 * Local Meshy-class exporter — no external 3D API.
 * Builds a single binary GLB with high-subdivision, clean-topology meshes
 * per density component and vertex colors from materials.
 */
export function particleSpecToGlb(spec: ParticleSculptSpec): Blob {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const detail = spec.detail ?? 0.92;

  for (const component of spec.components) {
    addComponentMesh(positions, normals, colors, indices, component, detail);
  }

  // Degenerate safety: at least a tiny unit sphere so the file is valid.
  if (indices.length === 0) {
    addComponentMesh(
      positions,
      normals,
      colors,
      indices,
      {
        shape: "sphere",
        position: [0, 0, 0],
        scale: [0.5, 0.5, 0.5],
        material: { color: "#c7d2e3" },
      },
      detail,
    );
  }

  const p = new Float32Array(positions);
  const n = new Float32Array(normals);
  const c = new Float32Array(colors);
  const idx = new Uint32Array(indices);
  const bytes = p.byteLength + n.byteLength + c.byteLength + idx.byteLength;
  const bin = new Uint8Array(pad4(bytes));
  let off = 0;
  const put = (a: ArrayBufferView) => {
    bin.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), off);
    const start = off;
    off = pad4(off + a.byteLength);
    return start;
  };
  const po = put(p);
  const no = put(n);
  const co = put(c);
  const io = put(idx);

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, positions[i + k]!);
      max[k] = Math.max(max[k]!, positions[i + k]!);
    }
  }

  const json = JSON.stringify({
    asset: {
      version: "2.0",
      generator: "Zeros Local Meshy-Class Sculpt Exporter",
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: spec.name }],
    meshes: [
      {
        name: spec.name,
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 },
            indices: 3,
            mode: 4,
          },
        ],
      },
    ],
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: po, byteLength: p.byteLength },
      { buffer: 0, byteOffset: no, byteLength: n.byteLength },
      { buffer: 0, byteOffset: co, byteLength: c.byteLength },
      { buffer: 0, byteOffset: io, byteLength: idx.byteLength },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: p.length / 3,
        type: "VEC3",
        min,
        max,
      },
      { bufferView: 1, componentType: 5126, count: n.length / 3, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: c.length / 3, type: "VEC3" },
      { bufferView: 3, componentType: 5125, count: idx.length, type: "SCALAR" },
    ],
  });

  const jb = utf8(json);
  const jc = chunk(0x4e4f534a, jb);
  const bc = chunk(0x004e4942, bin);
  const total = 12 + jc.length + bc.length;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  out.set(jc, 12);
  out.set(bc, 12 + jc.length);
  return new Blob([out], { type: "model/gltf-binary" });
}
