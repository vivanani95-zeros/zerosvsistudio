import type { ParticleSculptSpec } from "./particle-model";

type V3 = [number, number, number];

function addSphere(spec: ParticleSculptSpec, positions: number[], normals: number[], colors: number[], indices: number[]) {
  const seg = 24, rings = 16;
  for (const p of spec.components) {
    const base = positions.length / 3;
    const [sx, sy, sz] = p.scale, [px, py, pz] = p.position;
    const c = p.material?.color ?? "#c7d2e3";
    const color = [parseInt(c.slice(1,3),16)/255,parseInt(c.slice(3,5),16)/255,parseInt(c.slice(5,7),16)/255];
    const rot = p.rotation ?? [0,0,0];
    const rx = (v: V3, a:number):V3 => { const q=Math.cos(a),s=Math.sin(a); return [v[0],q*v[1]-s*v[2],s*v[1]+q*v[2]]; };
    const ry = (v: V3, a:number):V3 => { const q=Math.cos(a),s=Math.sin(a); return [q*v[0]-s*v[2],v[1],s*v[0]+q*v[2]]; };
    const rz = (v: V3, a:number):V3 => { const q=Math.cos(a),s=Math.sin(a); return [q*v[0]-s*v[1],s*v[0]+q*v[1],v[2]]; };
    const tr=(v:V3):V3=>{let q=rx(v,rot[0]);q=ry(q,rot[1]);q=rz(q,rot[2]);return [q[0]+px,q[1]+py,q[2]+pz]};
    for(let r=0;r<=rings;r++){const v=r/rings,ph=v*Math.PI;for(let j=0;j<=seg;j++){const u=j/seg,th=u*Math.PI*2,n:[number,number,number]=[Math.sin(ph)*Math.cos(th),Math.cos(ph),Math.sin(ph)*Math.sin(th)];const q=tr([n[0]*sx,n[1]*sy,n[2]*sz]);positions.push(...q);const nn=tr(n.map((x,i)=>x/(i===0?sx:i===1?sy:sz)) as V3);const l=Math.hypot(nn[0]-px,nn[1]-py,nn[2]-pz)||1;normals.push((nn[0]-px)/l,(nn[1]-py)/l,(nn[2]-pz)/l);colors.push(...color);}}}
    for(let r=0;r<rings;r++)for(let j=0;j<seg;j++){const a=base+r*(seg+1)+j,b=a+1,d=base+(r+1)*(seg+1)+j,cx=d+1;indices.push(a,d,b,b,d,cx);}
  }
}

function pad4(n:number){return (n+3)&~3;}
function utf8(s:string){return new TextEncoder().encode(s);}
function chunk(type:number,data:Uint8Array){const out=new Uint8Array(8+pad4(data.length));const dv=new DataView(out.buffer);dv.setUint32(0,data.length,true);dv.setUint32(4,type,true);out.set(data,8);return out;}
export function particleSpecToGlb(spec:ParticleSculptSpec):Blob{
  const positions:number[]=[],normals:number[]=[],colors:number[]=[],indices:number[]=[];
  addSphere(spec,positions,normals,colors,indices);
  const p=new Float32Array(positions),n=new Float32Array(normals),c=new Float32Array(colors),idx=new Uint32Array(indices);
  const bytes=p.byteLength+n.byteLength+c.byteLength+idx.byteLength, bin=new Uint8Array(pad4(bytes)); let off=0;
  const put=(a:ArrayBufferView)=>{bin.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),off);const start=off;off=pad4(off+a.byteLength);return start;};
  const po=put(p),no=put(n),co=put(c),io=put(idx);
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<positions.length;i+=3)for(let k=0;k<3;k++){min[k]=Math.min(min[k],positions[i+k]!);max[k]=Math.max(max[k],positions[i+k]!);}
  const json=JSON.stringify({asset:{version:"2.0",generator:"Zeros 300M Particle Sculpt Exporter"},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:spec.name}],meshes:[{name:spec.name,primitives:[{attributes:{POSITION:0,NORMAL:1,COLOR_0:2},indices:3,mode:4}]}],buffers:[{byteLength:bin.byteLength}],bufferViews:[{buffer:0,byteOffset:po,byteLength:p.byteLength},{buffer:0,byteOffset:no,byteLength:n.byteLength},{buffer:0,byteOffset:co,byteLength:c.byteLength},{buffer:0,byteOffset:io,byteLength:idx.byteLength}],accessors:[{bufferView:0,componentType:5126,count:p.length/3,type:"VEC3",min,max},{bufferView:1,componentType:5126,count:n.length/3,type:"VEC3"},{bufferView:2,componentType:5126,count:c.length/3,type:"VEC3"},{bufferView:3,componentType:5125,count:idx.length,type:"SCALAR"}]});
  const jb=utf8(json),jc=chunk(0x4e4f534a,jb),bc=chunk(0x004e4942,bin),total=12+jc.length+bc.length, out=new Uint8Array(total),dv=new DataView(out.buffer);
  dv.setUint32(0,0x46546c67,true);dv.setUint32(4,2,true);dv.setUint32(8,total,true);out.set(jc,12);out.set(bc,12+jc.length);
  return new Blob([out],{type:"model/gltf-binary"});
}
