import { useEffect, useRef, useState } from "react";
import { clampParticleSpec, MAX_COMPONENTS, type ParticleSculptSpec } from "@/lib/particle-model";
import { particleSpecToGlb } from "@/lib/particle-glb";

type Props = { name?: string; source?: string; prompt?: string; spec?: ParticleSculptSpec };
const MAX = MAX_COMPONENTS;

const VERT = `#version 300 es
precision highp float;
void main(){ vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2); gl_Position=vec4(p*2.0-1.0,0.0,1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uResolution; uniform float uYaw,uPitch,uDistance,uDetail,uSeed; uniform int uCount;
uniform vec4 uA[96]; uniform vec4 uB[96]; uniform vec4 uC[96]; uniform vec4 uD[96]; uniform float uBlend[96];

float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);float n000=hash21(i.xy+i.z*17.0),n100=hash21(i.xy+vec2(1,0)+i.z*17.0),n010=hash21(i.xy+vec2(0,1)+i.z*17.0),n110=hash21(i.xy+vec2(1,1)+i.z*17.0);float n001=hash21(i.xy+(i.z+1.0)*17.0),n101=hash21(i.xy+vec2(1,0)+(i.z+1.0)*17.0),n011=hash21(i.xy+vec2(0,1)+(i.z+1.0)*17.0),n111=hash21(i.xy+vec2(1,1)+(i.z+1.0)*17.0);return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y),mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y),f.z);}
float sphere(vec3 p){return length(p)-1.0;}
float box(vec3 p){vec3 q=abs(p)-1.0;return length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0);}
float capsule(vec3 p){p.y-=clamp(p.y,-1.0,1.0);return length(p)-0.42;}
float cylinder(vec3 p){vec2 d=abs(vec2(length(p.xz),p.y))-1.0;return min(max(d.x,d.y),0.0)+length(max(d,0.0));}
float torus(vec3 p){return length(vec2(length(p.xz)-0.68,p.y))-0.28;}
float cone(vec3 p){vec2 q=vec2(length(p.xz),p.y);float side=q.x-mix(1.0,0.12,clamp((q.y+1.0)/2.0,0.0,1.0));return max(max(abs(q.y)-1.0,q.x-1.0),side);}
vec3 rx(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x,c*p.y-s*p.z,s*p.y+c*p.z);}
vec3 ry(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(c*p.x-s*p.z,p.y,s*p.x+c*p.z);}
vec3 rz(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(c*p.x-s*p.y,s*p.x+c*p.y,p.z);}
float part(vec3 w,int i){vec3 p=w-uA[i].xyz;p=ry(p,-uB[i].w);p=rx(p,-uC[i].x);p=rz(p,-uC[i].z);vec3 s=max(uB[i].xyz,vec3(.001));float k=uA[i].w;float d;if(k<.5)d=sphere(p/s)*min(s.x,min(s.y,s.z));else if(k<1.5)d=(length(p/s)-1.0)*min(s.x,min(s.y,s.z));else if(k<2.5)d=box(p/s)*min(s.x,min(s.y,s.z));else if(k<3.5)d=capsule(p/s)*min(s.x,min(s.y,s.z));else if(k<4.5)d=cylinder(p/s)*min(s.x,min(s.y,s.z));else if(k<5.5)d=torus(p/s)*min(s.x,min(s.y,s.z));else if(k<6.5)d=cone(p/s)*min(s.x,min(s.y,s.z));else{vec3 q=abs(p)-s;d=length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0)-min(s.x,min(s.y,s.z))*.12;}return d;}
float scene(vec3 p,out int id){float d=1e6;id=0;for(int i=0;i<96;i++){if(i>=uCount)break;float pd=part(p,i),k=max(.0005,uBlend[i]),h=clamp(.5+.5*(d-pd)/k,0.0,1.0),b=mix(d,pd,h)-k*h*(1.0-h);if(pd<d)id=i;d=b;}return d;}
vec3 normal(vec3 p){int m;float e=.0015;return normalize(vec3(scene(p+vec3(e,0,0),m)-scene(p-vec3(e,0,0),m),scene(p+vec3(0,e,0),m)-scene(p-vec3(0,e,0),m),scene(p+vec3(0,0,e),m)-scene(p-vec3(0,0,e),m)));}
float shadow(vec3 ro,vec3 rd){float r=1.,t=.03;int m;for(int i=0;i<64;i++){float h=scene(ro+rd*t,m);if(h<.001)return 0.;r=min(r,18.*h/t);t+=clamp(h,.015,.25);if(t>10.)break;}return clamp(r,0.,1.);}
void main(){vec2 uv=(gl_FragCoord.xy*2.-uResolution)/min(uResolution.x,uResolution.y);float cp=cos(uPitch),sp=sin(uPitch),cy=cos(uYaw),sy=sin(uYaw);vec3 target=vec3(0,.15,0),ro=target+vec3(sy*cp,sp,cy*cp)*uDistance,fw=normalize(target-ro),rt=normalize(cross(fw,vec3(0,1,0))),up=normalize(cross(rt,fw)),rd=normalize(fw+uv.x*rt*.72+uv.y*up*.72);vec3 bg=mix(vec3(.008,.012,.022),vec3(.035,.05,.075),max(0.,rd.y)),col=bg;float t=.04;int hit=-1,mi=0;for(int i=0;i<220;i++){float d=scene(ro+rd*t,mi);if(d<.001){hit=i;break;}t+=clamp(d*.7,.0025,.22);if(t>25.)break;}if(hit>=0){vec3 p=ro+rd*t,n=normal(p);float metal=uC[mi].y,rough=max(.04,uD[mi].w),micro=(noise3(p*22.+uSeed)-.5)*.03*uDetail;vec3 base=uD[mi].rgb*(1.+micro),l1=normalize(vec3(.45,.85,.32)),l2=normalize(vec3(-.7,.35,.55));float sh=shadow(p+n*.008,l1),ndl=max(dot(n,l1),0.),fill=max(dot(n,l2),0.)*.35;vec3 view=normalize(ro-p),hv=normalize(view+l1);float spc=pow(max(dot(n,hv),0.),mix(8.,180.,1.-rough))*.6;vec3 env=vec3(.12,.16,.22)*(.35+.65*max(n.y,0.));col=base*(.08+ndl*sh*1.2+fill)+env*(.7+metal*.6)+spc*mix(vec3(.85),base,metal);float fres=pow(1.-max(dot(n,view),0.),5.);col+=fres*vec3(.15,.28,.42)*(.25+metal*.5);col=mix(bg,col,exp(-.012*t*t));}outColor=vec4(pow(max(col,0.),vec3(.4545)),1.);}`;

const shapeId: Record<string, number> = {
  sphere: 0,
  ellipsoid: 1,
  box: 2,
  capsule: 3,
  cylinder: 4,
  torus: 5,
  cone: 6,
  "rounded-box": 7,
};
function rgb(hex?: string): [number, number, number] {
  const h = /^#[0-9a-f]{6}$/i.test(hex ?? "") ? (hex as string).slice(1) : "c7d2e3";
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

export default function ModelViewer({ name = "zeros-model", source, spec }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const readyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [spin, setSpin] = useState(true);
  const [stats, setStats] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !spec) return;
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      powerPreference: "low-power",
    });
    if (!gl) {
      setError("WebGL2 is unavailable in this browser.");
      return;
    }
    const s = clampParticleSpec(spec);
    const vs = gl.createShader(gl.VERTEX_SHADER);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!vs || !fs || !program) {
      setError("GPU allocation failed.");
      return;
    }
    gl.shaderSource(vs, VERT);
    gl.compileShader(vs);
    gl.shaderSource(fs, FRAG);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS) || !gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      setError(gl.getShaderInfoLog(fs) || gl.getShaderInfoLog(vs) || "Particle shader compilation failed.");
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setError(gl.getProgramInfoLog(program) || "GPU pipeline link failed.");
      return;
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const loc = (n: string) => gl.getUniformLocation(program, n);
    const L = {
      r: loc("uResolution"),
      yaw: loc("uYaw"),
      pitch: loc("uPitch"),
      dist: loc("uDistance"),
      detail: loc("uDetail"),
      seed: loc("uSeed"),
      count: loc("uCount"),
      a: loc("uA"),
      b: loc("uB"),
      c: loc("uC"),
      d: loc("uD"),
      blend: loc("uBlend"),
    };
    const A = new Float32Array(MAX * 4);
    const B = new Float32Array(MAX * 4);
    const C = new Float32Array(MAX * 4);
    const D = new Float32Array(MAX * 4);
    const bl = new Float32Array(MAX);
    s.components.forEach((p, i) => {
      if (i >= MAX) return;
      const q = i * 4;
      const r = p.rotation ?? [0, 0, 0];
      const m = p.material ?? {};
      const co = rgb(m.color);
      A[q] = p.position[0];
      A[q + 1] = p.position[1];
      A[q + 2] = p.position[2];
      A[q + 3] = shapeId[p.shape] ?? 0;
      B[q] = p.scale[0];
      B[q + 1] = p.scale[1];
      B[q + 2] = p.scale[2];
      B[q + 3] = r[1] ?? 0;
      C[q] = r[0] ?? 0;
      C[q + 1] = Math.max(0, Math.min(1, m.metalness ?? 0.15));
      C[q + 2] = r[2] ?? 0;
      D[q] = co[0];
      D[q + 1] = co[1];
      D[q + 2] = co[2];
      D[q + 3] = Math.max(0.04, Math.min(1, m.roughness ?? 0.38));
      bl[i] = Math.max(0, Math.min(0.28, p.blend ?? 0.05));
    });
    let yaw =
      s.front === "+x" ? Math.PI / 2 : s.front === "-x" ? -Math.PI / 2 : s.front === "-z" ? Math.PI : 0;
    let pitch = 0.16;
    let dist = 4.4;
    let drag = false;
    let lx = 0;
    let ly = 0;
    let last = performance.now();
    const down = (e: PointerEvent) => {
      drag = true;
      lx = e.clientX;
      ly = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
      yaw -= dx * 0.008;
      pitch = Math.max(-1.25, Math.min(1.25, pitch + dy * 0.006));
    };
    const up = () => {
      drag = false;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      dist = Math.max(2.2, Math.min(10, dist * Math.exp(e.deltaY * 0.001)));
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { passive: false });
    let raf = 0;
    let dead = false;
    let lastDraw = 0;
    const resize = () => {
      const d = Math.min(1.25, devicePixelRatio || 1);
      const w = Math.max(1, Math.floor(canvas.clientWidth * d));
      const h = Math.max(1, Math.floor(canvas.clientHeight * d));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };
    const frame = (now: number) => {
      if (dead) return;
      resize();
      if (spin && !drag) yaw += ((now - last) / 1000) * 0.22;
      last = now;
      if (document.hidden) {
        raf = requestAnimationFrame(frame);
        return;
      }
      if (now - lastDraw < 40) {
        raf = requestAnimationFrame(frame);
        return;
      }
      lastDraw = now;
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform2f(L.r, canvas.width, canvas.height);
      gl.uniform1f(L.yaw, yaw);
      gl.uniform1f(L.pitch, pitch);
      gl.uniform1f(L.dist, dist);
      gl.uniform1f(L.detail, s.detail ?? 0.92);
      gl.uniform1f(L.seed, s.seed ?? 1337);
      gl.uniform1i(L.count, Math.min(s.components.length, MAX));
      gl.uniform4fv(L.a, A);
      gl.uniform4fv(L.b, B);
      gl.uniform4fv(L.c, C);
      gl.uniform4fv(L.d, D);
      gl.uniform1fv(L.blend, bl);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!readyRef.current) {
        readyRef.current = true;
        setReady(true);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteVertexArray(vao);
    };
  }, [spec, spin]);

  const download = () => {
    if (!spec) return;
    const blob = particleSpecToGlb(clampParticleSpec(spec));
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.glb`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-black/30">
      <div className="relative">
        <canvas ref={canvasRef} className="block h-[30rem] w-full touch-none bg-black" />
        {!ready && !error && (
          <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
            Reconstructing Meshy-class local sculpt…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-xs text-destructive">
            ⚠ {error}
          </div>
        )}
        {stats && ready && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-[11px] text-white/70 backdrop-blur">
            <div className="font-semibold text-white">Zeros local Meshy-class engine</div>
            <div>
              {spec?.components.length ?? 0} density fields · clean topology · PBR · no external 3D API
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2">
        <span className="text-[11px] text-muted-foreground">
          {source ?? "Zeros Local Sculpt"} · drag to orbit · wheel to zoom
        </span>
        <div className="flex gap-2">
          <button className="rounded-lg border border-border px-3 py-1.5 text-xs" onClick={() => setSpin((v) => !v)}>
            {spin ? "Pause" : "Turntable"}
          </button>
          <button className="rounded-lg border border-border px-3 py-1.5 text-xs" onClick={() => setStats((v) => !v)}>
            Stats
          </button>
          <button
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            onClick={download}
          >
            Download .glb
          </button>
        </div>
      </div>
    </div>
  );
}
