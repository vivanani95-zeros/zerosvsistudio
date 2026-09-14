import { groqText, manusChat } from "@/lib/providers.server";

type Vec3 = [number, number, number];
type Part = { type: string; size?: Vec3; radius?: number; height?: number; majorRadius?: number; minorRadius?: number; position?: Vec3; rotation?: Vec3; scale?: Vec3; color?: string; metallic?: number; roughness?: number; segments?: number };
type Blueprint = { name?: string; parts?: Part[]; camera?: { azimuth?: number; elevation?: number }; background?: string };
type Vertex = { p: Vec3; n: Vec3; uv: [number, number] };
type Mesh = { vertices: Vertex[]; indices: number[]; color: [number, number, number, number]; metallic: number; roughness: number };

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const v = (x = 0, y = 0, z = 0): Vec3 => [x, y, z];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => { const d = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / d, a[1] / d, a[2] / d]; };
const rot = (p: Vec3, r: Vec3): Vec3 => {
  let [x, y, z] = p; const [cx, sx] = [Math.cos(r[0]), Math.sin(r[0])]; const [cy, sy] = [Math.cos(r[1]), Math.sin(r[1])]; const [cz, sz] = [Math.cos(r[2]), Math.sin(r[2])];
  [y, z] = [y * cx - z * sx, y * sx + z * cx]; [x, z] = [x * cy + z * sy, -x * sy + z * cy]; [x, y] = [x * cz - y * sz, x * sz + y * cz];
  return [x, y, z];
};
function color(hex = "#8aa0b8"): [number, number, number, number] { const h = hex.replace("#", ""); const n = Number.parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1]; }

function box(s: Vec3): { vertices: Vertex[]; indices: number[] } {
  const [x, y, z] = s.map((n) => Math.max(0.02, n / 2)) as Vec3;
  const faces: [Vec3, Vec3[]][] = [
    [[1,0,0], [[x,-y,-z],[x,y,-z],[x,y,z],[x,-y,z]]], [[-1,0,0], [[-x,-y,z],[-x,y,z],[-x,y,-z],[-x,-y,-z]]],
    [[0,1,0], [[-x,y,-z],[-x,y,z],[x,y,z],[x,y,-z]]], [[0,-1,0], [[-x,-y,z],[-x,-y,-z],[x,-y,-z],[x,-y,z]]],
    [[0,0,1], [[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]]], [[0,0,-1], [[x,-y,-z],[-x,-y,-z],[-x,y,-z],[x,y,-z]]],
  ];
  const vertices: Vertex[] = []; const indices: number[] = [];
  for (const [n, ps] of faces) { const base = vertices.length; ps.forEach((p, i) => vertices.push({ p, n, uv: [i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0] })); indices.push(base, base+1, base+2, base, base+2, base+3); }
  return { vertices, indices };
}
function sphere(radius: number, seg = 32, rings = 20): { vertices: Vertex[]; indices: number[] } {
  const vertices: Vertex[] = []; const indices: number[];
  for (let y=0;y<=rings;y++){ const t=y/rings, p=Math.PI*t; for(let x=0;x<=seg;x++){const u=x/seg*2*Math.PI; const n:[number,number,number]=[Math.sin(p)*Math.cos(u),Math.cos(p),Math.sin(p)*Math.sin(u)]; vertices.push({p:mul(n,radius),n,uv:[x/seg,1-t]});}}
  indices=[]; for(let y=0;y<rings;y++)for(let x=0;x<seg;x++){const a=y*(seg+1)+x,b=a+1,c=a+seg+1,d=c+1;indices.push(a,c,b,b,c,d);} return {vertices,indices};
}
function cylinder(radius: number, height: number, seg=32, top=true, bottom=true): { vertices: Vertex[]; indices: number[] } {
  const vertices: Vertex[]=[]; const indices:number[]; const h=height/2;
  for(let y=0;y<=1;y++)for(let i=0;i<=seg;i++){const a=i/seg*2*Math.PI,n:[number,number,number]=[Math.cos(a),0,Math.sin(a)];vertices.push({p:[n[0]*radius,y?h:-h,n[2]*radius],n,uv:[i/seg,y]});}
  indices=[];for(let i=0;i<seg;i++){const a=i,b=i+1,c=seg+1+i,d=c+1;indices.push(a,c,b,b,c,d);}
  const cap=(yy:number,nn:number[])=>{const base=vertices.length;vertices.push({p:[0,yy,0],n:nn as Vec3,uv:[.5,.5]});for(let i=0;i<=seg;i++){const a=i/seg*2*Math.PI;vertices.push({p:[Math.cos(a)*radius,yy,Math.sin(a)*radius],n:nn as Vec3,uv:[(Math.cos(a)+1)/2,(Math.sin(a)+1)/2]});}for(let i=0;i<seg;i++){const q=base+1+i,r=q+1;indices.push(nn[1]>0?base,q,r:base,r,q);}};
  if(top)cap(h,[0,1,0]);if(bottom)cap(-h,[0,-1,0]);return {vertices,indices};
}
function torus(R:number,r:number,seg=40,tube=12):{vertices:Vertex[];indices:number[]} { const vertices:Vertex[]=[];const indices:number[];for(let i=0;i<=seg;i++){const u=i/seg*2*Math.PI;for(let j=0;j<=tube;j++){const q=j/tube*2*Math.PI;const n:[number,number,number]=[Math.cos(u)*Math.cos(q),Math.sin(q),Math.sin(u)*Math.cos(q)];vertices.push({p:[(R+r*Math.cos(q))*Math.cos(u),r*Math.sin(q),(R+r*Math.cos(q))*Math.sin(u)],n,uv:[i/seg,j/tube]});}}indices=[];for(let i=0;i<seg;i++)for(let j=0;j<tube;j++){const a=i*(tube+1)+j,b=a+1,c=a+tube+1,d=c+1;indices.push(a,c,b,b,c,d);}return{vertices,indices}; }
function cone(radius:number,height:number,seg=32):{vertices:Vertex[];indices:number[]} {const vertices:Vertex[]=[];const indices:number[];for(let i=0;i<=seg;i++){const a=i/seg*2*Math.PI;vertices.push({p:[Math.cos(a)*radius,-height/2,Math.sin(a)*radius],n:norm([Math.cos(a),radius/height,Math.sin(a)]),uv:[i/seg,0]});}vertices.push({p:[0,height/2,0],n:[0,1,0],uv:[.5,1]});const tip=vertices.length-1;indices=[];for(let i=0;i<seg;i++)indices.push(i,tip,i+1);return{vertices,indices};}

function primitive(part: Part): { vertices: Vertex[]; indices: number[] } {
  const type=(part.type||"sphere").toLowerCase(); const r=Math.max(.03,part.radius??.5); const h=Math.max(.03,part.height??1); const s=part.segments??32;
  if(type==="box"||type==="cube"||type==="armor"||type==="panel") return box(part.size??[1,1,1]);
  if(type==="cylinder"||type==="rod"||type==="limb") return cylinder(r,h,s);
  if(type==="cone"||type==="spike") return cone(r,h,s);
  if(type==="torus"||type==="ring"||type==="loop") return torus(part.majorRadius??r*2,part.minorRadius??r*.35,s,Math.max(8,Math.floor(s/3)));
  if(type==="capsule"||type==="rounded") { const a=cylinder(r,h,s,false,false), b=sphere(r,s,Math.max(10,Math.floor(s/2))); for(const x of b.vertices)x.p[1]+=h/2; const c=sphere(r,s,Math.max(10,Math.floor(s/2)));for(const x of c.vertices)x.p[1]-=h/2;return{vertices:[...a.vertices,...b.vertices,...c.vertices],indices:[...a.indices,...b.indices.map(i=>i+a.vertices.length),...c.indices.map(i=>i+a.vertices.length+b.vertices.length)]}; }
  return sphere(r,s,Math.max(12,Math.floor(s/1.6)));
}

function sanitizeBlueprint(raw: unknown): Blueprint {
  const b=(raw&&typeof raw==="object"?raw:{}) as Blueprint; const parts=Array.isArray(b.parts)?b.parts:[];
  return {name:String(b.name||"Zeros Native Asset"),background:String(b.background||"#0b1020"),camera:b.camera,parts:parts.slice(0,96).map((p)=>({type:String(p?.type||"sphere"),size:Array.isArray(p?.size)?p.size.map(Number).slice(0,3) as Vec3:undefined,radius:Number(p?.radius),height:Number(p?.height),majorRadius:Number(p?.majorRadius),minorRadius:Number(p?.minorRadius),position:Array.isArray(p?.position)?p.position.map(Number).slice(0,3) as Vec3:[0,0,0],rotation:Array.isArray(p?.rotation)?p.rotation.map(Number).slice(0,3) as Vec3:[0,0,0],scale:Array.isArray(p?.scale)?p.scale.map(Number).slice(0,3) as Vec3:[1,1,1],color:String(p?.color||"#8aa0b8"),metallic:clamp(Number(p?.metallic??.25),0,1),roughness:clamp(Number(p?.roughness??.35),.05,1),segments:clamp(Math.round(Number(p?.segments??24)),8,64)}))};
}

function extractJson(text:string):unknown|null { const clean=text.replace(/^```(?:json)?\s*/i,"").replace(/```\s*$/i,"").trim();try{return JSON.parse(clean);}catch{const m=clean.match(/\{[\s\S]*\}/);if(!m)return null;try{return JSON.parse(m[0]);}catch{return null;}} }

async function blueprintFromAI(prompt:string):Promise<Blueprint|null>{
  const system=`You are Zeros Native 3D's elite asset architect. Convert the user's 3D request into a deterministic procedural scene blueprint. Zeros itself will build the mesh from scratch; NEVER mention Meshy, Tripo, external 3D generators, or image URLs. Use up to 48 purposeful parts. Combine spheres, boxes, cylinders, cones, torus/rings, capsules and rounded forms to make a complete recognizable production asset. Be precise about proportions, symmetry, materials and colors. Return ONLY JSON with this schema: {"name":"...","background":"#hex","camera":{"azimuth":number,"elevation":number},"parts":[{"type":"sphere|box|cylinder|cone|torus|capsule|ring|spike|panel|limb","size":[x,y,z],"radius":number,"height":number,"majorRadius":number,"minorRadius":number,"position":[x,y,z],"rotation":[rx,ry,rz],"scale":[x,y,z],"color":"#hex","metallic":0-1,"roughness":0.05-1,"segments":8-64}]}. Coordinate Y is up. Keep dimensions around -5..5. Include all important requested components.`;
  const manus=await manusChat(system,[{role:"user",content:prompt}],45000); if(manus){const b=extractJson(manus);if(b)return sanitizeBlueprint(b);}
  const groq=await groqText(system,prompt); if(groq){const b=extractJson(groq);if(b)return sanitizeBlueprint(b);} return null;
}

function fallbackBlueprint(prompt:string):Blueprint { const lower=prompt.toLowerCase(); const parts:Part[]=[{type:"capsule",radius:1,height:2.8,position:[0,1.4,0],color:"#8aa0b8"},{type:"sphere",radius:1.05,position:[0,3.25,0],color:"#aabbd0"},{type:"cylinder",radius:.32,height:2.8,position:[-1.35,1.7,0],rotation:[0,0,-.15],color:"#596b80"},{type:"cylinder",radius:.32,height:2.8,position:[1.35,1.7,0],rotation:[0,0,.15],color:"#596b80"}]; if(lower.includes("sword")||lower.includes("weapon")){parts.push({type:"box",size:[.22,3,.12],position:[0,1.8,1],color:"#d6dce5",metallic:.9,roughness:.18},{type:"torus",majorRadius:.5,minorRadius:.08,position:[0,.35,1],color:"#d0a84c",metallic:.8});} return {name:"Zeros Native Asset",parts}; }

function buildMeshes(bp:Blueprint):Mesh[]{ return (bp.parts??[]).map((p)=>{const q=primitive(p);const position=p.position??[0,0,0],rotation=p.rotation??[0,0,0],scale=p.scale??[1,1,1];const verts=q.vertices.map(x=>{const sp:[number,number,number]=[x.p[0]*scale[0],x.p[1]*scale[1],x.p[2]*scale[2]];const sn=norm(rot(x.n,rotation));return{p:add(rot(sp,rotation),position),n:sn,uv:x.uv};});return{vertices:verts,indices:q.indices,color:color(p.color),metallic:clamp(p.metallic??.25,0,1),roughness:clamp(p.roughness??.35,.05,1)};}); }

function glb(meshes:Mesh[]):string { const materials:any[]=[];const nodes:any[]=[];const meshesJson:any[]=[];const views:any[]=[];const accessors:any[]=[];const chunks:number[]=[];let offset=0;const align=()=>{while(offset%4){chunks.push(0);offset++;}};const push=(arr:ArrayLike<number>,bytes:number)=>{const a=new Uint8Array(arr.buffer,arr.byteOffset,arr.byteLength);for(const x of a)chunks.push(x);offset+=a.byteLength;align();};const addBuffer=(data:Float32Array|Uint16Array|Uint32Array,componentType:number,type:string,count:number,target:number)=>{align();const start=offset;push(data,data.byteLength);const view=views.length;views.push({buffer:0,byteOffset:start,byteLength:data.byteLength,target});const acc=accessors.length;accessors.push({bufferView:view,componentType,type,count});return acc;};
  for(const m of meshes){const pos:number[]=[],norms:number[]=[],uv:number[]=[],idx:number[]=[];for(const x of m.vertices){pos.push(...x.p);norms.push(...x.n);uv.push(...x.uv);}idx.push(...m.indices);const maxp=[-Infinity,-Infinity,-Infinity],minp=[Infinity,Infinity,Infinity];for(let i=0;i<pos.length;i+=3)for(let k=0;k<3;k++){minp[k]=Math.min(minp[k],pos[i+k]);maxp[k]=Math.max(maxp[k],pos[i+k]);}const pa=addBuffer(new Float32Array(pos),5126,"VEC3",m.vertices.length,34962),na=addBuffer(new Float32Array(norms),5126,"VEC3",m.vertices.length,34962),ua=addBuffer(new Float32Array(uv),5126,"VEC2",m.vertices.length,34962),ia=addBuffer(new Uint32Array(idx),5125,"SCALAR",idx.length,34963);const mi=materials.length;materials.push({pbrMetallicRoughness:{baseColorFactor:m.color,metallicFactor:m.metallic,roughnessFactor:m.roughness},doubleSided:false});const msh=meshesJson.length;meshesJson.push({primitives:[{attributes:{POSITION:pa,NORMAL:na,TEXCOORD_0:ua},indices:ia,material:mi,mode:4}],name:`ZerosMesh${msh}`});nodes.push({mesh:msh,name:`ZerosPart${msh}`});}
  const json=JSON.stringify({asset:{version:"2.0",generator:"Zeros Native 3D Engine"},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes:meshesJson,materials,bufferViews:views,accessors,buffers:[{byteLength:offset}]});const enc=new TextEncoder();const jb=enc.encode(json);const pad=(n:number)=>n+(4-n%4)%4;const total=12+8+pad(jb.length)+8+pad(offset);const out=new Uint8Array(total);const dv=new DataView(out.buffer);dv.setUint32(0,0x46546c67,true);dv.setUint32(4,2,true);dv.setUint32(8,total,true);let at=12;dv.setUint32(at,jb.length,true);dv.setUint32(at+4,0x4e4f534a,true);out.set(jb,at+8);at+=8+pad(jb.length);dv.setUint32(at,offset,true);dv.setUint32(at+4,0x004e4942,true);for(let i=0;i<chunks.length;i++)out[at+8+i]=chunks[i]??0;let bin="";const step=0x8000;for(let i=0;i<out.length;i+=step)bin+=String.fromCharCode(...out.subarray(i,Math.min(i+step,out.length)));return`data:model/gltf-binary;base64,${btoa(bin)}`; }

function previewSvg(meshes:Mesh[],background:string):string { const pts:Vec3[]=[];for(const m of meshes)for(const x of m.vertices)pts.push(x.p);let max=1;for(const p of pts)max=Math.max(max,Math.abs(p[0]),Math.abs(p[1]),Math.abs(p[2]));const proj=(p:Vec3)=>{const x=(p[0]-p[2])*.72,y=p[1]-(p[0]+p[2])*.28;return[320+x/max*230,300-y/max*230] as [number,number]};const polys:string[]=[];for(const m of meshes){for(let i=0;i<m.indices.length;i+=3){const a=m.vertices[m.indices[i]],b=m.vertices[m.indices[i+1]],c=m.vertices[m.indices[i+2]];if(!a||!b||!c)continue;const A=proj(a.p),B=proj(b.p),C=proj(c.p);const light=clamp(.55+.45*(a.n[1]+b.n[1]+c.n[1])/3,0,1);const col=`rgb(${Math.round(m.color[0]*255*light)},${Math.round(m.color[1]*255*light)},${Math.round(m.color[2]*255*light)})`;polys.push(`<polygon points="${A[0].toFixed(1)},${A[1].toFixed(1)} ${B[0].toFixed(1)},${B[1].toFixed(1)} ${C[0].toFixed(1)},${C[1].toFixed(1)}" fill="${col}"/>`);}}return`data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640"><rect width="640" height="640" fill="${background}"/><g stroke="rgba(255,255,255,.08)" stroke-width=".5">${polys.join("")}</g><text x="32" y="610" fill="white" font-family="sans-serif" font-size="18">ZEROS NATIVE 3D • production inspection preview</text></svg>`)}`; }

export async function generateNativeModel(prompt:string):Promise<{url:string;previewUrl:string;blueprint:Blueprint}>{ const blueprint=await blueprintFromAI(prompt)??fallbackBlueprint(prompt);const meshes=buildMeshes(blueprint);if(!meshes.length)throw new Error("Zeros Native 3D produced an empty scene.");return{url:glb(meshes),previewUrl:previewSvg(meshes,blueprint.background??"#0b1020"),blueprint}; }
