import { useEffect, useRef, useState } from "react";
import { clampParticleSpec, MAX_COMPONENTS, type ParticleSculptSpec } from "@/lib/particle-model";
import { particleSpecToGlb } from "@/lib/particle-glb";

type Props = { name?: string; source?: string; prompt?: string; spec?: ParticleSculptSpec };

/** Mobile-safe uniform budget. */
const GPU_MAX = Math.min(28, MAX_COMPONENTS);

const VERT = `#version 300 es
precision highp float;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

function buildFrag(maxParts: number): string {
  return `#version 300 es
precision mediump float;
out vec4 outColor;
uniform vec2 uResolution;
uniform float uYaw, uPitch, uDistance, uDetail, uSeed;
uniform int uCount;
uniform vec4 uA[${maxParts}];
uniform vec4 uB[${maxParts}];
uniform vec4 uC[${maxParts}];
uniform vec4 uD[${maxParts}];
uniform float uBlend[${maxParts}];

float sphere(vec3 p){ return length(p)-1.0; }
float box(vec3 p){ vec3 q=abs(p)-1.0; return length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0); }
float capsule(vec3 p){ p.y-=clamp(p.y,-1.0,1.0); return length(p)-0.42; }
float cylinder(vec3 p){ vec2 d=abs(vec2(length(p.xz),p.y))-1.0; return min(max(d.x,d.y),0.0)+length(max(d,0.0)); }
float torus(vec3 p){ return length(vec2(length(p.xz)-0.68,p.y))-0.28; }
float cone(vec3 p){
  vec2 q=vec2(length(p.xz),p.y);
  float side=q.x-mix(1.0,0.12,clamp((q.y+1.0)/2.0,0.0,1.0));
  return max(max(abs(q.y)-1.0,q.x-1.0),side);
}
vec3 rx(vec3 p,float a){ float c=cos(a),s=sin(a); return vec3(p.x,c*p.y-s*p.z,s*p.y+c*p.z); }
vec3 ry(vec3 p,float a){ float c=cos(a),s=sin(a); return vec3(c*p.x-s*p.z,p.y,s*p.x+c*p.z); }
vec3 rz(vec3 p,float a){ float c=cos(a),s=sin(a); return vec3(c*p.x-s*p.y,s*p.x+c*p.y,p.z); }
float part(vec3 w,int i){
  vec3 p=w-uA[i].xyz;
  p=ry(p,-uB[i].w); p=rx(p,-uC[i].x); p=rz(p,-uC[i].z);
  vec3 s=max(uB[i].xyz,vec3(.001));
  float k=uA[i].w, d;
  if(k<.5) d=sphere(p/s)*min(s.x,min(s.y,s.z));
  else if(k<1.5) d=(length(p/s)-1.0)*min(s.x,min(s.y,s.z));
  else if(k<2.5) d=box(p/s)*min(s.x,min(s.y,s.z));
  else if(k<3.5) d=capsule(p/s)*min(s.x,min(s.y,s.z));
  else if(k<4.5) d=cylinder(p/s)*min(s.x,min(s.y,s.z));
  else if(k<5.5) d=torus(p/s)*min(s.x,min(s.y,s.z));
  else if(k<6.5) d=cone(p/s)*min(s.x,min(s.y,s.z));
  else {
    vec3 q=abs(p)-s;
    d=length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0)-min(s.x,min(s.y,s.z))*.12;
  }
  return d;
}
float scene(vec3 p, out int id){
  float d=1e6; id=0;
  for(int i=0;i<${maxParts};i++){
    if(i>=uCount) break;
    float pd=part(p,i), k=max(.0005,uBlend[i]);
    float h=clamp(.5+.5*(d-pd)/k,0.0,1.0);
    float b=mix(d,pd,h)-k*h*(1.0-h);
    if(pd<d) id=i;
    d=b;
  }
  return d;
}
vec3 normalAt(vec3 p){
  int m; float e=.003;
  return normalize(vec3(
    scene(p+vec3(e,0,0),m)-scene(p-vec3(e,0,0),m),
    scene(p+vec3(0,e,0),m)-scene(p-vec3(0,e,0),m),
    scene(p+vec3(0,0,e),m)-scene(p-vec3(0,0,e),m)
  ));
}
void main(){
  vec2 uv=(gl_FragCoord.xy*2.-uResolution)/min(uResolution.x,uResolution.y);
  float cp=cos(uPitch), sp=sin(uPitch), cy=cos(uYaw), sy=sin(uYaw);
  vec3 target=vec3(0,.12,0);
  vec3 ro=target+vec3(sy*cp,sp,cy*cp)*uDistance;
  vec3 fw=normalize(target-ro);
  vec3 rt=normalize(cross(fw,vec3(0,1,0)));
  vec3 up=normalize(cross(rt,fw));
  vec3 rd=normalize(fw+uv.x*rt*.72+uv.y*up*.72);
  vec3 bg=mix(vec3(.01,.014,.024),vec3(.04,.055,.08),max(0.,rd.y));
  vec3 col=bg;
  float t=.08; int hit=-1, mi=0;
  for(int i=0;i<64;i++){
    float d=scene(ro+rd*t,mi);
    if(d<.002){ hit=i; break; }
    t+=clamp(d*.85,.008,.35);
    if(t>18.) break;
  }
  if(hit>=0){
    vec3 p=ro+rd*t, n=normalAt(p);
    float metal=uC[mi].y, rough=max(.05,uD[mi].w);
    vec3 base=uD[mi].rgb;
    vec3 l1=normalize(vec3(.5,.9,.35));
    float ndl=max(dot(n,l1),0.);
    vec3 view=normalize(ro-p), hv=normalize(view+l1);
    float spc=pow(max(dot(n,hv),0.),mix(12.,64.,1.-rough))*.4;
    vec3 env=vec3(.14,.18,.24)*(.4+.6*max(n.y,0.));
    col=base*(.12+ndl*1.05)+env*(.55+metal*.45)+spc*mix(vec3(.9),base,metal);
    float fres=pow(1.-max(dot(n,view),0.),4.);
    col+=fres*vec3(.12,.22,.35)*(.15+metal*.4);
    col=mix(bg,col,exp(-.015*t*t));
  }
  outColor=vec4(pow(max(col,0.),vec3(.4545)),1.);
}`;
}

const shapeId: Record<string, number> = {
  sphere: 0, ellipsoid: 1, box: 2, capsule: 3, cylinder: 4, torus: 5, cone: 6, "rounded-box": 7,
};

function rgb(hex?: string): [number, number, number] {
  const h = /^#[0-9a-f]{6}$/i.test(hex ?? "") ? (hex as string).slice(1) : "c7d2e3";
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

export default function ModelViewer({ name = "zeros-model", source, spec }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const spinRef = useRef(true);
  const readyRef = useRef(false);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [spin, setSpin] = useState(true);
  const [stats, setStats] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  spinRef.current = spin;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !spec) return;

    let cancelled = false;
    let raf = 0;
    let dead = false;
    let last = performance.now();
    let lastDraw = 0;
    let yaw = 0;
    let pitch = 0.18;
    let dist = 4.6;
    let drag = false;
    let lx = 0;
    let ly = 0;

    setError(null);
    readyRef.current = false;
    setReady(false);

    const boot = window.setTimeout(() => {
      if (cancelled) return;

      let gl: WebGL2RenderingContext | null = null;
      try {
        gl =
          glRef.current && !glRef.current.isContextLost()
            ? glRef.current
            : canvas.getContext("webgl2", {
                antialias: false,
                alpha: false,
                depth: false,
                stencil: false,
                powerPreference: "default",
                failIfMajorPerformanceCaveat: false,
                preserveDrawingBuffer: false,
              });
      } catch {
        gl = null;
      }

      if (!gl || gl.isContextLost()) {
        glRef.current = null;
        setError("WebGL2 is unavailable right now. You can still download the .glb.");
        return;
      }
      glRef.current = gl;

      const s = clampParticleSpec(spec);
      const count = Math.min(s.components.length, GPU_MAX);

      const vs = gl.createShader(gl.VERTEX_SHADER);
      const fs = gl.createShader(gl.FRAGMENT_SHADER);
      const program = gl.createProgram();
      if (!vs || !fs || !program) {
        setError("GPU resources temporarily unavailable. Tap Retry or download the .glb.");
        return;
      }

      gl.shaderSource(vs, VERT);
      gl.compileShader(vs);
      gl.shaderSource(fs, buildFrag(GPU_MAX));
      gl.compileShader(fs);

      if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS) || !gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(fs) || gl.getShaderInfoLog(vs) || "Shader compile failed";
        setError(`Preview shader issue: ${log.slice(0, 120)}`);
        try {
          gl.deleteShader(vs);
          gl.deleteShader(fs);
          gl.deleteProgram(program);
        } catch {}
        return;
      }

      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        setError(gl.getProgramInfoLog(program) || "GPU pipeline link failed.");
        try {
          gl.deleteShader(vs);
          gl.deleteShader(fs);
          gl.deleteProgram(program);
        } catch {}
        return;
      }

      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);

      const loc = (n: string) => gl!.getUniformLocation(program, n);
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

      const A = new Float32Array(GPU_MAX * 4);
      const B = new Float32Array(GPU_MAX * 4);
      const C = new Float32Array(GPU_MAX * 4);
      const D = new Float32Array(GPU_MAX * 4);
      const bl = new Float32Array(GPU_MAX);

      for (let i = 0; i < count; i++) {
        const p = s.components[i]!;
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
      }

      yaw =
        s.front === "+x" ? Math.PI / 2 : s.front === "-x" ? -Math.PI / 2 : s.front === "-z" ? Math.PI : 0;

      const down = (e: PointerEvent) => {
        drag = true;
        lx = e.clientX;
        ly = e.clientY;
        canvas.setPointerCapture(e.pointerId);
      };
      const move = (e: PointerEvent) => {
        if (!drag) return;
        yaw -= (e.clientX - lx) * 0.008;
        pitch = Math.max(-1.2, Math.min(1.2, pitch + (e.clientY - ly) * 0.006));
        lx = e.clientX;
        ly = e.clientY;
      };
      const up = () => {
        drag = false;
      };
      const wheel = (e: WheelEvent) => {
        e.preventDefault();
        dist = Math.max(2.4, Math.min(10, dist * Math.exp(e.deltaY * 0.001)));
      };

      const onLost = (e: Event) => {
        e.preventDefault();
        dead = true;
        glRef.current = null;
        setError("GPU context was reset. Tap Retry to reload the preview.");
        setReady(false);
      };

      const onRestored = () => {
        if (!cancelled) window.setTimeout(() => setRetryKey((k) => k + 1), 250);
      };

      canvas.addEventListener("pointerdown", down);
      canvas.addEventListener("pointermove", move);
      canvas.addEventListener("pointerup", up);
      canvas.addEventListener("pointercancel", up);
      canvas.addEventListener("wheel", wheel, { passive: false });
      canvas.addEventListener("webglcontextlost", onLost as EventListener);
      canvas.addEventListener("webglcontextrestored", onRestored);

      const resize = () => {
        const dpr = Math.min(1, window.devicePixelRatio || 1);
        const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
        const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
          gl!.viewport(0, 0, w, h);
        }
      };

      const isOnScreen = () => {
        const el = wrapRef.current;
        if (!el) return true;
        const rect = el.getBoundingClientRect();
        return (
          rect.bottom > -20 &&
          rect.top < (window.innerHeight || document.documentElement.clientHeight) + 20 &&
          rect.right > 0 &&
          rect.left < (window.innerWidth || document.documentElement.clientWidth)
        );
      };

      const frame = (now: number) => {
        if (cancelled || dead || !gl || gl.isContextLost()) return;
        if (!isOnScreen() || document.hidden) {
          raf = requestAnimationFrame(frame);
          last = now;
          return;
        }
        resize();
        if (spinRef.current && !drag) yaw += ((now - last) / 1000) * 0.2;
        last = now;
        if (now - lastDraw < 66) {
          raf = requestAnimationFrame(frame);
          return;
        }
        lastDraw = now;
        try {
          gl.useProgram(program);
          gl.bindVertexArray(vao);
          gl.uniform2f(L.r, canvas.width, canvas.height);
          gl.uniform1f(L.yaw, yaw);
          gl.uniform1f(L.pitch, pitch);
          gl.uniform1f(L.dist, dist);
          gl.uniform1f(L.detail, s.detail ?? 0.92);
          gl.uniform1f(L.seed, s.seed ?? 1337);
          gl.uniform1i(L.count, count);
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
        } catch {
          dead = true;
          glRef.current = null;
          setError("GPU draw failed. Try downloading the .glb instead.");
          return;
        }
        raf = requestAnimationFrame(frame);
      };

      raf = requestAnimationFrame(frame);

      (canvas as unknown as { __zerosCleanup?: () => void }).__zerosCleanup = () => {
        cancelAnimationFrame(raf);
        canvas.removeEventListener("pointerdown", down);
        canvas.removeEventListener("pointermove", move);
        canvas.removeEventListener("pointerup", up);
        canvas.removeEventListener("pointercancel", up);
        canvas.removeEventListener("wheel", wheel);
        canvas.removeEventListener("webglcontextlost", onLost as EventListener);
        canvas.removeEventListener("webglcontextrestored", onRestored);
        try {
          gl.deleteProgram(program);
          gl.deleteShader(vs);
          gl.deleteShader(fs);
          if (vao) gl.deleteVertexArray(vao);
        } catch {}
      };
    }, retryKey > 0 ? 350 : 0);

    return () => {
      cancelled = true;
      dead = true;
      window.clearTimeout(boot);
      cancelAnimationFrame(raf);
      const cleanup = (canvas as unknown as { __zerosCleanup?: () => void }).__zerosCleanup;
      cleanup?.();
      (canvas as unknown as { __zerosCleanup?: () => void }).__zerosCleanup = undefined;
    };
  }, [spec, retryKey]);

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

  const retry = () => {
    setError(null);
    setReady(false);
    readyRef.current = false;
    glRef.current = null;
    setRetryKey((k) => k + 1);
  };

  return (
    <div ref={wrapRef} className="mt-3 overflow-hidden rounded-2xl border border-border bg-black/30">
      <div className="relative">
        <canvas ref={canvasRef} className="block h-[28rem] w-full touch-none bg-black" />
        {!ready && !error && (
          <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
            Reconstructing Meshy-class local sculpt…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center gap-3 p-6 text-center text-xs text-destructive">
            <span>⚠ {error}</span>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={retry}
                className="rounded-lg border border-border bg-white/10 px-3 py-1.5 text-xs font-semibold text-foreground"
              >
                Retry preview
              </button>
              <button
                type="button"
                onClick={download}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
              >
                Download .glb
              </button>
            </div>
          </div>
        )}
        {stats && ready && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-[11px] text-white/70 backdrop-blur">
            <div className="font-semibold text-white">Zeros local Meshy-class engine</div>
            <div>
              {Math.min(spec?.components.length ?? 0, GPU_MAX)} density fields · clean topology · PBR · no external 3D
              API
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
