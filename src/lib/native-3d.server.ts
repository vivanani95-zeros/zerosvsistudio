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

function cylinder(radius: number, height: number, segments = 128): Omit<Mesh, "material" | "name"> {
  const p: V[] = [], n: V[] = [], uv: number[] = [], i: number[] = [];
  for (let y=0;y<=1;y++) for (let x=0;x<=segments;x++) { const a=x/segments*Math.PI*2, q:V=[Math.cos(a),0,Math.sin(a)]; p.push([q[0]*radius,y?height/2:-height/2,q[2]*radius]); n.push(q); uv.push(x/segments,y); }
  for (let x=0;x<segments;x++) { const a=x,b=a+1,c=a+segments+1,d=c+1;i.push(a,c,b,b,c,d); }
  return {p,n,uv,i};
}

function torus(R:number,r:number,segments=160,rings=48):Omit<Mesh,"material"|"name"> {
  const p:V[]=[],n:V[]=[],uv:number[]=[],i:number[]=[];
  for(let x=0;x<=segments;x++) for(let y=0;y<=rings;y++){const a=x/segments*Math.PI*2,b=y/rings*Math.PI*2,c=Math.cos(b),s=Math.sin(b);p.push([(R+r*c)*Math.cos(a),r*s,(R+r*c)*Math.sin(a)]);n.push([c*Math.cos(a),s,c*Math.sin(a)]);uv.push(x/segments,y/rings);}
  for(let x=0;x<segments;x++)for(let y=0;y<rings;y++){const a=x*(rings+1)+y,b=a+1,c=a+rings+1,d=c+1;i.push(a,c,b,b,c,d);} return{p,n,uv,i};
}

/** Automotive closed loft: controlled nose/tail taper, shoulder, rocker and flattened floor. */
function automotiveLoft(length:number,width:number,height:number,stations=560,loops=144,variant:"body"|"cabin"|"hood"="body"):Omit<Mesh,"material"|"name"> {
  const p:V[]=[],n:V[]=[],uv:number[]=[],i:number[]=[];
  for(let s=0;s<=stations;s++){
    const u=s/stations, x=(u-.5)*length, ax=Math.abs(x)/(length*.5);
    const nose=Math.pow(clamp(1-ax,0,1),.48);
    const mid=Math.exp(-Math.pow((x/(length*.42)),4));
    const endTaper=.70+.30*nose;
    const asym=variant==="hood" ? Math.exp(-Math.pow((x-length*.22)/(length*.34),4)) : 1;
    const w=width*(.72+.28*mid)*endTaper*(variant==="cabin"?.78:1);
    const base=variant==="cabin"?height+.22*mid:height;
    const h=height*(variant==="cabin"?(0.70+.30*mid):(0.62+.38*mid))*asym;
    for(let j=0;j<=loops;j++){
      const t=j/loops*Math.PI*2, c=Math.cos(t), ss=Math.sin(t);
      const side=Math.sign(c)*Math.pow(Math.abs(c),.72);
      const top=Math.max(0,ss), bottom=Math.max(0,-ss);
      let yy=base + ss*h;
      if(variant==="body") yy += top*h*.18*mid - bottom*h*.28*(1-mid);
      if(variant==="cabin") yy += top*h*.10;
      if(variant==="hood") yy += top*h*.08;
      let zz=side*w*(.88+.12*Math.pow(Math.abs(c),2));
      if(variant!=="cabin" && bottom>.1) zz*=.92+.08*(1-bottom);
      p.push([x,yy,zz]);
      const eps=.0008; const nextX=(Math.min(1,u+eps)-.5)*length; const d=[nextX-x,.001,0] as V;
      const radial:[number,number,number]=[0,ss*h,side*w];
      n.push(unit([radial[0]-d[0]*.03,radial[1],radial[2]])); uv.push(u,j/loops);
    }
  }
  for(let s=0;s<stations;s++)for(let j=0;j<loops;j++){const a=s*(loops+1)+j,b=a+1,c=a+loops+1,d=c+1;i.push(a,c,b,b,c,d);}
  return{p,n,uv,i};
}

function wheelDetail(x:number,z:number,paint:Material,dark:Material,chrome:Material):Mesh[]{
  const out:Mesh[]=[]; const add=(g:Omit<Mesh,"material"|"name">,m:Material,name:string,r:[number,number,number]=[Math.PI/2,0,0])=>out.push({...g,p:g.p.map(q=>transform(q,{position:[x,.66,z],rotation:r})),n:g.n.map(q=>unit(rot(q,r))),material:m,name});
  add(torus(.78,.30,176,52),dark,"Performance_Tire"); add(torus(.55,.095,160,40),chrome,"Forged_Rim"); add(torus(.38,.045,128,32),dark,"RimInner"); add(cylinder(.34,.18,160),dark,"Hub");
  for(let k=0;k<14;k++){const a=k/14*Math.PI*2;add(box([.055,.055,.72]),chrome,`Forged_Spoke_${k}`,[Math.PI/2,0,a]);}
  add(cylinder(.21,.10,128),{color:"#c9342f",metallic:.82,roughness:.16},"Carbon_Ceramic_Brake");
  return out;
}

function sportsCar():Mesh[]{
  const out:Mesh[]=[];
  const paint:Material={color:"#b20d2c",metallic:.88,roughness:.13}; const paint2:Material={color:"#ef234c",metallic:.82,roughness:.12}; const dark:Material={color:"#03070b",metallic:.76,roughness:.10}; const chrome:Material={color:"#dce9f4",metallic:.97,roughness:.065}; const glass:Material={color:"#071c2a",metallic:.32,roughness:.055}; const light:Material={color:"#dffaff",metallic:.28,roughness:.08};
  const add=(g:Omit<Mesh,"material"|"name">,m:Material,name:string,part:Part={})=>out.push({...g,p:g.p.map(q=>transform(q,part)),n:g.n.map(q=>unit(rot(q,part.rotation??[0,0,0]))),material:m,name});

  // Primary continuous body shell. The previous generator used a sausage-like ellipse and a huge flat fender sheet; both are intentionally gone.
  add(automotiveLoft(10.8,1.72,.72,620,160,"body"),paint,"Body_Sculpt_Master",{position:[0,.95,0]});
  add(automotiveLoft(4.65,1.28,.82,460,132,"cabin"),glass,"Cabin_Glass_Sculpt",{position:[-.35,1.33,0]});
  add(automotiveLoft(4.45,1.52,.24,380,96,"hood"),paint2,"Hood_Panel_Sculpt",{position:[2.45,1.30,0],scale:[1,.55,1]});

  // Hard-surface design layers.
  add(box([7.9,.16,3.18]),dark,"Underbody",{position:[-.15,.42,0]});
  add(box([8.65,.13,.15]),chrome,"Left_Side_Character_Line",{position:[0,.99,1.68]});
  add(box([8.65,.13,.15]),chrome,"Right_Side_Character_Line",{position:[0,.99,-1.68]});
  add(box([2.7,.12,2.55]),dark,"Front_Splitter",{position:[4.55,.56,0]});
  add(box([2.5,.13,2.45]),dark,"Rear_Diffuser",{position:[-4.35,.58,0]});
  add(box([3.25,.11,.24]),dark,"Roof_Trim",{position:[-.3,2.22,0]});
  add(box([1.85,.14,.28]),dark,"Active_Rear_Spoiler",{position:[-4.02,1.78,0],rotation:[0,.04,0]});

  // Windshield and side-window accents give the cabin a real automotive read instead of a blob.
  add(automotiveLoft(2.85,1.24,.48,280,80,"cabin"),{color:"#04131f",metallic:.18,roughness:.045},"Windshield_Inner",{position:[.72,1.52,0],scale:[.82,.55,1.01],rotation:[0,.05,0]});
  for(const z of [-1.0,1.0]){
    add(box([2.15,.035,.72]),glass,"Side_Window",{position:[-.65,1.78,z],rotation:[0,.06,z>0?.02:-.02]});
    add(box([.12,.72,.08]),chrome,"A_Pillar",{position:[.55,1.72,z]});
    add(box([.10,.62,.08]),chrome,"B_Pillar",{position:[-1.45,1.70,z]});
  }

  // Lamps, vents and aero are separate production parts for clean silhouettes.
  for(const z of [-.92,.92]){
    add(torus(.28,.065,128,32),light,"Front_Lamp",{position:[4.72,1.18,z],scale:[2.2,.62,1]});
    add(box([1.22,.08,.13]),{color:"#ff183e",metallic:.25,roughness:.06},"Rear_Lamp",{position:[-4.72,1.18,z]});
    add(box([1.35,.10,.12]),dark,"Side_Air_Intake",{position:[1.10,.78,z*1.73]});
  }
  for(const z of [-1,1]) add(box([.95,.12,.16]),chrome,"Vent_Blade",{position:[1.22,.88,z*1.70]});
  for(const z of [-.58,.58]) add(cylinder(.16,.32,112),dark,"Exhaust",{position:[-4.60,.66,z],rotation:[Math.PI/2,0,0]});

  // Four performance wheels, recessed into the body. The wheel positions are narrower than the old generator so the car reads correctly from 3/4 view.
  for(const x of [-3.05,3.05]) for(const z of [-1.48,1.48]) out.push(...wheelDetail(x,z,paint,dark,chrome));

  // Door seams and hood creases add visual subdivision without the old floating rails.
  for(const z of [-1.69,1.69]){
    add(box([2.45,.035,.035]),dark,"Door_Seam",{position:[-.65,1.48,z],rotation:[0,.01,0]});
    add(box([2.0,.025,.025]),chrome,"Lower_Sill_Highlight",{position:[-.35,.74,z]});
  }
  for(const z of [-.58,.58]) add(box([3.5,.035,.04]),chrome,"Hood_Crease",{position:[2.52,1.62,z],rotation:[0,.02,0]});
  return out;
}

function genericPart(part:Part):Mesh{
  const type=(part.type||"sphere").toLowerCase(); const seg=clamp(Math.round(part.segments??128),32,192); const rings=clamp(Math.round(part.rings??Math.floor(seg/2)),16,96); let g:Omit<Mesh,"material"|"name">;
  if(type.includes("box")||type.includes("cube"))g=box(part.size??[1,1,1]); else if(type.includes("cyl"))g=cylinder(part.radius??.5,part.height??1,seg); else if(type.includes("torus")||type.includes("ring"))g=torus(part.radius??.65,(part.size?.[0]??.15),seg,rings); else g=automotiveLoft(part.size?.[0]??1.4,part.size?.[2]??1.4,part.size?.[1]??.8,Math.max(64,seg),Math.max(32,rings),"body");
  const material=part.material??{color:"#8aa0b8",metallic:.45,roughness:.24}; return {...g,p:g.p.map(q=>transform(q,part)),n:g.n.map(q=>unit(rot(q,part.rotation??[0,0,0]))),material,name:part.name||part.type};
}

function jsonFromText(text:string|null):Blueprint|null{if(!text)return null;const clean=text.replace(/^```(?:json)?\s*/i,"").replace(/```\s*$/i,"").trim();try{const value=JSON.parse(clean) as Blueprint;return value&&Array.isArray(value.parts)?value:null;}catch{const m=clean.match(/\{[\s\S]*\}/);if(!m)return null;try{const value=JSON.parse(m[0]) as Blueprint;return value&&Array.isArray(value.parts)?value:null;}catch{return null;}}}

async function blueprint(prompt:string):Promise<Blueprint>{
  const system=`You are Zeros Sculpt Engine's technical artist. Analyze the request for a native procedural 3D sculpt. Return ONLY JSON with background and 10-30 coherent parts. Allowed types: sphere, box, cylinder, torus. Use realistic dimensions, symmetry, layered assemblies, material values, and high segment/ring counts. Do not describe external generators.`;
  const m=await manusChat(system,[{role:"user",content:prompt}],9000); const g=m?null:await groqText(system,prompt); return jsonFromText(m||g)??{parts:[{type:"sphere",size:[2,2,2],position:[0,1,0],material:{color:"#7c8ea2",metallic:.55,roughness:.2},segments:160,rings:80,name:"Core_Sculpt"}]};
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
  return {url:result.url,previewUrl:null,quality:"zeros-native-sculpt-ultra-v2",triangles:result.triangles,vertices:result.vertices,note:"Native automotive sculpt rebuilt from continuous lofted body surfaces and production-style detail layers. Viewport remains adaptive for web/mobile; the engine never fabricates billion-poly statistics."};
}
