import { groqText, manusChat } from "@/lib/providers.server";

type V = [number, number, number];
type Material = { color: string; metallic?: number; roughness?: number };
type Mesh = { p: V[]; n: V[]; uv: number[]; i: number[]; material: Material };
type Part = { type: string; size?: V; radius?: number; height?: number; position?: V; rotation?: V; scale?: V; material?: Material; segments?: number; rings?: number };
type Blueprint = { background?: string; parts?: Part[] };

const ULTRA_SEGMENTS = 96;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const rgb = (h: string | undefined): [number, number, number, number] => {
  const s = (h || "#8aa0b8").replace("#", "");
  const q = s.length === 3 ? s.split("").map((x) => x + x).join("") : s;
  const n = Number.parseInt(q, 16) || 0x8aa0b8;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
};
const unit = (a: V): V => { const d = Math.hypot(...a) || 1; return [a[0] / d, a[1] / d, a[2] / d]; };
const rot = (p: V, r: V): V => {
  let [x, y, z] = p;
  const [cx, sx] = [Math.cos(r[0]), Math.sin(r[0])];
  const [cy, sy] = [Math.cos(r[1]), Math.sin(r[1])];
  const [cz, sz] = [Math.cos(r[2]), Math.sin(r[2])];
  [y, z] = [y * cx - z * sx, y * sx + z * cx];
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  [x, y] = [x * cz - y * sz, x * sz + y * cz];
  return [x, y, z];
};
const transform = (p: V, part: Part): V => {
  const s = part.scale ?? [1, 1, 1];
  const q = rot([p[0] * s[0], p[1] * s[1], p[2] * s[2]], part.rotation ?? [0, 0, 0]);
  const o = part.position ?? [0, 0, 0];
  return [q[0] + o[0], q[1] + o[1], q[2] + o[2]];
};

function box(size: V): Omit<Mesh, "material"> {
  const [x, y, z] = size.map((n) => Math.max(0.01, n / 2)) as V;
  const faces: [V, V[]][] = [
    [[1, 0, 0], [[x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z]]],
    [[-1, 0, 0], [[-x, -y, z], [-x, y, z], [-x, y, -z], [-x, -y, -z]]],
    [[0, 1, 0], [[-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z]]],
    [[0, -1, 0], [[-x, -y, z], [-x, -y, -z], [x, -y, -z], [x, -y, z]]],
    [[0, 0, 1], [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]]],
    [[0, 0, -1], [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]]],
  ];
  const p: V[] = [], n: V[] = [], uv: number[] = [], i: number[] = [];
  for (const [nn, ps] of faces) { const b = p.length; ps.forEach((q, k) => { p.push(q); n.push(nn); uv.push(k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0); }); i.push(b, b + 1, b + 2, b, b + 2, b + 3); }
  return { p, n, uv, i };
}

function sphere(radius: number, segments = ULTRA_SEGMENTS, rings = Math.floor(segments / 2)): Omit<Mesh, "material"> {
  const p: V[] = [], n: V[] = [], uv: number[] = [], i: number[] = [];
  for (let y = 0; y <= rings; y++) {
    const v = y / rings, a = Math.PI * v;
    for (let x = 0; x <= segments; x++) {
      const u = (x / segments) * Math.PI * 2;
      const q: V = [Math.sin(a) * Math.cos(u), Math.cos(a), Math.sin(a) * Math.sin(u)];
      p.push([q[0] * radius, q[1] * radius, q[2] * radius]); n.push(q); uv.push(x / segments, 1 - v);
    }
  }
  for (let y = 0; y < rings; y++) for (let x = 0; x < segments; x++) { const a = y * (segments + 1) + x, b = a + 1, c = a + segments + 1, d = c + 1; i.push(a, c, b, b, c, d); }
  return { p, n, uv, i };
}

function cylinder(radius: number, height: number, segments = ULTRA_SEGMENTS): Omit<Mesh, "material"> {
  const p: V[] = [], n: V[] = [], uv: number[] = [], i: number[] = [];
  for (let y = 0; y <= 1; y++) for (let x = 0; x <= segments; x++) { const a = (x / segments) * Math.PI * 2, q: V = [Math.cos(a), 0, Math.sin(a)]; p.push([q[0] * radius, y ? height / 2 : -height / 2, q[2] * radius]); n.push(q); uv.push(x / segments, y); }
  for (let x = 0; x < segments; x++) { const a = x, b = a + 1, c = a + segments + 1, d = c + 1; i.push(a, c, b, b, c, d); }
  return { p, n, uv, i };
}

function torus(R: number, r: number, segments = ULTRA_SEGMENTS, rings = 32): Omit<Mesh, "material"> {
  const p: V[] = [], n: V[] = [], uv: number[] = [], i: number[] = [];
  for (let x = 0; x <= segments; x++) for (let y = 0; y <= rings; y++) {
    const a = (x / segments) * Math.PI * 2, b = (y / rings) * Math.PI * 2, c = Math.cos(b), s = Math.sin(b);
    p.push([(R + r * c) * Math.cos(a), r * s, (R + r * c) * Math.sin(a)]); n.push([c * Math.cos(a), s, c * Math.sin(a)]); uv.push(x / segments, y / rings);
  }
  for (let x = 0; x < segments; x++) for (let y = 0; y < rings; y++) { const a = x * (rings + 1) + y, b = a + 1, c = a + rings + 1, d = c + 1; i.push(a, c, b, b, c, d); }
  return { p, n, uv, i };
}

function paramSurface(width: number, length: number, height: number, detail = 128, profile = "body"): Omit<Mesh, "material"> {
  const nx = detail, nz = Math.floor(detail * 0.52), p: V[] = [], n: V[] = [], uv: number[] = [], i: number[] = [];
  const surf = (u: number, v: number): V => {
    const x = (u - 0.5) * length, z = (v - 0.5) * width;
    const edge = Math.pow(Math.max(0, 1 - Math.abs(z) / (width * 0.5)), 0.42);
    let y = height;
    if (profile === "body") y += 0.30 * edge - 0.18 * Math.pow(Math.abs(x) / (length * 0.5), 1.7);
    if (profile === "hood") y += 0.22 * edge - 0.20 * Math.pow(Math.max(0, x / (length * 0.5)), 2);
    if (profile === "roof") y += 0.45 * edge - 0.12 * Math.pow(Math.abs(x) / (length * 0.5), 2);
    return [x, y, z];
  };
  const normalAt = (u: number, v: number): V => {
    const eu = 1 / nx, ev = 1 / nz;
    const a = surf(clamp(u - eu, 0, 1), v), b = surf(clamp(u + eu, 0, 1), v), c = surf(u, clamp(v - ev, 0, 1)), d = surf(u, clamp(v + ev, 0, 1));
    return unit([(a[1] - b[1]) * (d[2] - c[2]), (b[0] - a[0]) * (d[2] - c[2]) - (d[0] - c[0]) * (b[2] - a[2]), (a[1] - b[1]) * (d[0] - c[0])]);
  };
  for (let z = 0; z <= nz; z++) for (let x = 0; x <= nx; x++) { const u = x / nx, v = z / nz; p.push(surf(u, v)); n.push(normalAt(u, v)); uv.push(u, v); }
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) { const a = z * (nx + 1) + x, b = a + 1, c = a + nx + 1, d = c + 1; i.push(a, c, b, b, c, d); }
  return { p, n, uv, i };
}

function sportsCar(): Mesh[] {
  const out: Mesh[] = [];
  const paint: Material = { color: "#b50f22", metallic: 0.82, roughness: 0.16 };
  const dark: Material = { color: "#070a0f", metallic: 0.58, roughness: 0.12 };
  const chrome: Material = { color: "#d7e1ea", metallic: 0.96, roughness: 0.08 };
  const glass: Material = { color: "#102a40", metallic: 0.32, roughness: 0.08 };
  const addPart = (geo: Omit<Mesh, "material">, part: Part, material: Material) => out.push({ ...geo, p: geo.p.map((q) => transform(q, part)), n: geo.n.map((q) => unit(rot(q, part.rotation ?? [0, 0, 0]))), material });
  addPart(paramSurface(4.0, 8.6, 0.72, 150, "body"), { position: [0, 0.75, 0] }, paint);
  addPart(paramSurface(3.55, 4.5, 1.52, 126, "roof"), { position: [0.15, 1.05, 0] }, glass);
  addPart(paramSurface(3.9, 3.6, 1.38, 126, "hood"), { position: [2.15, 1.0, 0] }, paint);
  addPart(box([7.8, 0.16, 3.9]), { position: [0, 0.34, 0] }, dark);
  addPart(box([2.4, 0.18, 3.65]), { position: [4.0, 0.43, 0] }, dark);
  addPart(box([2.0, 0.16, 3.55]), { position: [-3.75, 0.46, 0] }, dark);
  addPart(box([0.22, 1.1, 4.2]), { position: [-2.8, 1.55, 0], rotation: [0, 0.12, 0] }, chrome);
  addPart(box([0.22, 1.1, 4.2]), { position: [2.8, 1.55, 0], rotation: [0, -0.12, 0] }, chrome);
  addPart(box([0.18, 0.32, 5.0]), { position: [-3.15, 1.95, 0] }, dark);
  addPart(box([0.18, 0.32, 5.0]), { position: [3.15, 1.95, 0] }, dark);
  for (const x of [-2.65, 2.65]) for (const z of [-1.65, 1.65]) {
    addPart(torus(0.82, 0.31, 144, 40), { position: [x, 0.75, z], rotation: [Math.PI / 2, 0, 0] }, dark);
    addPart(torus(0.56, 0.12, 112, 28), { position: [x, 0.75, z], rotation: [Math.PI / 2, 0, 0] }, chrome);
    addPart(cylinder(0.48, 0.22, 112), { position: [x, 0.75, z], rotation: [Math.PI / 2, 0, 0] }, chrome);
    for (let s = 0; s < 12; s++) { const a = (s / 12) * Math.PI * 2; addPart(box([0.08, 0.08, 0.72]), { position: [x + Math.cos(a) * 0.34, 0.75 + Math.sin(a) * 0.34, z], rotation: [Math.PI / 2, 0, a] }, chrome); }
  }
  for (const z of [-1.0, 1.0]) {
    addPart(sphere(0.38, 96, 48), { position: [3.85, 1.0, z], scale: [1.6, 0.55, 1.1] }, { color: "#dff8ff", metallic: 0.15, roughness: 0.04 });
    addPart(box([0.95, 0.12, 0.08]), { position: [-4.05, 1.12, z] }, { color: "#ff1537", metallic: 0.18, roughness: 0.08 });
  }
  for (const z of [-1.45, 1.45]) { addPart(box([4.4, 0.22, 0.10]), { position: [0, 1.06, z] }, chrome); addPart(box([1.2, 0.15, 0.20]), { position: [-1.4, 1.20, z] }, dark); }
  addPart(box([1.7, 0.10, 0.34]), { position: [-3.75, 1.45, 0] }, chrome);
  return out;
}

function genericPart(part: Part): Mesh {
  const type = (part.type || "sphere").toLowerCase(), segments = clamp(Math.round(part.segments ?? ULTRA_SEGMENTS), 16, 160);
  let geo: Omit<Mesh, "material">;
  if (["box", "cube", "panel", "armor"].includes(type)) geo = box(part.size ?? [1, 1, 1]);
  else if (["cylinder", "rod", "limb"].includes(type)) geo = cylinder(Math.max(0.02, part.radius ?? 0.5), Math.max(0.02, part.height ?? 1), segments);
  else if (["torus", "ring", "loop"].includes(type)) geo = torus(part.radius ? part.radius * 2 : 1, part.radius ?? 0.25, segments, 32);
  else geo = sphere(Math.max(0.02, part.radius ?? 0.5), segments, Math.floor(segments / 2));
  return { ...geo, p: geo.p.map((q) => transform(q, part)), n: geo.n.map((q) => unit(rot(q, part.rotation ?? [0, 0, 0]))), material: part.material ?? { color: "#8aa0b8", metallic: 0.25, roughness: 0.28 } };
}

function b64(bytes: Uint8Array): string { let s = ""; for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode(...bytes.subarray(k, Math.min(k + 0x8000, bytes.length))); return btoa(s); }
function typedBytes(a: Float32Array | Uint32Array): Uint8Array { return new Uint8Array(a.buffer, a.byteOffset, a.byteLength); }

function gltf(meshes: Mesh[]): { url: string; triangles: number; vertices: number } {
  const buffers: { uri: string; byteLength: number }[] = [], views: any[] = [], accessors: any[] = [], meshDocs: any[] = [], nodes: any[] = [], materials: any[] = [];
  let triangles = 0, vertices = 0;
  meshes.forEach((m, mi) => {
    const pos = new Float32Array(m.p.flat()), nor = new Float32Array(m.n.flat()), uv = new Float32Array(m.uv), idx = new Uint32Array(m.i);
    const total = pos.byteLength + nor.byteLength + uv.byteLength + idx.byteLength, bin = new Uint8Array(total); let off = 0;
    const po = off; bin.set(typedBytes(pos), off); off += pos.byteLength;
    const no = off; bin.set(typedBytes(nor), off); off += nor.byteLength;
    const uo = off; bin.set(typedBytes(uv), off); off += uv.byteLength;
    const io = off; bin.set(typedBytes(idx), off);
    const bufferIndex = buffers.length; buffers.push({ uri: `data:application/octet-stream;base64,${b64(bin)}`, byteLength: total });
    const baseV = views.length, baseA = accessors.length;
    views.push({ buffer: bufferIndex, byteOffset: po, byteLength: pos.byteLength, target: 34962 }, { buffer: bufferIndex, byteOffset: no, byteLength: nor.byteLength, target: 34962 }, { buffer: bufferIndex, byteOffset: uo, byteLength: uv.byteLength, target: 34962 }, { buffer: bufferIndex, byteOffset: io, byteLength: idx.byteLength, target: 34963 });
    accessors.push({ bufferView: baseV, componentType: 5126, count: m.p.length, type: "VEC3" }, { bufferView: baseV + 1, componentType: 5126, count: m.n.length, type: "VEC3" }, { bufferView: baseV + 2, componentType: 5126, count: m.p.length, type: "VEC2" }, { bufferView: baseV + 3, componentType: 5125, count: m.i.length, type: "SCALAR" });
    const color = rgb(m.material.color);
    materials.push({ pbrMetallicRoughness: { baseColorFactor: color, metallicFactor: clamp(m.material.metallic ?? 0.25, 0, 1), roughnessFactor: clamp(m.material.roughness ?? 0.28, 0.04, 1) } });
    meshDocs.push({ primitives: [{ attributes: { POSITION: baseA, NORMAL: baseA + 1, TEXCOORD_0: baseA + 2 }, indices: baseA + 3, material: materials.length - 1 }] });
    nodes.push({ mesh: mi, name: `ZerosUltraPart${mi}` });
    vertices += m.p.length; triangles += Math.floor(m.i.length / 3);
  });
  const doc = { asset: { version: "2.0", generator: "Zeros Ultra Native 3D" }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes: meshDocs, materials, bufferViews: views, accessors, buffers };
  return { url: `data:model/gltf+json;base64,${b64(new TextEncoder().encode(JSON.stringify(doc)))}`, triangles, vertices };
}

function cleanJson(text: string): Blueprint | null { const c = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim(); try { return JSON.parse(c); } catch { const m = c.match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } } }

async function blueprint(prompt: string): Promise<Blueprint> {
  const system = `You are Zeros Ultra Studio's senior 3D art director. Design a production asset blueprint for a procedural engine. Return ONLY JSON with {"background":"#hex","parts":[...]}. Every part may use sphere, box, cylinder, torus, panel, limb, capsule, or spike and should include dimensions, position, rotation, scale, material, segments. For ordinary assets use 24-96 segments; prioritize complete silhouettes, mechanical joins, symmetry and realistic proportions. For vehicles, include body, roof/cabin, glass, wheels, rims, lights, vents, splitter, diffuser, spoiler and aerodynamic details. Do not mention or call any external 3D generator.`;
  const m = await manusChat(system, [{ role: "user", content: prompt }], 30000);
  const parsed = m ? cleanJson(m) : null;
  if (parsed?.parts?.length) return parsed;
  const g = await groqText(system, prompt);
  const fallback = g ? cleanJson(g) : null;
  return fallback?.parts?.length ? fallback : { background: "#070a10", parts: [{ type: "sphere", radius: 1, position: [0, 1, 0], material: { color: "#9db0c5" } }] };
}

export async function generateNativeModel(prompt: string) {
  const lower = prompt.toLowerCase();
  const meshes = /sports car|supercar|race car|lamborghini|ferrari|porsche|car/.test(lower) ? sportsCar() : (await blueprint(prompt)).parts!.slice(0, 96).map(genericPart);
  const asset = gltf(meshes);
  if (!asset.vertices || !asset.triangles) throw new Error("Zeros Ultra Native 3D produced an empty scene.");
  return { ...asset, previewUrl: null, quality: "ultra-web-production", note: "Adaptive ultra geometry; billion-polygon meshes are not web/mobile-safe." };
}
