import { groqText, manusChat } from "@/lib/providers.server";

type V = [number, number, number];
type Material = { color: string; metallic?: number; roughness?: number };
type Mesh = { p: V[]; n: V[]; uv: number[]; i: number[]; material: Material; name?: string };
type Part = { type: string; size?: V; radius?: number; height?: number; position?: V; rotation?: V; scale?: V; material?: Material; segments?: number; rings?: number; name?: string };
type Blueprint = { background?: string; parts?: Part[] };

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const unit = (a: V): V => { const d = Math.hypot(...a) || 1; return [a[0] / d, a[1] / d, a[2] / d]; };
const rot = (p: V, r: V): V => {
  let [x, y, z] = p;
  const [cx, sx] = [Math.cos(r[0]), Math.sin(r[0])]; const [cy, sy] = [Math.cos(r[1]), Math.sin(r[1])]; const [cz, sz] = [Math.cos(r[2]), Math.sin(r[2])];
  [y, z] = [y * cx - z * sx, y * sx + z * cx]; [x, z] = [x * cy + z * sy, -x * sy + z * cy]; [x, y] = [x * cz - y * sz, x * sz + y * cz];
  return [x, y, z];
};
const transform = (p: V, part: Part): V => { const s = part.scale ?? [1, 1, 1]; const q = rot([p[0] * s[0], p[1] * s[1], p[2] * s[2]], part.rotation ?? [0, 0, 0]); const o = part.position ?? [0, 0, 0]; return [q[0] + o[0], q[1] + o[1], q[2] + o[2]]; };

function box(size: V): Omit<Mesh, "material" | "name"> {
  const [x, y, z] = size.map((n) => Math.max(.01, n / 2)) as V;
  const faces: [V, V[]][] = [
    [[1,0,0], [[x,-y,-z],[x,y,-z],[x,y,z],[x,-y,z]]], [[-1,0,0], [[-x,-y,z],[-x,y,z],[-x,y,-z],[-x,-y,-z]]],
    [[0,1,0], [[-x,y,-z],[-x,y,z],[x,y,z],[x,y,-z]]], [[0,-1,0], [[-x,-y,z],[-x,-y,-z],[x,-y,-z],[x,-y,z]]],
    [[0,0,1], [[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]]], [[0,0,-1], [[x,-y,-z],[-x,-y,-z],[-x,y,-z],[x,y,-z]]],
  ];
  const p: V[] = [], n: V[] = [], uv: number[] = [], i: number[] = [];
  for (const [nn, ps] of faces) { const b = p.length; ps.forEach((q,k) => { p.push(q); n.push(nn); uv.push(k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0); }); i.push(b,b+1,b+2,b,b+2,b+3); }
  return { p,n,uv,i };
}

function cylinder(radius: number, height: number, segments = 96): Omit<Mesh, "material" | "name"> {
  const p: V[] = [], n: V[] = [], uv: number[] = [], i: number[] = [];
  for (let y=0;y<=1;y++) for (let x=0;x<=segments;x++) { const a=x/segments*Math.PI*2, q:V=[Math.cos(a),0,Math.sin(a)]; p.push([q[0]*radius,y?height/2:-height/2,q[2]*radius]); n.push(q); uv.push(x/segments,y); }
  for (let x=0;x<segments;x++) { const a=x,b=a+1,c=a+segments+1,d=c+1;i.push(a,c,b,b,c,d); }
  return {p,n,uv,i};
}

function torus(R:number,r:number,segments=128,rings=40):Omit<Mesh,"material"|"name"> {
  const p:V[]=[],n:V[]=[],uv:number[]=[],i:number[]=[];
  for(let x=0;x<=segments;x++) for(let y=0;y<=rings;y++){const a=x/segments*Math.PI*2,b=y/rings*Math.PI*2,c=Math.cos(b),s=Math.sin(b);p.push([(R+r*c)*Math.cos(a),r*s,(R+r*c)*Math.sin(a)]);n.push([c*Math.cos(a),s,c*Math.sin(a)]);uv.push(x/segments,y/rings);}
  for(let x=0;x<segments;x++)for(let y=0;y<rings;y++){const a=x*(rings+1)+y,b=a+1,c=a+rings+1,d=c+1;i.push(a,c,b,b,c,d);} return{p,n,uv,i};
}

/** A closed sculpt surface: longitudinal stations + elliptical cross-section. */
function sculptBody(length:number,width:number,height:number,stations=320,loops=96,variant:"body"|"cabin"="body"):Omit<Mesh,"material"|"name"> {
  const p:V[]=[],n:V[]=[],uv:number[]=[],i:number[]=[];
  for(let s=0;s<=stations;s++){
    const u=s/stations, x=(u-.5)*length, a=Math.abs(x)/(length*.5);
    const nose=Math.pow(clamp(1-a,0,1),.62), taper=.72+.28*Math.pow(nose,.45);
    const centerY=variant==="cabin"?height+.28*Math.pow(nose,.7):height;
    const h=height*(variant==="cabin"?(0.58+0.42*Math.pow(nose,.65)):(0.72+0.28*nose));
    const w=width*taper*(variant==="cabin"?(.72+.28*Math.pow(nose,.8)):1);
    for(let j=0;j<=loops;j++){
      const t=j/loops*Math.PI*2, c=Math.cos(t), ss=Math.sin(t);
      const shoulder=Math.pow(Math.abs(c),.62);
      const yy=centerY+ss*h*(.76+.24*shoulder);
      const zz=c*w*(.90+.10*Math.cos(t*2));
      const lower=ss<-.15?1+.16*Math.pow((-ss-.15)/.85,1.7):1;
      p.push([x,yy,zz*lower]);
      const du=1/stations, dv=1/loops;
      const sx=(u<1?((u+du-.5)*length):x)-x;
      const sa=variant==="cabin"?height+.28*Math.pow(Math.max(0,1-Math.abs((u+du-.5)*length)/(length*.5)),.7):height;
      const tc=t+dv*Math.PI*2;
      const approx:[number,number,number]=[Math.sin(tc)*h,0,Math.cos(tc)*w];
      n.push(unit([-(yy-centerY)/Math.max(.1,length),approx[0],approx[2]]));
      uv.push(u,j/loops);
    }
  }
  for(let s=0;s<stations;s++)for(let j=0;j<loops;j++){const a=s*(loops+1)+j,b=a+1,c=a+loops+1,d=c+1;i.push(a,c,b,b,c,d);}
  return{p,n,uv,i};
}

function fender(length:number,width:number,height:number):Omit<Mesh,"material"|"name"> {
  const p:V[]=[],n:V[]=[],uv:number[]=[],i:number[]=[]; const sx=length, sz=width;
  const nx=160,nz=28;
  for(let z=0;z<=nz;z++)for(let x=0;x<=nx;x++){const u=x/nx,v=z/nz,xx=(u-.5)*sx,zz=(v-.5)*sz;const edge=Math.pow(Math.max(0,1-Math.abs(zz)/(sz*.5)),.55);const yy=height+.10*edge+.05*Math.cos(u*Math.PI*2);p.push([xx,yy,zz]);n.push(unit([-.03,.98,.02]));uv.push(u,v);}
  for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){const a=z*(nx+1)+x,b=a+1,c=a+nx+1,d=c+1;i.push(a,c,b,b,c,d);}return{p,n,uv,i};
}

function wheelDetail(x:number,z:number,paint:Material,dark:Material,chrome:Material):Mesh[]{
  const out:Mesh[]=[]; const add=(g:Omit<Mesh,"material"|"name">,m:Material,name:string,r:[number,number,number]=[Math.PI/2,0,0])=>out.push({...g,p:g.p.map(q=>transform(q,{position:[x,.78,z],rotation:r})),n:g.n.map(q=>unit(rot(q,r))),material:m,name});
  add(torus(.82,.30,160,48),dark,"Tire"); add(torus(.59,.12,144,36),chrome,"RimOuter"); add(cylinder(.50,.20,144),dark,"Hub");
  for(let k=0;k<16;k++){const a=k/16*Math.PI*2;add(box([.055,.075,.74]),chrome,`Spoke_${k}`,[Math.PI/2,0,a]);}
  add(cylinder(.18,.24,96),{color:"#c54b34",metallic:.75,roughness:.18},"Brake");
  return out;
}

function sportsCar():Mesh[]{
  const out:Mesh[]=[];
  const paint:Material={color:"#a90e24",metallic:.86,roughness:.14}; const paint2:Material={color:"#e51a3b",metallic:.8,roughness:.12}; const dark:Material={color:"#05080c",metallic:.62,roughness:.10}; const chrome:Material={color:"#dce8f2",metallic:.96,roughness:.07}; const glass:Material={color:"#071d2b",metallic:.42,roughness:.06};
  const add=(g:Omit<Mesh,"material"|"name">,m:Material,name:string,part:Part={})=>out.push({...g,p:g.p.map(q=>transform(q,part)),n:g.n.map(q=>unit(rot(q,part.rotation??[0,0,0]))),material:m,name});
  add(sculptBody(9.4,2.15,1.08,420,112),paint,"Sculpted_Main_Body",{position:[0,1.0,0]});
  add(sculptBody(4.9,1.78,1.25,300,96,"cabin"),glass,"Sculpted_Cabin",{position:[-.15,1.18,0]});
  add(fender(8.8,4.15,1.12),paint2,"Fender_Skin",{position:[0,0.0,0]});
  add(sculptBody(5.1,1.95,.34,260,64),paint2,"Hood_Sculpt",{position:[2.05,1.02,0],scale:[1,.55,1]});
  add(box([8.8,.16,3.9]),dark,"Lower_Diffuser",{position:[0,.46,0]});
  add(box([8.2,.10,.18]),chrome,"Side_Accent_L",{position:[0,.98,2.02]}); add(box([8.2,.10,.18]),chrome,"Side_Accent_R",{position:[0,.98,-2.02]});
  add(box([2.5,.16,.28]),dark,"Front_Splitter",{position:[4.28,.58,0]}); add(box([2.5,.16,.28]),dark,"Rear_Diffuser",{position:[-4.25,.63,0]});
  add(box([.16,.70,4.25]),chrome,"Left_Pillar",{position:[-2.25,1.82,0],rotation:[0,.12,0]}); add(box([.16,.70,4.25]),chrome,"Right_Pillar",{position:[2.25,1.82,0],rotation:[0,-.12,0]});
  for(const z of [-1.0,1.0]){add(torus(.38,.055,96,24),chrome,"Headlight",{position:[4.32,1.16,z],scale:[1.8,.65,1.0]});add(box([1.05,.09,.10]),{color:"#ff1744",metallic:.2,roughness:.06},"TailLight",{position:[-4.42,1.14,z]});}
  add(box([3.8,.14,.24]),dark,"Roof_Rail",{position:[-.15,2.22,0]}); add(box([1.55,.13,.42]),dark,"Rear_Spoiler",{position:[-3.72,1.88,0],rotation:[0,.04,0]});
  for(const z of [-1.7,1.7]){add(box([1.5,.20,.16]),dark,"SideIntake",{position:[1.0,.82,z]});add(box([.7,.12,.12]),chrome,"VentTrim",{position:[1.05,.91,z]});}
  for(const x of [-2.75,2.75]) for(const z of [-1.82,1.82]) out.push(...wheelDetail(x,z,paint,dark,chrome));
  return out;
}

function genericPart(part:Part):Mesh{
  const type=(part.type||"sphere").toLowerCase(); const seg=clamp(Math.round(part.segments??96),24,192); const rings=clamp(Math.round(part.rings??Math.floor(seg/2)),12,96); let g:Omit<Mesh,"material"|"name">;
  if(type.includes("box")||type.includes("cube"))g=box(part.size??[1,1,1]); else if(type.includes("cyl"))g=cylinder(part.radius??.5,part.height??1,seg); else if(type.includes("torus")||type.includes("ring"))g=torus(part.radius??.65,(part.size?.[0]??.15),seg,rings); else {g=sculptBody(part.size?.[0]??1.4,part.size?.[2]??1.4,part.size?.[1]??.8,Math.max(48,seg),Math.max(24,rings),"body");}
  const material=part.material??{color:"#8aa0b8",metallic:.45,roughness:.24}; return {...g,p:g.p.map(q=>transform(q,part)),n:g.n.map(q=>unit(rot(q,part.rotation??[0,0,0]))),material,name:part.name||part.type};
}

function jsonFromText(text:string|null):Blueprint|null{if(!text)return null;const clean=text.replace(/^```(?:json)?\s*/i,"").replace(/```\s*$/i,"").trim();try{const value=JSON.parse(clean) as Blueprint;return value&&Array.isArray(value.parts)?value:null;}catch{const m=clean.match(/\{[\s\S]*\}/);if(!m)return null;try{const value=JSON.parse(m[0]) as Blueprint;return value&&Array.isArray(value.parts)?value:null;}catch{return null;}}}

async function blueprint(prompt:string):Promise<Blueprint>{
  const system=`You are Zeros Sculpt Engine's technical artist. Analyze the request for a native procedural 3D sculpt. Return ONLY JSON: {"background":"...","parts":[{"type":"sphere|box|cylinder|torus","size":[x,y,z],"radius":number,"height":number,"position":[x,y,z],"rotation":[x,y,z],"scale":[x,y,z],"segments":number,"rings":number,"material":{"color":"#hex","metallic":number,"roughness":number},"name":"..."}]}. Use coherent dimensions, complete assemblies, symmetry, and 10-30 parts. Never mention an external 3D generator.`;
  const m=await manusChat(system,[{role:"user",content:prompt}],9000); const g=m?null:await groqText(system,prompt); return jsonFromText(m||g)??{parts:[{type:"sphere",size:[2,2,2],position:[0,1,0],material:{color:"#7c8ea2",metallic:.55,roughness:.2},segments:128,rings:64,name:"Core_Sculpt"}]};
}

function pad4(n:number){return (4-(n%4))%4;}
function makeGltf(meshes:Mesh[]):{url:string;triangles:number;vertices:number}{
  const chunks:Buffer[]=[]; const bufferViews:any[]=[]; const accessors:any[]=[]; const gltfMeshes:any[]=[]; let offset=0; let triangles=0; let vertices=0;
  const push=(buf:Buffer,target:number)=>{const aligned=pad4(offset);if(aligned){chunks.push(Buffer.alloc(aligned));offset+=aligned;}const start=offset;chunks.push(buf);offset+=buf.length;const idx=bufferViews.length;bufferViews.push({buffer:0,byteOffset:start,byteLength:buf.length,target});return idx;};
  const accessor=(view:number,count:number,type:string,componentType:number,min?:number[],max?:number[])=>{const a:any={bufferView:view,componentType,count,type};if(min)a.min=min;if(max)a.max=max;const idx=accessors.length;accessors.push(a);return idx;};
  for(const mesh of meshes){const pb=Buffer.alloc(mesh.p.length*3*4);const nb=Buffer.alloc(mesh.n.length*3*4);const ub=Buffer.alloc(mesh.uv.length*4);const ib=Buffer.alloc(mesh.i.length*4);mesh.p.forEach((q,k)=>q.forEach((v,j)=>pb.writeFloatLE(v,k*12+j*4)));mesh.n.forEach((q,k)=>q.forEach((v,j)=>nb.writeFloatLE(v,k*12+j*4)));mesh.uv.forEach((v,k)=>ub.writeFloatLE(v,k*4));mesh.i.forEach((v,k)=>ib.writeUInt32LE(v,k*4));const pv=push(pb,34962),nv=push(nb,34962),uv=push(ub,34962),iv=push(ib,34963);const pos=accessor(pv,mesh.p.length,"VEC3",5126),norm=accessor(nv,mesh.n.length,"VEC3",5126),tex=accessor(uv,mesh.uv.length/2,"VEC2",5126),ind=accessor(iv,mesh.i.length,"SCALAR",5125);gltfMeshes.push({name:mesh.name||"SculptMesh",primitives:[{attributes:{POSITION:pos,NORMAL:norm,TEXCOORD_0:tex},indices:ind,material:gltfMeshes.length}]});triangles+=Math.floor(mesh.i.length/3);vertices+=mesh.p.length;}
  const materials=meshes.map(m=>{const hex=m.material.color.replace("#","");const n=parseInt(hex.length===3?hex.split("").map(x=>x+x).join(""):hex,16)||0x8aa0b8;return{pbrMetallicRoughness:{baseColorFactor:[((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255,1],metallicFactor:m.material.metallic??.4,roughnessFactor:m.material.roughness??.25}};});
  const nodes=meshes.map((_,i)=>({mesh:i,name:meshes[i].name||`SculptPart_${i+1}`}));const total=Buffer.concat(chunks);const doc={asset:{version:"2.0",generator:"Zeros Native Sculpt Engine"},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes:gltfMeshes,materials,buffers:[{byteLength:total.length,uri:`data:application/octet-stream;base64,${total.toString("base64")}`}],bufferViews,accessors};return{url:`data:model/gltf+json;base64,${Buffer.from(JSON.stringify(doc)).toString("base64")}`,triangles,vertices};
}

export async function generateNativeModel(prompt:string):Promise<{url:string;previewUrl:null;quality:string;triangles:number;vertices:number;note:string}>{
  const isCar=/car|vehicle|ferrari|lamborghini|porsche|sports car|supercar/i.test(prompt);
  const meshes=isCar?sportsCar():((await blueprint(prompt)).parts??[]).map(genericPart);
  const result=makeGltf(meshes);
  return {url:result.url,previewUrl:null,quality:"zeros-native-sculpt-ultra",triangles:result.triangles,vertices:result.vertices,note:"Generated by Zeros from procedural sculpt surfaces. Browser viewport uses adaptive LOD; a literal billion-polygon render is not physically practical on a web/mobile GPU. The engine preserves a high-detail procedural sculpt definition instead of faking billion-poly statistics."};
}
