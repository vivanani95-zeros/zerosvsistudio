import { useEffect, useRef, useState } from "react";
import { clampParticleSpec, MAX_COMPONENTS, type ParticleSculptSpec } from "@/lib/particle-model";
import { particleSpecToGlb } from "@/lib/particle-glb";

type Props = { name?: string; source?: string; prompt?: string; spec?: ParticleSculptSpec };

const GPU_MAX = Math.min(36, MAX_COMPONENTS);

const VERT = `#version 300 es\nprecision highp float;\nvoid main(){\n  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);\n  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);\n}`;

function buildFrag(maxParts: number): string {
  return `#version 300 es\nprecision mediump float;\nout vec4 outColor;\nuniform vec2 uResolution;\nuniform float uYaw, uPitch, uDistance, uDetail, uSeed;\nuniform int uCount;\nuniform vec4 uA[${maxParts}];\nuniform vec4 uB[${maxParts}];\nuniform vec4 uC[${maxParts}];\nuniform vec4 uD[${maxParts}];\nuniform float uBlend[${maxParts}];\n\nfloat sphere(vec3 p){ return length(p)-1.0; }\nfloat box(vec3 p){ vec3 q=abs(p)-1.0; return length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0); }\nfloat capsule(vec3 p){ p.y-=clamp(p.y,-1.0,1.0); return length(p)-0.42; }\nfloat cylinder(vec3 p){ vec2 d=abs(vec2(length(p.xz),p.y))-1.0; return min(max(d.x,d.y),0.0)+length(max(d,0.0)); }\nfloat torus(vec3 p){ return length(vec2(length(p.xz)-0.68,p.y))-0.28; }\nfloat cone(vec3 p){\n  vec2 q=vec2(length(p.xz),p.y);\n  float side=q.x-mix(1.0,0.12,clamp((q.y+1.0)/2.0,0.0,1.0));\n  return max(max(abs(q.y)-1.0,q.x-1.0),side);\n}\nvec3 rx(vec3 p,float a){ float c=cos(a),s=sin(a); return vec3(p.x,c*p.y-s*p.z,s*p.y+c*p.z); }\nvec3 ry(vec3 p,float a){ float c=cos(a),s=sin(a); return vec3(c*p.x-s*p.z,p.y,s*p.x+c*p.z); }\nvec3 rz(vec3 p,float a){ float c=cos(a),s=sin(a); return vec3(c*p.x-s*p.y,s*p.x+c*p.y,p.z); }\nfloat part(vec3 w,int i){\n  vec3 p=w-uA[i].xyz;\n  p=ry(p,-uB[i].w); p=rx(p,-uC[i].x); p=rz(p,-uC[i].z);\n  vec3 s=max(uB[i].xyz,vec3(.001));\n  float k=uA[i].w, d;\n  if(k<.5) d=sphere(p/s)*min(s.x,min(s.y,s.z));\n  else if(k<1.5) d=(length(p/s)-1.0)*min(s.x,min(s.y,s.z));\n  else if(k<2.5) d=box(p/s)*min(s.x,min(s.y,s.z));\n  else if(k<3.5) d=capsule(p/s)*min(s.x,min(s.y,s.z));\n  else if(k<4.5) d=cylinder(p/s)*min(s.x,min(s.y,s.z));\n  else if(k<5.5) d=torus(p/s)*min(s.x,min(s.y,s.z));\n  else if(k<6.5) d=cone(p/s)*min(s.x,min(s.y,s.z));\n  else {\n    vec3 q=abs(p)-s;\n    d=length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0)-min(s.x,min(s.y,s.z))*.12;\n  }\n  return d;\n}\nfloat scene(vec3 p, out int id){\n  float d=1e6; id=0;\n  for(int i=0;i<${maxParts};i++){\n    if(i>=uCount) break;\n    float pd=part(p,i);\n    float k=uBlend[i];\n    if(k<0.02){\n      if(pd<d){ d=pd; id=i; }\n    } else {\n      float h=clamp(.5+.5*(d-pd)/max(k,0.02),0.0,1.0);\n      float b=mix(d,pd,h)-k*h*(1.0-h);\n      if(pd<d) id=i;\n      d=b;\n    }\n  }\n  return d;\n}\nvec3 normalAt(vec3 p){\n  int m; float e=.0025;\n  return normalize(vec3(\n    scene(p+vec3(e,0,0),m)-scene(p-vec3(e,0,0),m),\n    scene(p+vec3(0,e,0),m)-scene(p-vec3(0,e,0),m),\n    scene(p+vec3(0,0,e),m)-scene(p-vec3(0,0,e),m)\n  ));\n}\nvoid main(){\n  vec2 uv=(gl_FragCoord.xy*2.-uResolution)/min(uResolution.x,uResolution.y);\n  float cp=cos(uPitch), sp=sin(uPitch), cy=cos(uYaw), sy=sin(uYaw);\n  vec3 target=vec3(0,.25,0);\n  vec3 ro=target+vec3(sy*cp,sp,cy*cp)*uDistance;\n  vec3 fw=normalize(target-ro);\n  vec3 rt=normalize(cross(fw,vec3(0,1,0)));\n  vec3 up=normalize(cross(rt,fw));\n  vec3 rd=normalize(fw+uv.x*rt*.72+uv.y*up*.72);\n  vec3 bg=mix(vec3(.01,.014,.024),vec3(.04,.055,.08),max(0.,rd.y));\n  vec3 col=bg;\n  float t=.06; int hit=-1, mi=0;\n  for(int i=0;i<96;i++){\n    float d=scene(ro+rd*t,mi);\n    if(d<.0015){ hit=i; break; }\n    t+=clamp(d*.9,.006,.3);\n    if(t>20.) break;\n  }\n  if(hit>=0){\n    vec3 p=ro+rd*t, n=normalAt(p);\n    float metal=uC[mi].y, rough=max(.05,uD[mi].w);\n    vec3 base=uD[mi].rgb;\n    vec3 l1=normalize(vec3(.45,.95,.4));\n    vec3 l2=normalize(vec3(-.4,.3,-.5));\n    float ndl=max(dot(n,l1),0.);\n    float ndl2=max(dot(n,l2),0.)*.35;\n    vec3 view=normalize(ro-p), hv=normalize(view+l1);\n    float spc=pow(max(dot(n,hv),0.),mix(16.,72.,1.-rough))*.45;\n    vec3 env=vec3(.12,.16,.22)*(.35+.65*max(n.y,0.));\n    col=base*(.1+ndl*1.1+ndl2)+env*(.5+metal*.5)+spc*mix(vec3(.95),base,metal);\n    float fres=pow(1.-max(dot(n,view),0.),4.);\n    col+=fres*vec3(.1,.2,.32)*(.12+metal*.45);\n    col=mix(bg,col,exp(-.012*t*t));\n  }\n  outColor=vec4(pow(max(col,0.),vec3(.4545)),1.);\n}`;
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
    let pitch = 0.32;
    let dist = 5.5;
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
        gl = glRef.current && !glRef.current.isContextLost()
          ? glRef.current
          : canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "default", failIfMajorPerformanceCaveat: false, preserveDrawingBuffer: false });
      } catch { gl = null; }
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
        try { gl.deleteShader(vs); gl.deleteShader(fs); gl.deleteProgram(program); } catch {}
        return;
      }
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        setError(gl.getProgramInfoLog(program) || "GPU pipeline link failed.");
        try { gl.deleteShader(vs); gl.deleteShader(fs); gl.deleteProgram(program); } catch {}
        return;
      }
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const loc = (n: string) => gl!.getUniformLocation(program, n);
      const L = { r: loc("uResolution"), yaw: loc("uYaw"), pitch: loc("uPitch"), dist: loc("uDistance"), detail: loc("uDetail"), seed: loc("uSeed"), count: loc("uCount"), a: loc("uA"), b: loc("uB"), c: loc("uC"), d: loc("uD"), blend: loc("uBlend") };
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
        A[q] = p.position[0]; A[q + 1] = p.position[1]; A[q + 2] = p.position[2]; A[q + 3] = shapeId[p.shape] ?? 0;
        B[q] = p.scale[0]; B[q + 1] = p.scale[1]; B[q + 2] = p.scale[2]; B[q + 3] = r[1] ?? 0;
        C[q] = r[0] ?? 0; C[q + 1] = Math.max(0, Math.min(1, m.metalness ?? 0.15)); C[q + 2] = r[2] ?? 0;
        D[q] = co[0]; D[q + 1] = co[1]; D[q + 2] = co[2]; D[q + 3] = Math.max(0.04, Math.min(1, m.roughness ?? 0.38));
        bl[i] = Math.max(0.004, Math.min(0.14, p.blend ?? 0.05));
      }
      let maxR = 0.5;
      for (let i = 0; i < count; i++) {
        const p = s.components[i]!;
        const ext = Math.max(p.scale[0], p.scale[1], p.scale[2]);
        maxR = Math.max(maxR, Math.hypot(p.position[0], p.position[2]) + ext, Math.abs(p.position[1]) + ext * 0.5);
      }
      dist = Math.max(4.5, Math.min(9.5, maxR * 2.4));
      pitch = 0.32;
      yaw = s.front === "+x" ? Math.PI / 2 : s.front === "-x" ? -Math.PI / 2 : s.front === "-z" ? Math.PI : 0;
      const down = (e: PointerEvent) => { drag = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); };
      const move = (e: PointerEvent) => { if (!drag) return; yaw -= (e.clientX - lx) * 0.008; pitch = Math.max(-1.2, Math.min(1.2, pitch + (e.clientY - ly) * 0.006)); lx = e.clientX; ly = e.clientY; };
      const up = () => { drag = false; };
      const wheel = (e: WheelEvent) => { e.preventDefault(); dist = Math.max(2.4, Math.min(12, dist * Math.exp(e.deltaY * 0.001))); };
      const onLost = (e: Event) => { e.preventDefault(); dead = true; glRef.current = null; setError("GPU context was reset. Tap Retry to reload the preview."); setReady(false); };
      const onRestored = () => { if (!cancelled) window.setTimeout(() => setRetryKey((k) => k + 1), 250); };
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
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl!.viewport(0, 0, w, h); }
      };
      const isOnScreen = () => {
        const el = wrapRef.current;
        if (!el) return true;
        const rect = el.getBoundingClientRect();
        return rect.bottom > -20 && rect.top < (window.innerHeight || document.documentElement.clientHeight) + 20 && rect.right > 0 && rect.left < (window.innerWidth || document.documentElement.clientWidth);
      };
      const frame = (now: number) => {
        if (cancelled || dead || !gl || gl.isContextLost()) return;
        if (!isOnScreen() || document.hidden) { raf = requestAnimationFrame(frame); last = now; return; }
        resize();
        if (spinRef.current && !drag) yaw += ((now - last) / 1000) * 0.2;
        last = now;
        if (now - lastDraw < 50) { raf = requestAnimationFrame(frame); return; }
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
          if (!readyRef.current) { readyRef.current = true; setReady(true); }
        } catch {
          dead = true; glRef.current = null; setError("GPU draw failed. Try downloading the .glb instead."); return;
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
        try { gl.deleteProgram(program); gl.deleteShader(vs); gl.deleteShader(fs); if (vao) gl.deleteVertexArray(vao); } catch {}
      };
    }, retryKey > 0 ? 350 : 0);

    return () => {
      cancelled = true; dead = true;
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
    a.href = url; a.download = `${name}.glb`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const retry = () => {
    setError(null); setReady(false); readyRef.current = false; glRef.current = null; setRetryKey((k) => k + 1);
  };

  return (
    <div ref={wrapRef} className="mt-3 overflow-hidden rounded-2xl border border-border bg-black/30">
      <div className="relative">
        <canvas ref={canvasRef} className="block h-[28rem] w-full touch-none bg-black" />
        {!ready && !error && (
          <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">Reconstructing Meshy-class local sculpt…</div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center gap-3 p-6 text-center text-xs text-destructive">
            <span>⚠ {error}</span>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={retry} className="rounded-lg border border-border bg-white/10 px-3 py-1.5 text-xs font-semibold text-foreground">Retry preview</button>
              <button type="button" onClick={download} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Download .glb</button>
            </div>
          </div>
        )}
        {stats && ready && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-[11px] text-white/70 backdrop-blur">
            <div className="font-semibold text-white">Zeros local Meshy-class engine</div>
            <div>{Math.min(spec?.components.length ?? 0, GPU_MAX)} density fields · clean topology · PBR · no external 3D API</div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2">
        <span className="text-[11px] text-muted-foreground">{source ?? "Zeros Local Sculpt"} · drag to orbit · wheel to zoom</span>
        <div className="flex gap-2">
          <button className="rounded-lg border border-border px-3 py-1.5 text-xs" onClick={() => setSpin((v) => !v)}>{spin ? "Pause" : "Turntable"}</button>
          <button className="rounded-lg border border-border px-3 py-1.5 text-xs" onClick={() => setStats((v) => !v)}>Stats</button>
          <button className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground" onClick={download}>Download .glb</button>
        </div>
      </div>
    </div>
  );
}
