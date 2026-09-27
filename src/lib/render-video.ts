/**
 * Zeros Peak Video Engine — cinematic Three.js 3D for text/shapes/graphs + audio.
 * Layers live in 3D space (planes, meshes) with depth animation.
 * Prefers MP4 (H.264 + AAC) when MediaRecorder supports it; else WebM + Opus.
 */

import type { VideoLayer, VideoScene, VideoSpec } from "@/lib/video-spec";
import * as THREE from "three";

const FONT = '"Inter","SF Pro Display","Segoe UI",system-ui,-apple-system,sans-serif';

function ease(t: number, kind: VideoScene["ease"] = "easeInOut"): number {
  const x = Math.min(1, Math.max(0, t));
  switch (kind) {
    case "linear": return x;
    case "easeIn": return x * x * x;
    case "easeOut": return 1 - Math.pow(1 - x, 3);
    case "bounce": {
      const n1 = 7.5625, d1 = 2.75;
      if (x < 1 / d1) return n1 * x * x;
      if (x < 2 / d1) { const y = x - 1.5 / d1; return n1 * y * y + 0.75; }
      if (x < 2.5 / d1) { const y = x - 2.25 / d1; return n1 * y * y + 0.9375; }
      { const y = x - 2.625 / d1; return n1 * y * y + 0.984375; }
    }
    default:
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }
}

function layerAlpha(localMs: number, sceneDur: number, fadeInMs = 400, fadeOutMs = 300): number {
  let a = 1;
  if (fadeInMs > 0 && localMs < fadeInMs) a = Math.min(a, ease(localMs / fadeInMs, "easeOut"));
  if (fadeOutMs > 0 && localMs > sceneDur - fadeOutMs) a = Math.min(a, ease((sceneDur - localMs) / fadeOutMs, "easeIn"));
  return Math.max(0, Math.min(1, a));
}

function toWorld(nx: number, ny: number, depth = 0): THREE.Vector3 {
  const x = (nx - 0.5) * 7.2;
  const y = (0.5 - ny) * 4.05;
  return new THREE.Vector3(x, y, depth);
}

function makeTextTexture(text: string, fontSize: number, color: string, weight: number, maxW = 1024): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = maxW;
  canvas.height = Math.max(128, Math.round(fontSize * scale * 2.4));
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `${weight} ${Math.round(fontSize * scale)}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(120,140,255,0.65)";
  ctx.shadowBlur = Math.min(40, fontSize * 0.5);
  ctx.fillStyle = color || "#f4f5ff";
  const lines = text.split("\n");
  const lineH = fontSize * scale * 1.25;
  const startY = canvas.height / 2 - ((lines.length - 1) * lineH) / 2;
  lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, startY + i * lineH, canvas.width * 0.92));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

type ContentObj = {
  obj: THREE.Object3D;
  startMs: number;
  endMs: number;
  fadeInMs: number;
  fadeOutMs: number;
  ease: VideoScene["ease"];
  basePos: THREE.Vector3;
  baseScale: number;
  kind: "text" | "shape" | "graph";
  spin?: number;
};

function parseColor(c?: string, fallback = 0x8899ff): number {
  if (!c) return fallback;
  if (c.startsWith("#") && (c.length === 7 || c.length === 4)) {
    try { return new THREE.Color(c).getHex(); } catch { return fallback; }
  }
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (m) return (parseInt(m[1]!) << 16) + (parseInt(m[2]!) << 8) + parseInt(m[3]!);
  return fallback;
}

function buildContentFromSpec(spec: VideoSpec, scene: THREE.Scene): ContentObj[] {
  const out: ContentObj[] = [];
  for (const sc of spec.scenes) {
    for (const layer of sc.layers) {
      if (layer.type === "text") {
        const tex = makeTextTexture(layer.text || "", layer.fontSize ?? 48, layer.color ?? "#f4f5ff", layer.weight ?? 650);
        const aspect = tex.image.width / Math.max(1, tex.image.height);
        const hh = 0.55 + ((layer.fontSize ?? 48) / 72) * 0.55;
        const ww = hh * aspect;
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(ww, hh), mat);
        const base = toWorld(layer.x ?? 0.5, layer.y ?? 0.5, 0.8);
        mesh.position.copy(base);
        scene.add(mesh);
        out.push({ obj: mesh, startMs: sc.startMs, endMs: sc.endMs, fadeInMs: layer.fadeInMs ?? 400, fadeOutMs: layer.fadeOutMs ?? 300, ease: sc.ease || "easeOut", basePos: base.clone(), baseScale: 1, kind: "text" });
      } else if (layer.type === "shape") {
        const shape = layer.shape || "rounded";
        let geo: THREE.BufferGeometry;
        if (shape === "circle" || shape === "orb") geo = new THREE.SphereGeometry(0.45, 32, 32);
        else if (shape === "pill") geo = new THREE.CapsuleGeometry(0.22, 0.7, 8, 16);
        else if (shape === "line") geo = new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8);
        else geo = new THREE.BoxGeometry(Math.max(0.3, (layer.w ?? 0.3) * 3.5), Math.max(0.2, (layer.h ?? 0.2) * 2.2), 0.12);
        const col = parseColor(layer.color, 0x6677ee);
        const mat = new THREE.MeshStandardMaterial({
          color: col, metalness: shape === "glass" || shape === "rounded" ? 0.35 : 0.7,
          roughness: shape === "glass" ? 0.15 : 0.35, transparent: true, opacity: 0,
          emissive: new THREE.Color(col).multiplyScalar(0.15), emissiveIntensity: 0.35,
        });
        const mesh = new THREE.Mesh(geo, mat);
        const depth = shape === "orb" || shape === "circle" ? 0.2 : 0.5;
        const base = toWorld((layer.x ?? 0.1) + (layer.w ?? 0.3) / 2, (layer.y ?? 0.1) + (layer.h ?? 0.2) / 2, depth);
        mesh.position.copy(base);
        if (layer.rotate) mesh.rotation.z = (layer.rotate * Math.PI) / 180;
        scene.add(mesh);
        out.push({ obj: mesh, startMs: sc.startMs, endMs: sc.endMs, fadeInMs: layer.fadeInMs ?? 350, fadeOutMs: layer.fadeOutMs ?? 250, ease: sc.ease || "easeOut", basePos: base.clone(), baseScale: 1, kind: "shape", spin: shape === "orb" || shape === "circle" ? 0.6 : 0.15 });
      } else if (layer.type === "particles") {
        const n = Math.min(layer.count ?? 50, 100);
        const positions = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          positions[i * 3] = (Math.random() - 0.5) * 8;
          positions[i * 3 + 1] = (Math.random() - 0.5) * 4.5;
          positions[i * 3 + 2] = (Math.random() - 0.5) * 2 + 0.3;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: parseColor(layer.color, 0x7b93ff), size: 0.05, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        scene.add(pts);
        out.push({ obj: pts, startMs: sc.startMs, endMs: sc.endMs, fadeInMs: 300, fadeOutMs: 300, ease: sc.ease || "easeInOut", basePos: new THREE.Vector3(0, 0, 0.3), baseScale: 1, kind: "graph", spin: layer.speed ?? 0.4 });
      }
    }
  }
  return out;
}

function tickContent(items: ContentObj[], tMs: number) {
  for (const item of items) {
    const inRange = tMs >= item.startMs && tMs < item.endMs;
    const localMs = tMs - item.startMs;
    const sceneDur = Math.max(1, item.endMs - item.startMs);
    const alpha = inRange ? layerAlpha(localMs, sceneDur, item.fadeInMs, item.fadeOutMs) : 0;
    const enterT = item.fadeInMs > 0 && inRange ? ease(Math.min(1, localMs / item.fadeInMs), item.ease) : inRange ? 1 : 0;
    item.obj.visible = alpha > 0.01;
    const lift = (1 - enterT) * 0.55;
    item.obj.position.set(item.basePos.x, item.basePos.y + lift, item.basePos.z - (1 - enterT) * 0.8);
    item.obj.scale.setScalar(item.baseScale * (0.85 + enterT * 0.15));
    const mat = (item.obj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (mat && !Array.isArray(mat) && "opacity" in mat) (mat as THREE.MeshBasicMaterial).opacity = alpha * (item.kind === "text" ? 1 : 0.85);
    if (item.obj instanceof THREE.Points) {
      (item.obj.material as THREE.PointsMaterial).opacity = alpha * 0.75;
      item.obj.rotation.y += (item.spin ?? 0.3) * 0.01;
    }
    if (item.spin && item.obj instanceof THREE.Mesh) {
      item.obj.rotation.y += item.spin * 0.012;
      item.obj.rotation.x += item.spin * 0.006;
    }
  }
}

function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number, s = 0.5) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.22, w / 2, h / 2, Math.max(w, h) * 0.72);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, `rgba(0,0,0,${s})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

function drawFilmGrainFull(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, tSec: number) {
  ctx.save(); ctx.globalAlpha = 0.04; const step = 3;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const n = Math.sin((x + 17) * (y + 29) * ((seed % 997) + 1) + tSec * 42) * 0.5 + 0.5;
      if (n > 0.58) { const v = Math.floor(150 + n * 100); ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(x, y, step, step); }
    }
  }
  ctx.restore();
}

function buildThreeScene(w: number, h: number, seed: number, bg: string, spec: VideoSpec) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(bg || "#07060f", 0.03);
  const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 120);
  camera.position.set(0, 0.15, 5.5);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setSize(w, h, false); renderer.setPixelRatio(1); renderer.setClearColor(bg || "#07060f", 1);
  scene.add(new THREE.AmbientLight(0x6a7cff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(3.5, 4.5, 5); scene.add(key);
  const rim = new THREE.PointLight(0x88aaff, 1.5, 22); rim.position.set(-3.5, -1, 2.5); scene.add(rim);
  const accent = new THREE.PointLight(0xff66cc, 0.8, 16); accent.position.set(2.5, -2, -1.5); scene.add(accent);
  const group = new THREE.Group(); scene.add(group);
  const rng = (n: number) => { const x = Math.sin(seed * 0.001 + n * 12.9898) * 43758.5453; return x - Math.floor(x); };
  const geos = [new THREE.IcosahedronGeometry(0.48, 1), new THREE.TorusGeometry(0.42, 0.13, 16, 48), new THREE.OctahedronGeometry(0.48, 0), new THREE.SphereGeometry(0.38, 28, 28), new THREE.TorusKnotGeometry(0.32, 0.11, 64, 12), new THREE.DodecahedronGeometry(0.42, 0), new THREE.TetrahedronGeometry(0.45, 0), new THREE.BoxGeometry(0.55, 0.55, 0.55)];
  const meshes: THREE.Mesh[] = [];
  for (let i = 0; i < 22; i++) {
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.58 + rng(i) * 0.18, 0.5 + rng(i + 2) * 0.3, 0.42 + rng(i + 3) * 0.22), metalness: 0.55 + rng(i + 1) * 0.4, roughness: 0.12 + rng(i + 4) * 0.35, transparent: true, opacity: 0.72, emissive: new THREE.Color().setHSL(0.68, 0.55, 0.12), emissiveIntensity: 0.2 });
    const mesh = new THREE.Mesh(geos[i % geos.length]!, mat);
    const radius = 2.2 + rng(i + 8) * 4.5; const angle = rng(i + 9) * Math.PI * 2;
    mesh.position.set(Math.cos(angle) * radius * 0.85, (rng(i + 11) - 0.5) * 3.5, Math.sin(angle) * radius * 0.7 - 2.5);
    mesh.scale.setScalar(0.7 + rng(i + 16) * 0.85);
    mesh.userData = { spin: 0.2 + rng(i + 60) * 1.1, bob: 0.25 + rng(i + 70) * 0.7, phase: rng(i + 80) * Math.PI * 2, baseY: mesh.position.y };
    group.add(mesh); meshes.push(mesh);
  }
  const pCount = 380; const positions = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) { positions[i * 3] = (rng(i + 100) - 0.5) * 16; positions[i * 3 + 1] = (rng(i + 200) - 0.5) * 10; positions[i * 3 + 2] = (rng(i + 300) - 0.5) * 12 - 3; }
  const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0xaabbff, size: 0.03, transparent: true, opacity: 0.65, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(points);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(10, 64), new THREE.MeshStandardMaterial({ color: 0x0a0c18, metalness: 0.92, roughness: 0.3, transparent: true, opacity: 0.45 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -2.4; scene.add(floor);
  const content = buildContentFromSpec(spec, scene);
  return { scene, camera, renderer, meshes, points, group, content };
}

function tickThree(three: ReturnType<typeof buildThreeScene>, tSec: number, tMs: number) {
  const { camera, renderer, scene, meshes, points, group, content } = three;
  for (const mesh of meshes) {
    const u = mesh.userData as { spin: number; bob: number; phase: number; baseY: number };
    mesh.rotation.x += 0.004 * u.spin; mesh.rotation.y += 0.006 * u.spin;
    mesh.position.y = u.baseY + Math.sin(tSec * u.bob + u.phase) * 0.38;
  }
  points.rotation.y = tSec * 0.04; group.rotation.y = Math.sin(tSec * 0.1) * 0.16;
  camera.position.x = Math.sin(tSec * 0.15) * 0.45; camera.position.y = 0.15 + Math.sin(tSec * 0.1) * 0.12;
  camera.lookAt(0, 0, 0);
  for (const item of content) { if (item.kind === "text") item.obj.quaternion.copy(camera.quaternion); }
  tickContent(content, tMs);
  renderer.render(scene, camera);
}

function paintPost(ctx: CanvasRenderingContext2D, spec: VideoSpec, tMs: number) {
  const w = spec.width, h = spec.height, tSec = tMs / 1000, seed = spec.seed ?? 1;
  drawVignette(ctx, w, h, 0.48); drawFilmGrainFull(ctx, w, h, seed, tSec);
  const bar = Math.round(h * 0.04); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, bar); ctx.fillRect(0, h - bar, w, bar);
  const lines = spec.audio?.voiceoverLines ?? [];
  const caption = lines.find((l, i) => { const next = lines[i + 1]; return tMs >= l.startMs && (!next || tMs < next.startMs); });
  if (caption?.text) {
    ctx.save(); const fs = Math.round(20 * (w / 1920)); ctx.font = `500 ${fs}px ${FONT}`;
    const metrics = ctx.measureText(caption.text); const padX = 26;
    const tw = Math.min(w * 0.82, metrics.width + padX * 2); const th = Math.round(44 * (h / 1080));
    const tx = (w - tw) / 2; const ty = h - bar - Math.round(58 * (h / 1080));
    ctx.beginPath(); ctx.roundRect(tx, ty, tw, th, 14); ctx.fillStyle = "rgba(6,8,18,0.8)"; ctx.fill();
    ctx.strokeStyle = "rgba(160,180,255,0.28)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "#eef1ff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(caption.text, w / 2, ty + th / 2, tw - padX); ctx.restore();
  }
}

function startAudioBed(ctx: AudioContext, dest: MediaStreamAudioDestinationNode, mood: string, bpm: number, durationSec: number) {
  const master = ctx.createGain(); master.gain.value = 0.32; master.connect(dest);
  const beat = 60 / Math.max(60, Math.min(160, bpm)); const now = ctx.currentTime;
  const moodMap: Record<string, { root: number; intervals: number[]; filter: number }> = {
    cinematic: { root: 110, intervals: [0, 3, 7, 10, 12], filter: 900 }, upbeat: { root: 146, intervals: [0, 4, 7, 12], filter: 1800 },
    ambient: { root: 82, intervals: [0, 5, 7, 12], filter: 600 }, playful: { root: 174, intervals: [0, 4, 7, 11], filter: 2200 },
    tense: { root: 98, intervals: [0, 1, 6, 10], filter: 700 }, warm: { root: 130, intervals: [0, 4, 7, 9], filter: 1200 },
  };
  const m = moodMap[mood] ?? moodMap.cinematic!;
  const padGain = ctx.createGain(); padGain.gain.value = 0.22; padGain.connect(master);
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator(); osc.type = i === 0 ? "sawtooth" : "sine";
    osc.frequency.value = (m.root * Math.pow(2, m.intervals[i % m.intervals.length]! / 12)) / (i === 0 ? 2 : 1);
    const g = ctx.createGain(); g.gain.value = 0.12 / (i + 1);
    const filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = m.filter;
    osc.connect(filt); filt.connect(g); g.connect(padGain); osc.start(now); osc.stop(now + durationSec + 0.5);
  }
  const pulseCount = Math.min(Math.floor(durationSec / beat), 120);
  for (let i = 0; i < pulseCount; i++) {
    const t = now + i * beat; const osc = ctx.createOscillator(); osc.type = "sine";
    osc.frequency.setValueAtTime(90, t); osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.34, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(g); g.connect(master); osc.start(t); osc.stop(t + 0.2);
  }
  master.gain.setValueAtTime(0.32, now + Math.max(0, durationSec - 1.2)); master.gain.linearRampToValueAtTime(0.0001, now + durationSec);
  return () => { try { master.disconnect(); } catch { /* */ } };
}

function pickMimeType(): { mimeType: string; ext: "mp4" | "webm" } {
  const mp4 = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1.4D401E,mp4a.40.2", "video/mp4;codecs=avc1.64001F,mp4a.40.2", "video/mp4"];
  const webm = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  if (typeof MediaRecorder !== "undefined") {
    for (const t of mp4) if (MediaRecorder.isTypeSupported(t)) return { mimeType: t, ext: "mp4" };
    for (const t of webm) if (MediaRecorder.isTypeSupported(t)) return { mimeType: t, ext: "webm" };
  }
  return { mimeType: "video/webm", ext: "webm" };
}

function resolveSize(spec: VideoSpec): { width: number; height: number } {
  let w = Math.round(spec.width || 1920), h = Math.round(spec.height || 1080);
  if (w > 1920 || h > 1080) { w = 1920; h = 1080; }
  if (w < 1280) w = 1920; if (h < 720) h = 1080;
  return { width: w, height: h };
}

const yieldFrame = () => new Promise<void>((r) => { if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => r()); else setTimeout(r, 0); });

export type RenderVideoResult = { blob: Blob; ext: "mp4" | "webm" };

export async function renderVideo(spec: VideoSpec, onProgress?: (ratio: number) => void): Promise<Blob> {
  const result = await renderVideoWithMeta(spec, onProgress);
  return result.blob;
}

export async function renderVideoWithMeta(spec: VideoSpec, onProgress?: (ratio: number) => void): Promise<RenderVideoResult> {
  const fps = Math.min(30, Math.max(24, Math.round(spec.fps || 30)));
  const durationSec = Math.min(30, Math.max(6, spec.durationSec || 14));
  const totalFrames = Math.ceil(durationSec * fps);
  const frameDurationMs = 1000 / fps;
  const { width, height } = resolveSize(spec);
  const renderSpec: VideoSpec = { ...spec, width, height, fps, durationSec };

  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!ctx) throw new Error("Canvas 2D unavailable");
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";

  let three: ReturnType<typeof buildThreeScene> | null = null;
  try { three = buildThreeScene(width, height, spec.seed ?? 1, spec.background || "#07060f", renderSpec); }
  catch (e) { console.warn("[Zeros] Three.js init failed:", e); }

  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  let audioCtx: AudioContext | null = null; let stopAudio: (() => void) | null = null; let audioDest: MediaStreamAudioDestinationNode | null = null;
  try {
    audioCtx = new AudioCtx();
    if (audioCtx.state === "suspended") { try { await audioCtx.resume(); } catch { /* */ } }
    audioDest = audioCtx.createMediaStreamDestination();
    stopAudio = startAudioBed(audioCtx, audioDest, spec.audio?.mood || "cinematic", spec.audio?.bpm || 96, durationSec);
  } catch (e) { console.warn("[Zeros] audio bed failed:", e); }

  const videoStream = canvas.captureStream(fps);
  const mixed = new MediaStream();
  videoStream.getVideoTracks().forEach((t) => mixed.addTrack(t));
  audioDest?.stream.getAudioTracks().forEach((t) => mixed.addTrack(t));

  const { mimeType, ext } = pickMimeType();
  let recorder: MediaRecorder;
  try { recorder = new MediaRecorder(mixed, { mimeType, videoBitsPerSecond: 12_000_000, audioBitsPerSecond: 192_000 }); }
  catch { recorder = new MediaRecorder(mixed); }

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

  const done = new Promise<Blob>((resolve, reject) => {
    const timer = window.setTimeout(() => { try { recorder.stop(); } catch { /* */ } reject(new Error("Video encode timed out")); }, 500_000);
    recorder.onerror = () => { window.clearTimeout(timer); reject(new Error("MediaRecorder failed")); };
    recorder.onstop = () => {
      window.clearTimeout(timer);
      resolve(new Blob(chunks, { type: ext === "mp4" ? "video/mp4" : (mimeType.split(";")[0] || "video/webm") }));
    };
  });

  recorder.start(100);
  for (let i = 0; i < totalFrames; i++) {
    const tMs = i * frameDurationMs; const tSec = tMs / 1000;
    if (three) { tickThree(three, tSec, tMs); ctx.drawImage(three.renderer.domElement, 0, 0, width, height); }
    else { ctx.fillStyle = spec.background || "#07060f"; ctx.fillRect(0, 0, width, height); }
    paintPost(ctx, renderSpec, tMs);
    if (i % 2 === 0) onProgress?.(i / totalFrames);
    await yieldFrame();
  }
  if (three) { tickThree(three, durationSec, durationSec * 1000 - 1); ctx.drawImage(three.renderer.domElement, 0, 0, width, height); }
  paintPost(ctx, renderSpec, durationSec * 1000 - 1);
  onProgress?.(0.98);
  await new Promise((r) => setTimeout(r, 150));
  try { recorder.stop(); } catch { /* */ }
  videoStream.getTracks().forEach((t) => t.stop()); mixed.getTracks().forEach((t) => t.stop());
  stopAudio?.(); try { three?.renderer.dispose(); } catch { /* */ } try { await audioCtx?.close(); } catch { /* */ }
  const blob = await done; onProgress?.(1);
  if (!blob.size) throw new Error("Video encode produced empty blob");
  return { blob, ext };
}
