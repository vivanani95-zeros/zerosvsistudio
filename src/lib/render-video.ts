/**
 * Zeros Peak Video — Claude Pop style motion film (silent).
 *
 * Pipeline: Understand → Plan → Detailed planning (VideoSpec) → Code render
 * Engine: Three.js 3D world (camera, solids, particle field, 3D text planes)
 *          + Canvas 2D overlay (kinetic type, glass, graphs, letterbox)
 * Every frame is dense — never empty text-on-void.
 */

import * as THREE from "three";
import type { VideoLayer, VideoSpec } from "@/lib/video-spec";
import { defaultVideoSpec } from "@/lib/video-spec";

const FONT = '"Inter","SF Pro Display","Segoe UI",system-ui,sans-serif';
const W = 1280;
const H = 720;
const FPS = 24;
const MIN_SEC = 40;
const MAX_SEC = 90; // peak quality window (still finishes)
const HARD_TIMEOUT_MS = 12 * 60 * 1000;

export type RenderVideoResult = { blob: Blob; ext: "mp4" | "webm" };

function clamp01(t: number) {
  return Math.min(1, Math.max(0, t));
}
function ease(kind: string | undefined, t: number): number {
  const x = clamp01(t);
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
      const y = x - 2.625 / d1;
      return n1 * y * y + 0.984375;
    }
    default:
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }
}

function seeded(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function layerAlpha(layer: VideoLayer, localMs: number, sceneDur: number): number {
  const fi = "fadeInMs" in layer && typeof layer.fadeInMs === "number" ? layer.fadeInMs : 350;
  const fo = "fadeOutMs" in layer && typeof layer.fadeOutMs === "number" ? layer.fadeOutMs : 280;
  let a = 1;
  if (fi > 0 && localMs < fi) a = Math.min(a, ease("easeOut", localMs / fi));
  if (fo > 0 && localMs > sceneDur - fo) a = Math.min(a, ease("easeIn", (sceneDur - localMs) / fo));
  return clamp01(a);
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, rad);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/** Make a canvas texture with bold 3D-looking type for Three.js planes */
function makeTextTexture(text: string, color = "#f4f6ff", size = 128): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 1024, 256);
  g.font = `800 ${size}px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = "rgba(80,120,255,0.55)";
  g.shadowBlur = 24;
  g.fillStyle = color;
  g.fillText(text.slice(0, 28), 512, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

type Studio = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  solids: THREE.Mesh[];
  cards: THREE.Mesh[];
  textPlanes: THREE.Mesh[];
  particles: THREE.Points;
  dispose: () => void;
};

function buildStudio(seed: number, title: string): Studio {
  const rnd = seeded(seed);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setSize(W, H, false);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x060510, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x060510, 0.035);

  const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);
  camera.position.set(0, 0.4, 6.5);

  // Lights — cinematic
  scene.add(new THREE.AmbientLight(0x6688cc, 0.45));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(3, 5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x66aaff, 0.55);
  rim.position.set(-4, 2, -3);
  scene.add(rim);
  const point = new THREE.PointLight(0xff66aa, 0.6, 20);
  point.position.set(0, 1, 2);
  scene.add(point);

  // Floor grid plane
  const floorGeo = new THREE.PlaneGeometry(40, 40, 1, 1);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x0a0c18,
    metalness: 0.6,
    roughness: 0.85,
    transparent: true,
    opacity: 0.9,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.6;
  scene.add(floor);

  // Solids: boxes, spheres, torus — Claude Pop density
  const solids: THREE.Mesh[] = [];
  const geos = [
    new THREE.BoxGeometry(0.7, 0.7, 0.7),
    new THREE.SphereGeometry(0.45, 32, 32),
    new THREE.TorusGeometry(0.4, 0.12, 16, 48),
    new THREE.OctahedronGeometry(0.5),
    new THREE.IcosahedronGeometry(0.4, 0),
    new THREE.ConeGeometry(0.35, 0.7, 24),
  ];
  for (let i = 0; i < 14; i++) {
    const geo = geos[i % geos.length]!;
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color().setHSL((0.55 + rnd() * 0.25 + i * 0.04) % 1, 0.65, 0.55),
      metalness: 0.35 + rnd() * 0.4,
      roughness: 0.2 + rnd() * 0.4,
      transparent: true,
      opacity: 0.85,
      transmission: rnd() > 0.6 ? 0.35 : 0,
      thickness: 0.6,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((rnd() - 0.5) * 7, (rnd() - 0.3) * 3, (rnd() - 0.5) * 5 - 1);
    mesh.rotation.set(rnd() * Math.PI, rnd() * Math.PI, 0);
    mesh.userData = {
      base: mesh.position.clone(),
      speed: 0.3 + rnd() * 0.8,
      amp: 0.2 + rnd() * 0.5,
      spin: (rnd() - 0.5) * 1.2,
    };
    scene.add(mesh);
    solids.push(mesh);
  }

  // Floating glass cards
  const cards: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const geo = new THREE.PlaneGeometry(1.4, 0.9);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.1,
      roughness: 0.15,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      transmission: 0.55,
      thickness: 0.4,
    });
    const card = new THREE.Mesh(geo, mat);
    card.position.set((rnd() - 0.5) * 5, (rnd() - 0.2) * 2.5, -1 - rnd() * 3);
    card.userData = { base: card.position.clone(), speed: 0.25 + rnd() * 0.5, amp: 0.15 + rnd() * 0.3 };
    scene.add(card);
    cards.push(card);
  }

  // 3D text planes (title + accents)
  const textPlanes: THREE.Mesh[] = [];
  const labels = [title.slice(0, 22) || "Zeros", "MOTION", "DESIGN", "PEAK"];
  labels.forEach((label, i) => {
    const tex = makeTextTexture(label, i === 0 ? "#f4f6ff" : "#8ec5ff", i === 0 ? 110 : 90);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: i === 0 ? 0.95 : 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(i === 0 ? 3.6 : 2.2, i === 0 ? 0.9 : 0.55), mat);
    plane.position.set((i - 1.5) * 1.2, 0.8 - i * 0.35, 1.2 - i * 0.3);
    plane.userData = { base: plane.position.clone(), speed: 0.4 + i * 0.1, amp: 0.12 };
    scene.add(plane);
    textPlanes.push(plane);
  });

  // Particle field
  const pCount = 900;
  const positions = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) {
    positions[i * 3] = (rnd() - 0.5) * 16;
    positions[i * 3 + 1] = (rnd() - 0.5) * 10;
    positions[i * 3 + 2] = (rnd() - 0.5) * 12;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const pMat = new THREE.PointsMaterial({
    color: 0x88aaff,
    size: 0.035,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  const particles = new THREE.Points(pGeo, pMat);
  scene.add(particles);

  const dispose = () => {
    renderer.dispose();
    geos.forEach((g) => g.dispose());
    solids.forEach((m) => (m.material as THREE.Material).dispose());
    cards.forEach((m) => (m.material as THREE.Material).dispose());
    textPlanes.forEach((m) => {
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
    });
    pGeo.dispose();
    pMat.dispose();
    floorGeo.dispose();
    floorMat.dispose();
  };

  return { renderer, scene, camera, solids, cards, textPlanes, particles, dispose };
}

function updateStudio(studio: Studio, t: number, energy: number) {
  const { camera, solids, cards, textPlanes, particles } = studio;

  // Cinematic camera path
  const orbit = t * 0.22;
  camera.position.x = Math.sin(orbit) * (2.2 + energy * 0.8);
  camera.position.y = 0.35 + Math.sin(t * 0.35) * 0.25;
  camera.position.z = 5.8 + Math.cos(orbit * 0.7) * 0.8 - energy * 0.3;
  camera.lookAt(0, 0.2, 0);

  solids.forEach((m, i) => {
    const u = m.userData as { base: THREE.Vector3; speed: number; amp: number; spin: number };
    m.position.x = u.base.x + Math.sin(t * u.speed + i) * u.amp;
    m.position.y = u.base.y + Math.cos(t * u.speed * 0.8 + i) * u.amp * 0.7;
    m.rotation.x += u.spin * 0.016;
    m.rotation.y += u.spin * 0.012;
    const s = 0.9 + energy * 0.15 + Math.sin(t * 2 + i) * 0.05;
    m.scale.setScalar(s);
  });

  cards.forEach((m, i) => {
    const u = m.userData as { base: THREE.Vector3; speed: number; amp: number };
    m.position.y = u.base.y + Math.sin(t * u.speed + i) * u.amp;
    m.rotation.y = Math.sin(t * 0.3 + i) * 0.25;
    m.rotation.x = Math.cos(t * 0.2 + i) * 0.1;
  });

  textPlanes.forEach((m, i) => {
    const u = m.userData as { base: THREE.Vector3; speed: number; amp: number };
    m.position.y = u.base.y + Math.sin(t * u.speed) * u.amp;
    m.position.z = u.base.z + Math.cos(t * 0.4 + i) * 0.15;
    m.rotation.y = Math.sin(t * 0.35 + i) * 0.12;
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.4 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.5 + i));
  });

  particles.rotation.y = t * 0.05;
  particles.rotation.x = Math.sin(t * 0.08) * 0.1;
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  spec: VideoSpec,
  tSec: number,
  imageCache: Map<string, HTMLImageElement>,
) {
  const tMs = tSec * 1000;
  const seed = spec.seed ?? 42;
  const scenes = spec.scenes || [];

  for (let si = 0; si < scenes.length; si++) {
    const scene = scenes[si]!;
    if (tMs < scene.startMs - 40 || tMs > scene.endMs + 40) continue;
    const sceneDur = Math.max(1, scene.endMs - scene.startMs);
    const localMs = tMs - scene.startMs;
    let sceneA = 1;
    const edge = 300;
    if (localMs < edge) sceneA = ease("easeOut", localMs / edge);
    if (localMs > sceneDur - edge) sceneA = Math.min(sceneA, ease("easeIn", (sceneDur - localMs) / edge));

    for (const layer of scene.layers) {
      const la = layerAlpha(layer, localMs, sceneDur) * sceneA;
      if (la < 0.03) continue;
      try {
        if (layer.type === "text") {
          const text = layer.text || "";
          if (!text) continue;
          const x = (layer.x ?? 0.5) * W;
          const y = (layer.y ?? 0.5) * H;
          const fs = layer.fontSize ?? 42;
          const fi = layer.fadeInMs ?? 400;
          const reveal = clamp01(localMs / Math.max(200, fi));
          const shown = text.slice(0, Math.ceil(text.length * ease("easeOut", reveal)));
          ctx.save();
          ctx.globalAlpha = la;
          ctx.font = `${layer.weight ?? 700} ${fs}px ${FONT}`;
          ctx.textAlign = layer.align || "center";
          ctx.textBaseline = "middle";
          ctx.shadowColor = "rgba(60,100,255,0.45)";
          ctx.shadowBlur = 18;
          ctx.fillStyle = layer.color || "#f4f6ff";
          ctx.fillText(shown, x, y, W * 0.92);
          ctx.restore();
        } else if (layer.type === "shape") {
          const x = (layer.x ?? 0.5) * W;
          const y = (layer.y ?? 0.5) * H;
          const w = Math.max(2, (layer.w ?? 0.25) * W);
          const h = Math.max(2, (layer.h ?? 0.15) * H);
          ctx.save();
          ctx.globalAlpha = la * 0.9;
          const color = layer.color || "rgba(255,255,255,0.1)";
          if (layer.shape === "glass" || layer.shape === "rounded" || layer.shape === "rect" || layer.shape === "pill") {
            const r = layer.shape === "pill" ? h / 2 : layer.shape === "glass" || layer.shape === "rounded" ? 16 : 4;
            rr(ctx, x, y, w, h, r);
            ctx.fillStyle = color;
            ctx.fill();
            if (layer.stroke) {
              ctx.strokeStyle = layer.stroke;
              ctx.lineWidth = layer.strokeWidth || 1;
              ctx.stroke();
            }
          } else if (layer.shape === "circle" || layer.shape === "orb") {
            ctx.beginPath();
            ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
          } else if (layer.shape === "line") {
            ctx.beginPath();
            ctx.moveTo(x, y + h / 2);
            ctx.lineTo(x + w, y + h / 2);
            ctx.strokeStyle = color;
            ctx.lineWidth = layer.strokeWidth || 2;
            ctx.stroke();
          }
          ctx.restore();
        } else if (layer.type === "graph") {
          const points = layer.points || [];
          if (!points.length) continue;
          const x = (layer.x ?? 0.12) * W;
          const y = (layer.y ?? 0.22) * H;
          const w = (layer.w ?? 0.76) * W;
          const h = (layer.h ?? 0.38) * H;
          const color = layer.color || "#6ee7ff";
          const maxV = Math.max(...points.map((p) => p.value), 1);
          const grow = ease("easeOut", clamp01(localMs / 800));
          ctx.save();
          ctx.globalAlpha = la;
          rr(ctx, x - 14, y - 14, w + 28, h + 44, 18);
          ctx.fillStyle = "rgba(8,10,22,0.55)";
          ctx.fill();
          ctx.strokeStyle = "rgba(140,170,255,0.25)";
          ctx.lineWidth = 1;
          ctx.stroke();
          if (layer.style === "line") {
            ctx.beginPath();
            points.forEach((p, i) => {
              const px = x + (i / Math.max(1, points.length - 1)) * w;
              const py = y + h - (p.value / maxV) * h * grow;
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            });
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.stroke();
          } else {
            const gap = 10;
            const bw = (w - gap * (points.length - 1)) / points.length;
            points.forEach((p, i) => {
              const bh = Math.max(3, (p.value / maxV) * h * grow);
              const bx = x + i * (bw + gap);
              const by = y + h - bh;
              const g = ctx.createLinearGradient(bx, by, bx, y + h);
              g.addColorStop(0, color);
              g.addColorStop(1, "rgba(60,80,200,0.3)");
              ctx.fillStyle = g;
              rr(ctx, bx, by, bw, bh, 8);
              ctx.fill();
              if (p.label) {
                ctx.fillStyle = "rgba(210,220,245,0.8)";
                ctx.font = `500 13px ${FONT}`;
                ctx.textAlign = "center";
                ctx.fillText(p.label, bx + bw / 2, y + h + 18);
              }
            });
          }
          ctx.restore();
        } else if (layer.type === "particles") {
          const rnd = seeded(seed + si * 13 + 3);
          const count = layer.count ?? 36;
          ctx.save();
          ctx.globalAlpha = la * 0.65;
          for (let i = 0; i < count; i++) {
            const bx = rnd();
            const by = rnd();
            const drift = tSec * (layer.speed ?? 0.4) * (0.3 + rnd());
            const x = ((bx + Math.sin(drift + i) * 0.03 + 5) % 1) * W;
            const y = ((by - drift * 0.07 + 5) % 1) * H;
            ctx.fillStyle = layer.color || "#8ab4ff";
            ctx.beginPath();
            ctx.arc(x, y, 1.2 + rnd() * 2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        } else if (layer.type === "image" || layer.type === "logo") {
          const img = imageCache.get(layer.src);
          if (!img?.width) continue;
          const x = (layer.x ?? 0.5) * W;
          const y = (layer.y ?? 0.5) * H;
          const w = (layer.w ?? 0.25) * W;
          const h = (layer.h ?? 0.18) * H;
          const scale = Math.min(w / img.width, h / img.height);
          const dw = img.width * scale;
          const dh = img.height * scale;
          ctx.save();
          ctx.globalAlpha = la;
          ctx.drawImage(img, x - dw / 2, y - dh / 2, dw, dh);
          ctx.restore();
        }
      } catch {
        /* skip layer */
      }
    }
  }

  // Vignette + grain + letterbox
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.15, W / 2, H / 2, H * 0.92);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalAlpha = 0.045;
  const gseed = Math.floor(tSec * 24) * 9973 + seed;
  for (let i = 0; i < 100; i++) {
    const x = ((gseed * 1103515245 + i * 12345) >>> 0) % W;
    const y = ((gseed * 214013 + i * 76543) >>> 0) % H;
    ctx.fillStyle = i % 2 ? "#fff" : "#000";
    ctx.fillRect(x, y, 1 + (i % 2), 1);
  }
  ctx.restore();

  const bar = Math.round(H * 0.055);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, bar);
  ctx.fillRect(0, H - bar, W, bar);
}

function pickMime(): { mimeType: string; ext: "mp4" | "webm" } {
  const webm = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  const mp4 = ["video/mp4;codecs=avc1.42E01E", "video/mp4"];
  if (typeof MediaRecorder !== "undefined") {
    for (const t of webm) if (MediaRecorder.isTypeSupported(t)) return { mimeType: t, ext: "webm" };
    for (const t of mp4) if (MediaRecorder.isTypeSupported(t)) return { mimeType: t, ext: "mp4" };
  }
  return { mimeType: "video/webm", ext: "webm" };
}

const waitFrame = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function preloadImages(spec: VideoSpec): Promise<Map<string, HTMLImageElement>> {
  const map = new Map<string, HTMLImageElement>();
  const urls = new Set<string>();
  for (const s of spec.scenes || []) {
    for (const l of s.layers) {
      if ((l.type === "image" || l.type === "logo") && l.src) urls.add(l.src);
    }
  }
  await Promise.all(
    [...urls].map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            map.set(src, img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = src;
          setTimeout(resolve, 3500);
        }),
    ),
  );
  return map;
}

async function emergencyBlob(ext: "mp4" | "webm", mimeType: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const stream = canvas.captureStream(12);
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType });
  } catch {
    recorder = new MediaRecorder(stream);
  }
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data?.size) chunks.push(e.data);
  };
  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: ext === "mp4" ? "video/mp4" : "video/webm" }));
    setTimeout(() => {
      try {
        recorder.stop();
      } catch {
        resolve(new Blob(chunks.length ? chunks : [new Uint8Array([0])], { type: "video/webm" }));
      }
    }, 2000);
  });
  recorder.start(40);
  for (let i = 0; i < 24; i++) {
    ctx.fillStyle = "#0a0820";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#c8d0ff";
    ctx.font = `600 28px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("Zeros", W / 2, H / 2);
    await waitFrame(60);
  }
  try {
    recorder.stop();
  } catch {
    /* */
  }
  stream.getTracks().forEach((t) => t.stop());
  return done;
}

export async function renderVideo(
  spec: VideoSpec,
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  return (await renderVideoWithMeta(spec, onProgress)).blob;
}

export async function renderVideoWithMeta(
  input: VideoSpec,
  onProgress?: (ratio: number) => void,
): Promise<RenderVideoResult> {
  const started = Date.now();
  const report = (r: number) => {
    try {
      onProgress?.(Math.max(0, Math.min(1, r)));
    } catch {
      /* */
    }
  };

  const durationSec = Math.min(MAX_SEC, Math.max(MIN_SEC, input?.durationSec ?? 50));
  const spec: VideoSpec =
    input?.scenes?.length > 0
      ? { ...input, durationSec, fps: FPS, width: W, height: H }
      : { ...defaultVideoSpec(input?.title), durationSec, fps: FPS, width: W, height: H };

  const totalFrames = Math.round(durationSec * FPS);
  const frameMs = Math.round(1000 / FPS);
  const { mimeType, ext } = pickMime();
  const seed = spec.seed ?? Math.floor(Math.random() * 1e9);

  let studio: Studio | null = null;

  try {
    report(0.03);
    const imageCache = await preloadImages(spec);
    report(0.08);

    studio = buildStudio(seed, spec.title || "Zeros");
    report(0.12);

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const stream = canvas.captureStream(FPS);
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 7_000_000 });
    } catch {
      try {
        recorder = new MediaRecorder(stream, { mimeType });
      } catch {
        recorder = new MediaRecorder(stream);
      }
    }

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data?.size) chunks.push(e.data);
    };

    const budget = Math.max((durationSec + 15) * 1000, HARD_TIMEOUT_MS - (Date.now() - started) - 3000);
    const done = new Promise<Blob>((resolve) => {
      const timer = window.setTimeout(() => {
        try {
          recorder.stop();
        } catch {
          /* */
        }
        if (chunks.length) resolve(new Blob(chunks, { type: ext === "mp4" ? "video/mp4" : "video/webm" }));
        else void emergencyBlob(ext, mimeType).then(resolve);
      }, budget);
      const finish = () => {
        window.clearTimeout(timer);
        if (chunks.length) resolve(new Blob(chunks, { type: ext === "mp4" ? "video/mp4" : "video/webm" }));
        else void emergencyBlob(ext, mimeType).then(resolve);
      };
      recorder.onerror = finish;
      recorder.onstop = finish;
    });

    recorder.start(100);
    report(0.14);

    const scenes = spec.scenes || [];

    for (let i = 0; i < totalFrames; i++) {
      if (Date.now() - started > HARD_TIMEOUT_MS - 5000) break;
      const t = i / FPS;
      const tMs = t * 1000;

      // Energy from active scene (peak scenes punch harder)
      let energy = 0.4;
      for (const s of scenes) {
        if (tMs >= s.startMs && tMs <= s.endMs) {
          const label = (s.label || "").toLowerCase();
          energy = /peak|drop|climax/.test(label) ? 1 : /build|rise/.test(label) ? 0.7 : 0.4;
          break;
        }
      }

      try {
        updateStudio(studio, t, energy);
        studio.renderer.render(studio.scene, studio.camera);
        ctx.drawImage(studio.renderer.domElement, 0, 0, W, H);
        drawOverlay(ctx, spec, t, imageCache);
      } catch {
        ctx.fillStyle = "#0a0820";
        ctx.fillRect(0, 0, W, H);
      }

      if (i % 12 === 0) report(0.14 + (i / totalFrames) * 0.82);
      await waitFrame(frameMs);
    }

    report(0.97);
    await waitFrame(200);
    try {
      recorder.stop();
    } catch {
      /* */
    }
    stream.getTracks().forEach((tr) => tr.stop());
    studio.dispose();
    studio = null;

    const blob = await done;
    report(1);
    if (blob.size > 0) return { blob, ext };
    return { blob: await emergencyBlob(ext, mimeType), ext };
  } catch (e) {
    console.warn("[Zeros] peak video failed", e);
    try {
      studio?.dispose();
    } catch {
      /* */
    }
    report(1);
    return { blob: await emergencyBlob(ext, mimeType), ext };
  }
}
