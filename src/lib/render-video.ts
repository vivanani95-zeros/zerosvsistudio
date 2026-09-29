/**
 * Zeros Production Video Engine — pro motion designer (pure Canvas, no Three.js).
 *
 * Pipeline the model follows: Understand → Think like MD → Plan → Spec → Render
 * Engine: sharp kinetic geometry + kinetic type + graphs + particles
 *         + as many AI accent images as scenes need (capped for reliability)
 *         each resized and animated (Ken Burns / float)
 * Silent. Always returns a blob.
 */

import { generateImage } from "@/lib/ai-client";
import type { VideoLayer, VideoSpec } from "@/lib/video-spec";
import { defaultVideoSpec } from "@/lib/video-spec";

const FONT = '"Inter","SF Pro Display","Segoe UI",system-ui,sans-serif';
const W = 1280;
const H = 720;
const FPS = 24;
const MIN_SEC = 40;
const MAX_SEC = 75;
const HARD_TIMEOUT_MS = 11 * 60 * 1000;
const MAX_ACCENT_IMAGES = 8;
const PER_IMAGE_MS = 38_000;

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
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = window.setTimeout(() => resolve(fallback), ms);
    p.then((v) => {
      window.clearTimeout(t);
      resolve(v);
    }).catch(() => {
      window.clearTimeout(t);
      resolve(fallback);
    });
  });
}
const waitFrame = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function parseHue(hex: string, fallback: number): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return fallback;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return fallback;
  const d = max - min;
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return Math.round(h * 360);
}

/* ───────────── Sharp animated geometry ───────────── */

function drawGeometryField(
  ctx: CanvasRenderingContext2D,
  t: number,
  seed: number,
  energy: number,
  bgHue: number,
) {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const g = ctx.createRadialGradient(
    W * (0.5 + Math.sin(t * 0.18) * 0.1),
    H * (0.38 + Math.cos(t * 0.14) * 0.07),
    16,
    W * 0.5,
    H * 0.5,
    W * 0.8,
  );
  g.addColorStop(0, `hsla(${bgHue},55%,24%,1)`);
  g.addColorStop(0.4, `hsla(${bgHue + 28},42%,11%,1)`);
  g.addColorStop(1, "#020108");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const rnd = seeded(seed);

  // Sharp concentric rings with precision ticks
  for (let i = 0; i < 6; i++) {
    const cx = W * (0.2 + rnd() * 0.6);
    const cy = H * (0.2 + rnd() * 0.55);
    const r = 50 + rnd() * 160 + energy * 28;
    const rot = t * (0.35 + rnd() * 0.55) * (i % 2 ? 1 : -1);
    ctx.save();
    ctx.translate(cx + Math.sin(t * 0.45 + i) * 36, cy + Math.cos(t * 0.38 + i) * 26);
    ctx.rotate(rot);
    ctx.strokeStyle = `hsla(${bgHue + i * 22},75%,68%,${0.16 + energy * 0.1})`;
    ctx.lineWidth = 1.25 + energy * 0.8;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (r - 10), Math.sin(a) * (r - 10));
      ctx.lineTo(Math.cos(a) * (r + 7), Math.sin(a) * (r + 7));
      ctx.stroke();
    }
    ctx.restore();
  }

  // Sharp polygons
  for (let i = 0; i < 12; i++) {
    const sides = 3 + (i % 5);
    const baseX = W * (0.08 + rnd() * 0.84);
    const baseY = H * (0.1 + rnd() * 0.8);
    const x = baseX + Math.sin(t * (0.55 + rnd()) + i) * (48 + energy * 30);
    const y = baseY + Math.cos(t * (0.42 + rnd()) + i) * (34 + energy * 22);
    const radius = 16 + rnd() * 48 + energy * 10;
    const rot = t * (0.7 + rnd()) * (i % 2 ? 1 : -1);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(a) * radius;
      const py = Math.sin(a) * radius;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = `hsla(${bgHue + i * 16},70%,58%,${0.09 + energy * 0.07})`;
    ctx.fill();
    ctx.strokeStyle = `hsla(${bgHue + i * 16},85%,72%,${0.28 + energy * 0.12})`;
    ctx.lineWidth = 1.35;
    ctx.stroke();
    ctx.restore();
  }

  // Light blooms
  for (let i = 0; i < 7; i++) {
    const ox = W * (0.12 + rnd() * 0.76) + Math.sin(t * 0.32 + i) * 55;
    const oy = H * (0.18 + rnd() * 0.55) + Math.cos(t * 0.28 + i) * 38;
    const rad = 45 + rnd() * 100;
    const rg = ctx.createRadialGradient(ox, oy, 0, ox, oy, rad);
    rg.addColorStop(0, `hsla(${bgHue + i * 18},85%,68%,${0.16 + energy * 0.07})`);
    rg.addColorStop(1, "transparent");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(ox, oy, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fine sharp dust
  ctx.save();
  for (let i = 0; i < 110; i++) {
    const px = ((rnd() + t * 0.022 * (0.3 + rnd())) % 1) * W;
    const py = ((rnd() - t * 0.016 * (0.25 + rnd()) + 6) % 1) * H;
    ctx.globalAlpha = 0.35 + rnd() * 0.35;
    ctx.fillStyle = `hsla(${bgHue + 35},80%,85%,1)`;
    ctx.fillRect(px, py, 1.2, 1.2);
  }
  ctx.restore();
}

/* ───────────── AI accent images (as many as scenes need) ───────────── */

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img.width > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = url;
    setTimeout(() => resolve(img.complete && img.width > 0 ? img : null), 13_000);
  });
}

async function generateAccentImages(
  title: string,
  sceneCount: number,
  onProgress?: (r: number) => void,
  deadline = Date.now() + HARD_TIMEOUT_MS * 0.4,
): Promise<HTMLImageElement[]> {
  const n = Math.min(MAX_ACCENT_IMAGES, Math.max(3, sceneCount));
  const looks = [
    "wide cinematic establishing atmosphere",
    "medium graphic composition with strong geometry",
    "intimate close mood plate soft light",
    "dynamic energy mid-beat high contrast",
    "hero object studio rim light",
    "abstract data-noir geometric field",
    "warm editorial color still",
    "cold Swiss minimal negative space",
  ];
  const out: HTMLImageElement[] = [];
  for (let i = 0; i < n; i++) {
    if (Date.now() > deadline) break;
    onProgress?.(0.04 + (i / n) * 0.2);
    const look = looks[i % looks.length];
    const prompt = `ultra sharp photoreal cinematic still, ${look}, film for "${title.slice(0, 40)}", anamorphic bokeh, volumetric haze, premium grade, 16:9, NO text NO logo NO watermark NO UI`;
    try {
      const url = await withTimeout(generateImage(prompt), PER_IMAGE_MS, null as unknown as string);
      if (url) {
        const img = await withTimeout(loadImage(url), 11_000, null);
        if (img) out.push(img);
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

function drawAccentPlate(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  tLocal: number,
  alpha: number,
  mode: number,
) {
  if (!img.width || alpha < 0.02) return;
  const zoom = 1.06 + ease("easeInOut", tLocal) * 0.14;
  const panX = Math.sin(mode * 1.4 + tLocal * 1.8) * 0.1;
  const panY = Math.cos(mode * 1.1 + tLocal * 1.4) * 0.07;

  // Full-bleed diffusion-style plate under graphics (not tiny card only)
  const cover = Math.max(W / img.width, H / img.height) * zoom;
  const dw = img.width * cover;
  const dh = img.height * cover;
  const dx = (W - dw) / 2 + panX * (dw - W) * 0.5;
  const dy = (H - dh) / 2 + panY * (dh - H) * 0.5;

  ctx.save();
  ctx.globalAlpha = alpha * 0.42;
  try {
    ctx.drawImage(img, dx, dy, dw, dh);
  } catch {
    /* */
  }
  ctx.restore();

  // Soft color grade wash so geometry stays readable
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "rgba(4,6,16,0.55)";
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/* ───────────── Spec layers ───────────── */

function drawSpecLayers(
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
    const edge = 280;
    if (localMs < edge) sceneA = ease("easeOut", localMs / edge);
    if (localMs > sceneDur - edge) sceneA = Math.min(sceneA, ease("easeIn", (sceneDur - localMs) / edge));
    const sceneEase = ease(scene.ease, clamp01(localMs / sceneDur));

    for (const layer of scene.layers) {
      const la = layerAlpha(layer, localMs, sceneDur) * sceneA;
      if (la < 0.03) continue;
      try {
        if (layer.type === "text") {
          const text = layer.text || "";
          if (!text) continue;
          const x = (layer.x ?? 0.5) * W;
          const y = (layer.y ?? 0.5) * H + Math.sin(tSec * 1.4 + si) * 2.5;
          const fs = layer.fontSize ?? 46;
          const fi = layer.fadeInMs ?? 400;
          const reveal = clamp01(localMs / Math.max(160, fi));
          const chars = Math.ceil(text.length * ease("easeOut", reveal));
          ctx.save();
          ctx.globalAlpha = la;
          ctx.font = `${layer.weight ?? 750} ${fs}px ${FONT}`;
          ctx.textAlign = layer.align || "center";
          ctx.textBaseline = "middle";
          ctx.shadowColor = "rgba(60,100,255,0.55)";
          ctx.shadowBlur = 22;
          ctx.fillStyle = layer.color || "#f6f7ff";
          ctx.fillText(text.slice(0, chars), x, y, W * 0.92);
          ctx.restore();
        } else if (layer.type === "shape") {
          const x = (layer.x ?? 0.5) * W + (sceneEase - 0.5) * 18;
          const y = (layer.y ?? 0.5) * H - (sceneEase - 0.5) * 12;
          const w = Math.max(2, (layer.w ?? 0.25) * W);
          const h = Math.max(2, (layer.h ?? 0.15) * H);
          const breathe = 1 + Math.sin(tSec * 1.5 + si) * 0.028;
          ctx.save();
          ctx.globalAlpha = la;
          ctx.translate(x + w / 2, y + h / 2);
          ctx.scale(breathe, breathe);
          ctx.rotate(((layer.rotate ?? 0) * Math.PI) / 180 + Math.sin(tSec * 0.55) * 0.035);
          ctx.translate(-(x + w / 2), -(y + h / 2));
          const color = layer.color || "rgba(255,255,255,0.1)";
          if (layer.shape === "orb") {
            const cx = x + w / 2;
            const cy = y + h / 2;
            const r = Math.min(w, h) / 2;
            const rg = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
            rg.addColorStop(0, "rgba(230,235,255,0.6)");
            rg.addColorStop(0.4, color);
            rg.addColorStop(1, "transparent");
            ctx.fillStyle = rg;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
          } else if (layer.shape === "circle") {
            ctx.beginPath();
            ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
          } else if (layer.shape === "line") {
            ctx.beginPath();
            ctx.moveTo(x, y + h / 2);
            ctx.lineTo(x + w, y + h / 2);
            ctx.strokeStyle = color;
            ctx.lineWidth = layer.strokeWidth || 2.5;
            ctx.stroke();
          } else {
            const rad =
              layer.shape === "pill" ? h / 2 : layer.shape === "glass" || layer.shape === "rounded" ? 16 : 4;
            rr(ctx, x, y, w, h, rad);
            ctx.fillStyle = color;
            ctx.fill();
            if (layer.stroke) {
              ctx.strokeStyle = layer.stroke;
              ctx.lineWidth = layer.strokeWidth || 1.25;
              ctx.stroke();
            }
            if (layer.shape === "glass") {
              const hg = ctx.createLinearGradient(x, y, x, y + h * 0.4);
              hg.addColorStop(0, "rgba(255,255,255,0.15)");
              hg.addColorStop(1, "transparent");
              ctx.fillStyle = hg;
              ctx.fill();
            }
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
          const grow = ease("easeOut", clamp01(localMs / 720));
          ctx.save();
          ctx.globalAlpha = la;
          rr(ctx, x - 14, y - 14, w + 28, h + 44, 18);
          ctx.fillStyle = "rgba(5,7,16,0.68)";
          ctx.fill();
          ctx.strokeStyle = "rgba(150,180,255,0.3)";
          ctx.lineWidth = 1.2;
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
            ctx.lineWidth = 3.2;
            ctx.lineJoin = "round";
            ctx.stroke();
          } else {
            const gap = 10;
            const bw = (w - gap * (points.length - 1)) / points.length;
            points.forEach((p, i) => {
              const bh = Math.max(3, (p.value / maxV) * h * grow);
              const bx = x + i * (bw + gap);
              const by = y + h - bh;
              const lg = ctx.createLinearGradient(bx, by, bx, y + h);
              lg.addColorStop(0, color);
              lg.addColorStop(1, "rgba(50,70,200,0.3)");
              ctx.fillStyle = lg;
              rr(ctx, bx, by, bw, bh, 8);
              ctx.fill();
              if (p.label) {
                ctx.fillStyle = "rgba(215,225,250,0.9)";
                ctx.font = `500 13px ${FONT}`;
                ctx.textAlign = "center";
                ctx.fillText(p.label, bx + bw / 2, y + h + 18);
              }
            });
          }
          ctx.restore();
        } else if (layer.type === "particles") {
          const rnd = seeded(seed + si * 17);
          const count = layer.count ?? 44;
          ctx.save();
          ctx.globalAlpha = la * 0.75;
          for (let i = 0; i < count; i++) {
            const bx = rnd();
            const by = rnd();
            const drift = tSec * (layer.speed ?? 0.45) * (0.3 + rnd());
            const x = ((bx + Math.sin(drift + i) * 0.04 + 8) % 1) * W;
            const y = ((by - drift * 0.08 + 8) % 1) * H;
            ctx.fillStyle = layer.color || "#8ab4ff";
            ctx.beginPath();
            ctx.arc(x, y, 1.15 + rnd() * 2.1, 0, Math.PI * 2);
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
        /* */
      }
    }
  }
}

function finishFrame(ctx: CanvasRenderingContext2D, tSec: number, seed: number) {
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.12, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalAlpha = 0.04;
  const gseed = Math.floor(tSec * 24) * 9973 + seed;
  for (let i = 0; i < 110; i++) {
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
  const baseHue = parseHue(spec.background || "#0a1020", 230);
  const sceneCount = Math.max(1, (spec.scenes || []).length);

  try {
    report(0.02);
    const imageCache = await preloadImages(spec);
    report(0.04);

    const accents = await generateAccentImages(
      spec.title || "Zeros",
      sceneCount,
      report,
      started + HARD_TIMEOUT_MS * 0.38,
    );
    report(0.22);

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
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 7_500_000 });
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

    const budget = Math.max((durationSec + 12) * 1000, HARD_TIMEOUT_MS - (Date.now() - started) - 3000);
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
    report(0.24);

    const scenes = spec.scenes || [];

    for (let i = 0; i < totalFrames; i++) {
      if (Date.now() - started > HARD_TIMEOUT_MS - 4000) break;
      const t = i / FPS;
      const tMs = t * 1000;

      let energy = 0.35;
      let sceneHue = baseHue;
      let sceneLocal = 0;
      let sceneIdx = 0;
      for (let si = 0; si < scenes.length; si++) {
        const s = scenes[si]!;
        if (tMs >= s.startMs && tMs <= s.endMs) {
          const label = (s.label || "").toLowerCase();
          energy = /peak|drop|climax/.test(label) ? 1 : /build|rise/.test(label) ? 0.72 : 0.4;
          sceneHue = parseHue(s.background || spec.background || "#0a1020", baseHue + si * 14);
          sceneLocal = (tMs - s.startMs) / Math.max(1, s.endMs - s.startMs);
          sceneIdx = si;
          break;
        }
      }

      try {
        drawGeometryField(ctx, t, seed + sceneIdx, energy, sceneHue);
        if (accents.length) {
          const plate = accents[sceneIdx % accents.length]!;
          drawAccentPlate(ctx, plate, sceneLocal, 0.55 + energy * 0.25, sceneIdx);
        }
        drawSpecLayers(ctx, spec, t, imageCache);
        finishFrame(ctx, t, seed);
      } catch {
        ctx.fillStyle = "#0a0820";
        ctx.fillRect(0, 0, W, H);
      }

      if (i % 12 === 0) report(0.24 + (i / totalFrames) * 0.74);
      await waitFrame(frameMs);
    }

    report(0.98);
    await waitFrame(180);
    try {
      recorder.stop();
    } catch {
      /* */
    }
    stream.getTracks().forEach((tr) => tr.stop());

    const blob = await done;
    report(1);
    if (blob.size > 0) return { blob, ext };
    return { blob: await emergencyBlob(ext, mimeType), ext };
  } catch (e) {
    console.warn("[Zeros] production video failed", e);
    report(1);
    return { blob: await emergencyBlob(ext, mimeType), ext };
  }
}
