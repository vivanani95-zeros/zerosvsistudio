/**
 * Zeros Peak Video Engine — Three.js 3D + cinematic 2D overlay + real audio.
 * WebGL scene (depth, meshes, particles) → 2D type/glass → Web Audio bed → MediaRecorder (WebM + Opus).
 * Default cinematic 1080p (1920×1080); true 4K canvas encode is clamped for browser stability.
 */

import type { VideoLayer, VideoScene, VideoSpec } from "@/lib/video-spec";
import * as THREE from "three";

const FONT = '"Inter","SF Pro Display","Segoe UI",system-ui,-apple-system,sans-serif';

function ease(t: number, kind: VideoScene["ease"] = "easeInOut"): number {
  const x = Math.min(1, Math.max(0, t));
  switch (kind) {
    case "linear":
      return x;
    case "easeIn":
      return x * x * x;
    case "easeOut":
      return 1 - Math.pow(1 - x, 3);
    case "bounce": {
      const n1 = 7.5625;
      const d1 = 2.75;
      if (x < 1 / d1) return n1 * x * x;
      if (x < 2 / d1) {
        const y = x - 1.5 / d1;
        return n1 * y * y + 0.75;
      }
      if (x < 2.5 / d1) {
        const y = x - 2.25 / d1;
        return n1 * y * y + 0.9375;
      }
      {
        const y = x - 2.625 / d1;
        return n1 * y * y + 0.984375;
      }
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

function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number, s = 0.55) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.72);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${s})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawFilmGrain(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, tSec: number) {
  ctx.save();
  ctx.globalAlpha = 0.035;
  const step = 4;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const n = Math.sin((x + 17) * (y + 29) * ((seed % 997) + 1) + tSec * 42) * 0.5 + 0.5;
      if (n > 0.6) {
        const v = Math.floor(150 + n * 100);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x, y, step, step);
      }
    }
  }
  ctx.restore();
}

function drawSoftOrb(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, alpha: number) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  const base = color;
  g.addColorStop(0, base.includes("rgba") ? base.replace(/[\d.]+\)$/, "0.85)") : base + "cc");
  g.addColorStop(0.4, base.includes("rgba") ? base.replace(/[\d.]+\)$/, "0.2)") : base + "40");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGradient(ctx: CanvasRenderingContext2D, w: number, h: number, from: string, to: string, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  const x0 = w / 2 - (Math.cos(rad) * w) / 2;
  const y0 = h / 2 - (Math.sin(rad) * h) / 2;
  const x1 = w / 2 + (Math.cos(rad) * w) / 2;
  const y1 = h / 2 + (Math.sin(rad) * h) / 2;
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawParticles2d(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  count: number,
  color: string,
  speed: number,
  tSec: number,
  seed: number,
) {
  ctx.save();
  for (let i = 0; i < count; i++) {
    const s = seed + i * 9973;
    const drift = tSec * speed;
    const px = (((Math.sin(s * 0.017) * 0.5 + 0.5) * w + drift * 38 * (1 + (s % 5))) % w + w) % w;
    const py = (((Math.cos(s * 0.013) * 0.5 + 0.5) * h + drift * 15 * ((s % 3) - 1)) % h + h) % h;
    const r = 1.2 + (s % 5) * 0.8;
    ctx.globalAlpha = 0.18 + (s % 40) / 220;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: VideoLayer,
  w: number,
  h: number,
  localMs: number,
  sceneDur: number,
  tSec: number,
  seed: number,
  sceneEase: VideoScene["ease"],
) {
  if (layer.type === "gradient") {
    drawGradient(ctx, w, h, layer.from ?? "#07060f", layer.to ?? "#15102a", layer.angle ?? 155);
    return;
  }
  if (layer.type === "particles") {
    drawParticles2d(ctx, w, h, layer.count ?? 52, layer.color ?? "#7b93ff", layer.speed ?? 0.42, tSec, seed);
    return;
  }

  const fadeIn = "fadeInMs" in layer ? (layer.fadeInMs ?? 400) : 400;
  const fadeOut = "fadeOutMs" in layer ? (layer.fadeOutMs ?? 300) : 300;
  const alpha = layerAlpha(localMs, sceneDur, fadeIn, fadeOut);
  if (alpha <= 0.01) return;
  const enterT = fadeIn > 0 ? ease(Math.min(1, localMs / fadeIn), sceneEase || "easeOut") : 1;
  const lift = (1 - enterT) * 28;

  ctx.save();
  ctx.globalAlpha = alpha;

  if (layer.type === "text") {
    const x = (layer.x ?? 0.5) * w;
    const y = (layer.y ?? 0.5) * h + lift * 0.5;
    const size = Math.round((layer.fontSize ?? 48) * (w / 1920));
    const weight = layer.weight ?? 650;
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = layer.color ?? "#f4f5ff";
    ctx.textAlign = layer.align ?? "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(120,140,255,0.55)";
    ctx.shadowBlur = Math.min(40, size * 0.45);
    const lines = (layer.text || "").split("\n");
    const lineH = size * 1.22;
    const startY = y - ((lines.length - 1) * lineH) / 2;
    lines.forEach((line, i) => ctx.fillText(line, x, startY + i * lineH, w * 0.88));
    ctx.shadowBlur = 0;
    lines.forEach((line, i) => ctx.fillText(line, x, startY + i * lineH, w * 0.88));
  } else if (layer.type === "shape") {
    const x = (layer.x ?? 0) * w;
    const y = (layer.y ?? 0) * h + lift * 0.3;
    const sw = (layer.w ?? 0.3) * w;
    const sh = (layer.h ?? 0.2) * h;
    const cx = x + sw / 2;
    const cy = y + sh / 2;
    const scale = 0.88 + enterT * 0.12;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    if (layer.rotate) ctx.rotate((layer.rotate * Math.PI) / 180);
    ctx.translate(-cx, -cy);
    const shape = layer.shape || "rounded";

    if (shape === "circle" || shape === "orb") {
      drawSoftOrb(ctx, cx, cy, Math.max(sw, sh) / 2, layer.color ?? "rgba(120,140,255,0.55)", 1);
    } else if (shape === "rounded" || shape === "glass") {
      const r = Math.min(sw, sh) * 0.14;
      ctx.beginPath();
      ctx.roundRect(x, y, sw, sh, r);
      ctx.fillStyle = layer.color ?? "rgba(255,255,255,0.07)";
      ctx.fill();
      const hg = ctx.createLinearGradient(x, y, x, y + sh);
      hg.addColorStop(0, "rgba(255,255,255,0.16)");
      hg.addColorStop(0.45, "rgba(255,255,255,0.02)");
      hg.addColorStop(1, "rgba(0,0,0,0.2)");
      ctx.fillStyle = hg;
      ctx.fill();
      ctx.strokeStyle = layer.stroke || "rgba(180,200,255,0.35)";
      ctx.lineWidth = layer.strokeWidth ?? 1.4;
      ctx.stroke();
    } else if (shape === "pill") {
      const r = Math.min(sw, sh) / 2;
      ctx.beginPath();
      ctx.roundRect(x, y, sw, sh, r);
      ctx.fillStyle = layer.color ?? "rgba(255,255,255,0.12)";
      ctx.fill();
      if (layer.stroke) {
        ctx.strokeStyle = layer.stroke;
        ctx.lineWidth = layer.strokeWidth ?? 1;
        ctx.stroke();
      }
    } else if (shape === "line") {
      ctx.strokeStyle = layer.stroke || layer.color || "#a8b8ff";
      ctx.lineWidth = layer.strokeWidth || 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + sw, y + sh);
      ctx.stroke();
    } else {
      ctx.fillStyle = layer.color ?? "rgba(255,255,255,0.08)";
      ctx.fillRect(x, y, sw, sh);
      if (layer.stroke && (layer.strokeWidth ?? 0) > 0) {
        ctx.strokeStyle = layer.stroke;
        ctx.lineWidth = layer.strokeWidth ?? 1;
        ctx.strokeRect(x, y, sw, sh);
      }
    }
  }
  ctx.restore();
}

/** Build a Three.js scene that gives depth / 3D motion under the 2D overlay. */
function buildThreeScene(w: number, h: number, seed: number, bg: string) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(bg || "#07060f", 0.035);

  const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
  camera.position.set(0, 0.15, 5.2);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(1);
  renderer.setClearColor(bg || "#07060f", 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const amb = new THREE.AmbientLight(0x6a7cff, 0.55);
  scene.add(amb);
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(3, 4, 5);
  scene.add(key);
  const rim = new THREE.PointLight(0x88aaff, 1.4, 20);
  rim.position.set(-3, -1, 2);
  scene.add(rim);
  const accent = new THREE.PointLight(0xff66cc, 0.7, 14);
  accent.position.set(2, -2, -1);
  scene.add(accent);

  const group = new THREE.Group();
  scene.add(group);

  const rng = (n: number) => {
    const x = Math.sin(seed * 0.001 + n * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };

  const geos = [
    new THREE.IcosahedronGeometry(0.55, 1),
    new THREE.TorusGeometry(0.45, 0.14, 16, 48),
    new THREE.OctahedronGeometry(0.5, 0),
    new THREE.SphereGeometry(0.4, 32, 32),
    new THREE.TorusKnotGeometry(0.35, 0.12, 64, 12),
  ];

  const meshes: THREE.Mesh[] = [];
  for (let i = 0; i < 9; i++) {
    const geo = geos[i % geos.length]!;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.62 + rng(i) * 0.12, 0.55, 0.45 + rng(i + 3) * 0.2),
      metalness: 0.65 + rng(i + 1) * 0.3,
      roughness: 0.18 + rng(i + 2) * 0.25,
      transparent: true,
      opacity: 0.72 + rng(i + 4) * 0.2,
      emissive: new THREE.Color().setHSL(0.7, 0.6, 0.12),
      emissiveIntensity: 0.25,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((rng(i + 10) - 0.5) * 6.5, (rng(i + 20) - 0.5) * 3.8, (rng(i + 30) - 0.5) * 4 - 1);
    mesh.rotation.set(rng(i + 40) * Math.PI, rng(i + 50) * Math.PI, 0);
    mesh.userData = {
      spin: 0.25 + rng(i + 60) * 0.9,
      bob: 0.3 + rng(i + 70) * 0.6,
      phase: rng(i + 80) * Math.PI * 2,
      baseY: mesh.position.y,
    };
    group.add(mesh);
    meshes.push(mesh);
  }

  const pCount = 280;
  const positions = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) {
    positions[i * 3] = (rng(i + 100) - 0.5) * 14;
    positions[i * 3 + 1] = (rng(i + 200) - 0.5) * 9;
    positions[i * 3 + 2] = (rng(i + 300) - 0.5) * 10 - 2;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const pMat = new THREE.PointsMaterial({
    color: 0xaabbff,
    size: 0.035,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(pGeo, pMat);
  scene.add(points);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(8, 64),
    new THREE.MeshStandardMaterial({
      color: 0x0a0c18,
      metalness: 0.9,
      roughness: 0.35,
      transparent: true,
      opacity: 0.45,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.1;
  scene.add(floor);

  return { scene, camera, renderer, meshes, points, group };
}

function tickThree(
  three: ReturnType<typeof buildThreeScene>,
  tSec: number,
) {
  const { camera, renderer, scene, meshes, points, group } = three;
  for (const mesh of meshes) {
    const u = mesh.userData as { spin: number; bob: number; phase: number; baseY: number };
    mesh.rotation.x += 0.004 * u.spin;
    mesh.rotation.y += 0.006 * u.spin;
    mesh.position.y = u.baseY + Math.sin(tSec * u.bob + u.phase) * 0.35;
  }
  points.rotation.y = tSec * 0.04;
  group.rotation.y = Math.sin(tSec * 0.12) * 0.15;
  camera.position.x = Math.sin(tSec * 0.18) * 0.45;
  camera.position.y = 0.15 + Math.sin(tSec * 0.11) * 0.12;
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
}

function paintOverlay(ctx: CanvasRenderingContext2D, spec: VideoSpec, tMs: number) {
  const w = spec.width;
  const h = spec.height;
  const tSec = tMs / 1000;
  const seed = spec.seed ?? 1;

  const active = spec.scenes.filter((s) => tMs >= s.startMs && tMs < s.endMs);
  if (active.length === 0 && spec.scenes.length) {
    const last = spec.scenes[spec.scenes.length - 1]!;
    if (tMs >= last.startMs) active.push(last);
  }

  for (const scene of active) {
    const localMs = tMs - scene.startMs;
    const sceneDur = Math.max(1, scene.endMs - scene.startMs);
    for (const layer of scene.layers) {
      if (layer.type === "gradient") continue;
      drawLayer(ctx, layer, w, h, localMs, sceneDur, tSec, seed, scene.ease);
    }
  }

  drawSoftOrb(ctx, w * 0.12, h * 0.18, w * 0.28, "rgba(90,70,200,0.28)", 0.32);
  drawSoftOrb(ctx, w * 0.88, h * 0.78, w * 0.3, "rgba(40,120,220,0.22)", 0.28);

  drawVignette(ctx, w, h, 0.5);
  drawFilmGrain(ctx, w, h, seed, tSec);

  const bar = Math.round(h * 0.04);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, bar);
  ctx.fillRect(0, h - bar, w, bar);

  const lines = spec.audio?.voiceoverLines ?? [];
  const caption = lines.find((l, i) => {
    const next = lines[i + 1];
    return tMs >= l.startMs && (!next || tMs < next.startMs);
  });
  if (caption?.text) {
    ctx.save();
    const fs = Math.round(22 * (w / 1920));
    ctx.font = `500 ${fs}px ${FONT}`;
    const metrics = ctx.measureText(caption.text);
    const padX = 28;
    const tw = Math.min(w * 0.82, metrics.width + padX * 2);
    const th = Math.round(48 * (h / 1080));
    const tx = (w - tw) / 2;
    const ty = h - bar - Math.round(64 * (h / 1080));
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, th, 16);
    ctx.fillStyle = "rgba(6,8,18,0.8)";
    ctx.fill();
    ctx.strokeStyle = "rgba(160,180,255,0.28)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#eef1ff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(caption.text, w / 2, ty + th / 2, tw - padX);
    ctx.restore();
  }
}

/** Procedural score from Web Audio — audible bed matching mood/bpm. */
function startAudioBed(
  ctx: AudioContext,
  dest: MediaStreamAudioDestinationNode,
  mood: string,
  bpm: number,
  durationSec: number,
) {
  const master = ctx.createGain();
  master.gain.value = 0.28;
  master.connect(dest);
  master.connect(ctx.destination);

  const beat = 60 / Math.max(60, Math.min(160, bpm));
  const now = ctx.currentTime;

  const moodMap: Record<string, { root: number; intervals: number[]; filter: number }> = {
    cinematic: { root: 110, intervals: [0, 3, 7, 10, 12], filter: 900 },
    upbeat: { root: 146, intervals: [0, 4, 7, 12], filter: 1800 },
    ambient: { root: 82, intervals: [0, 5, 7, 12], filter: 600 },
    playful: { root: 174, intervals: [0, 4, 7, 11], filter: 2200 },
    tense: { root: 98, intervals: [0, 1, 6, 10], filter: 700 },
    warm: { root: 130, intervals: [0, 4, 7, 9], filter: 1200 },
  };
  const m = moodMap[mood] ?? moodMap.cinematic!;

  const padGain = ctx.createGain();
  padGain.gain.value = 0.22;
  padGain.connect(master);
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator();
    osc.type = i === 0 ? "sawtooth" : "sine";
    const freq = m.root * Math.pow(2, m.intervals[i % m.intervals.length]! / 12);
    osc.frequency.value = freq / (i === 0 ? 2 : 1);
    const g = ctx.createGain();
    g.gain.value = 0.12 / (i + 1);
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = m.filter;
    osc.connect(filt);
    filt.connect(g);
    g.connect(padGain);
    osc.start(now);
    osc.stop(now + durationSec + 0.5);
  }

  const pulseCount = Math.floor(durationSec / beat);
  for (let i = 0; i < pulseCount; i++) {
    const t = now + i * beat;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  for (let i = 0; i < pulseCount; i += 2) {
    const t = now + i * beat + beat * 0.5;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = m.root * 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  master.gain.setValueAtTime(0.28, now + Math.max(0, durationSec - 1.2));
  master.gain.linearRampToValueAtTime(0.0001, now + durationSec);

  return () => {
    try {
      master.disconnect();
    } catch {
      /* */
    }
  };
}

function pickMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const t of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "video/webm";
}

function resolveSize(spec: VideoSpec): { width: number; height: number } {
  let w = Math.round(spec.width || 1920);
  let h = Math.round(spec.height || 1080);
  if (w > 2560 || h > 1440) {
    w = 1920;
    h = 1080;
  }
  if (w < 640) w = 1920;
  if (h < 360) h = 1080;
  return { width: w, height: h };
}

export async function renderVideo(spec: VideoSpec, onProgress?: (ratio: number) => void): Promise<Blob> {
  const fps = Math.min(30, Math.max(24, Math.round(spec.fps || 30)));
  const durationSec = Math.min(45, Math.max(6, spec.durationSec || 12));
  const totalFrames = Math.ceil(durationSec * fps);
  const frameDurationMs = 1000 / fps;
  const { width, height } = resolveSize(spec);
  const renderSpec: VideoSpec = { ...spec, width, height };

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const three = buildThreeScene(width, height, spec.seed ?? 1, spec.background || "#07060f");

  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtx();
  if (audioCtx.state === "suspended") {
    try {
      await audioCtx.resume();
    } catch {
      /* autoplay policies */
    }
  }
  const audioDest = audioCtx.createMediaStreamDestination();
  const stopAudio = startAudioBed(
    audioCtx,
    audioDest,
    spec.audio?.mood || "cinematic",
    spec.audio?.bpm || 96,
    durationSec,
  );

  const videoStream = canvas.captureStream(fps);
  const mixed = new MediaStream();
  videoStream.getVideoTracks().forEach((t) => mixed.addTrack(t));
  audioDest.stream.getAudioTracks().forEach((t) => mixed.addTrack(t));

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(mixed, {
    mimeType,
    videoBitsPerSecond: 12_000_000,
    audioBitsPerSecond: 192_000,
  });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error("MediaRecorder failed"));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType.split(";")[0] || "video/webm" }));
  });

  recorder.start(80);

  for (let i = 0; i < totalFrames; i++) {
    const tMs = i * frameDurationMs;
    const tSec = tMs / 1000;

    tickThree(three, tSec);
    ctx.drawImage(three.renderer.domElement, 0, 0, width, height);
    paintOverlay(ctx, renderSpec, tMs);

    onProgress?.(i / totalFrames);
    await new Promise<void>((r) => {
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => r());
      else setTimeout(r, 0);
    });
  }

  tickThree(three, durationSec);
  ctx.drawImage(three.renderer.domElement, 0, 0, width, height);
  paintOverlay(ctx, renderSpec, durationSec * 1000 - 1);
  await new Promise((r) => setTimeout(r, 180));

  recorder.stop();
  videoStream.getTracks().forEach((t) => t.stop());
  mixed.getTracks().forEach((t) => t.stop());
  stopAudio();
  try {
    three.renderer.dispose();
    await audioCtx.close();
  } catch {
    /* */
  }

  const blob = await done;
  onProgress?.(1);
  if (!blob.size) throw new Error("Video encode produced empty blob");
  return blob;
}
