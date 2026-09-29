/**
 * Zeros Hyper-Peak Video Engine — pure Canvas 2D (NO Three.js).
 *
 * Every pixel is code: math geometry, kinetic type, particles, graphs,
 * morphing shapes, camera-feel pans. Optional AI accent images (2–4)
 * are generated, resized, and Ken-Burns animated into the film.
 *
 * Silent. Always returns a blob. Never depends on WebGL.
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
const ACCENT_IMAGES = 3;
const PER_IMAGE_MS = 40_000;

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

/* ───────────── Math geometry field (always-on kinetic energy) ───────────── */

function drawGeometryField(
  ctx: CanvasRenderingContext2D,
  t: number,
  seed: number,
  energy: number,
  bgHue: number,
) {
  // Living gradient base
  const g = ctx.createRadialGradient(
    W * (0.5 + Math.sin(t * 0.2) * 0.08),
    H * (0.4 + Math.cos(t * 0.15) * 0.06),
    20,
    W * 0.5,
    H * 0.5,
    W * 0.75,
  );
  g.addColorStop(0, `hsla(${bgHue},50%,22%,1)`);
  g.addColorStop(0.45, `hsla(${bgHue + 30},40%,10%,1)`);
  g.addColorStop(1, "#030208");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const rnd = seeded(seed);

  // Orbiting geometric rings
  for (let i = 0; i < 5; i++) {
    const cx = W * (0.25 + rnd() * 0.5);
    const cy = H * (0.25 + rnd() * 0.5);
    const r = 60 + rnd() * 140 + energy * 20;
    const rot = t * (0.3 + rnd() * 0.5) * (i % 2 ? 1 : -1);
    ctx.save();
    ctx.translate(cx + Math.sin(t * 0.4 + i) * 30, cy + Math.cos(t * 0.35 + i) * 22);
    ctx.rotate(rot);
    ctx.strokeStyle = `hsla(${bgHue + i * 25},70%,65%,${0.12 + energy * 0.08})`;
    ctx.lineWidth = 1.5 + energy;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    // ring ticks
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (r - 8), Math.sin(a) * (r - 8));
      ctx.lineTo(Math.cos(a) * (r + 6), Math.sin(a) * (r + 6));
      ctx.stroke();
    }
    ctx.restore();
  }

  // Floating polygons (math motion)
  for (let i = 0; i < 10; i++) {
    const sides = 3 + (i % 4);
    const baseX = W * (0.1 + rnd() * 0.8);
    const baseY = H * (0.1 + rnd() * 0.8);
    const x = baseX + Math.sin(t * (0.5 + rnd()) + i) * (40 + energy * 25);
    const y = baseY + Math.cos(t * (0.4 + rnd()) + i) * (30 + energy * 18);
    const radius = 18 + rnd() * 40 + energy * 8;
    const rot = t * (0.6 + rnd()) * (i % 2 ? 1 : -1);
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
    ctx.fillStyle = `hsla(${bgHue + i * 18},65%,55%,${0.08 + energy * 0.06})`;
    ctx.fill();
    ctx.strokeStyle = `hsla(${bgHue + i * 18},80%,70%,${0.2 + energy * 0.1})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }

  // Soft light orbs
  for (let i = 0; i < 6; i++) {
    const ox = W * (0.15 + rnd() * 0.7) + Math.sin(t * 0.3 + i) * 50;
    const oy = H * (0.2 + rnd() * 0.5) + Math.cos(t * 0.25 + i) * 35;
    const rr2 = 50 + rnd() * 90;
    const rg = ctx.createRadialGradient(ox, oy, 0, ox, oy, rr2);
    rg.addColorStop(0, `hsla(${bgHue + i * 20},80%,65%,${0.14 + energy * 0.06})`);
    rg.addColorStop(1, "transparent");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(ox, oy, rr2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fine particle dust
  ctx.save();
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 80; i++) {
    const px = ((rnd() + t * 0.02 * (0.3 + rnd())) % 1) * W;
    const py = ((rnd() - t * 0.015 * (0.2 + rnd()) + 5) % 1) * H;
    ctx.fillStyle = `hsla(${bgHue + 40},70%,80%,0.5)`;
    ctx.fillRect(px, py, 1.5, 1.5);
  }
  ctx.restore();
}

/* ───────────── Accent AI images ───────────── */

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img.width > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = url;
    setTimeout(() => resolve(img.complete && img.width > 0 ? img : null), 14_000);
  });
}

async function generateAccentImages(
  title: string,
  onProgress?: (r: number) => void,
): Promise<HTMLImageElement[]> {
  const prompts = [
    `cinematic abstract still for motion graphics film "${title}", geometric light, teal amber grade, no text no logo no watermark, 16:9`,
    `premium studio product atmosphere still for "${title}", soft volumetric light, shallow depth, no text no watermark, 16:9`,
    `bold graphic design background plate for "${title}", high contrast shapes, modern, no text no watermark, 16:9`,
  ];
  const out: HTMLImageElement[] = [];
  for (let i = 0; i < ACCENT_IMAGES; i++) {
    onProgress?.(0.05 + (i / ACCENT_IMAGES) * 0.12);
    try {
      const url = await withTimeout(
        generateImage(prompts[i]!),
        PER_IMAGE_MS,
        null as unknown as string,
      );
      if (url) {
        const img = await withTimeout(loadImage(url), 12_000, null);
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
  slot: number,
) {
  if (!img.width || alpha < 0.02) return;
  // Ken Burns + slight float
  const zoom = 1.08 + ease("easeInOut", tLocal) * 0.12;
  const panX = Math.sin(slot * 1.7 + tLocal * 2) * 0.08;
  const panY = Math.cos(slot * 1.3 + tLocal * 1.5) * 0.06;
  const scale = Math.max(W / img.width, H / img.height) * zoom * 0.55;
  const dw = img.width * scale;
  const dh = img.height * scale;
  // Position in third of frame by slot
  const cx = W * (0.25 + (slot % 3) * 0.25);
  const cy = H * (0.35 + (slot % 2) * 0.2);
  const dx = cx - dw / 2 + panX * dw;
  const dy = cy - dh / 2 + panY * dh;

  ctx.save();
  ctx.globalAlpha = alpha * 0.55;
  // Soft mask card
  rr(ctx, dx - 8, dy - 8, dw + 16, dh + 16, 16);
  ctx.clip();
  try {
    ctx.drawImage(img, dx, dy, dw, dh);
  } catch {
    /* */
  }
  ctx.restore();

  // Glass frame
  ctx.save();
  ctx.globalAlpha = alpha * 0.7;
  rr(ctx, dx - 8, dy - 8, dw + 16, dh + 16, 16);
  ctx.strokeStyle = "rgba(180,200,255,0.25)";
  ctx.lineWidth = 1;
  ctx.stroke();
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
          const y = (layer.y ?? 0.5) * H + Math.sin(tSec * 1.5 + si) * 3;
          const fs = layer.fontSize ?? 44;
          const fi = layer.fadeInMs ?? 400;
          const reveal = clamp01(localMs / Math.max(180, fi));
          // Per-letter kinetic
          const chars = Math.ceil(text.length * ease("easeOut", reveal));
          ctx.save();
          ctx.globalAlpha = la;
          ctx.font = `${layer.weight ?? 750} ${fs}px ${FONT}`;
          ctx.textAlign = layer.align || "center";
          ctx.textBaseline = "middle";
          ctx.shadowColor = "rgba(70,110,255,0.5)";
          ctx.shadowBlur = 20;
          ctx.fillStyle = layer.color || "#f4f6ff";
          // slight tracking animation
          const shown = text.slice(0, chars);
          ctx.fillText(shown, x, y, W * 0.92);
          ctx.restore();
        } else if (layer.type === "shape") {
          const x = (layer.x ?? 0.5) * W + (sceneEase - 0.5) * 20;
          const y = (layer.y ?? 0.5) * H - (sceneEase - 0.5) * 12;
          const w = Math.max(2, (layer.w ?? 0.25) * W);
          const h = Math.max(2, (layer.h ?? 0.15) * H);
          const breathe = 1 + Math.sin(tSec * 1.4 + si) * 0.03;
          ctx.save();
          ctx.globalAlpha = la;
          ctx.translate(x + w / 2, y + h / 2);
          ctx.scale(breathe, breathe);
          ctx.rotate(((layer.rotate ?? 0) * Math.PI) / 180 + Math.sin(tSec * 0.5) * 0.04);
          ctx.translate(-(x + w / 2), -(y + h / 2));
          const color = layer.color || "rgba(255,255,255,0.1)";
          if (layer.shape === "orb") {
            const cx = x + w / 2;
            const cy = y + h / 2;
            const r = Math.min(w, h) / 2;
            const rg = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
            rg.addColorStop(0, "rgba(220,230,255,0.55)");
            rg.addColorStop(0.45, color);
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
            ctx.lineWidth = layer.strokeWidth || 2;
            ctx.stroke();
          } else {
            const rad = layer.shape === "pill" ? h / 2 : layer.shape === "glass" || layer.shape === "rounded" ? 16 : 4;
            rr(ctx, x, y, w, h, rad);
            ctx.fillStyle = color;
            ctx.fill();
            if (layer.stroke) {
              ctx.strokeStyle = layer.stroke;
              ctx.lineWidth = layer.strokeWidth || 1;
              ctx.stroke();
            }
            if (layer.shape === "glass") {
              const hg = ctx.createLinearGradient(x, y, x, y + h * 0.4);
              hg.addColorStop(0, "rgba(255,255,255,0.14)");
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
          const grow = ease("easeOut", clamp01(localMs / 750));
          ctx.save();
          ctx.globalAlpha = la;
          rr(ctx, x - 14, y - 14, w + 28, h + 44, 18);
          ctx.fillStyle = "rgba(6,8,18,0.62)";
          ctx.fill();
          ctx.strokeStyle = "rgba(140,170,255,0.28)";
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
              lg.addColorStop(1, "rgba(50,70,200,0.28)");
              ctx.fillStyle = lg;
              rr(ctx, bx, by, bw, bh, 8);
              ctx.fill();
              if (p.label) {
                ctx.fillStyle = "rgba(210,220,245,0.85)";
                ctx.font = `500 13px ${FONT}`;
                ctx.textAlign = "center";
                ctx.fillText(p.label, bx + bw / 2, y + h + 18);
              }
            });
          }
          ctx.restore();
        } else if (layer.type === "particles") {
          const rnd = seeded(seed + si * 17);
          const count = layer.count ?? 40;
          ctx.save();
          ctx.globalAlpha = la * 0.7;
          for (let i = 0; i < count; i++) {
            const bx = rnd();
            const by = rnd();
            const drift = tSec * (layer.speed ?? 0.45) * (0.3 + rnd());
            const x = ((bx + Math.sin(drift + i) * 0.04 + 8) % 1) * W;
            const y = ((by - drift * 0.08 + 8) % 1) * H;
            ctx.fillStyle = layer.color || "#8ab4ff";
            ctx.beginPath();
            ctx.arc(x, y, 1.2 + rnd() * 2.2, 0, Math.PI * 2);
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
        /* never break frame */
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

  try {
    report(0.02);
    const imageCache = await preloadImages(spec);
    report(0.05);

    // Optional AI accent plates (upgrade quality — never block forever)
    const accents = await generateAccentImages(spec.title || "Zeros", report);
    report(0.18);

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
    report(0.2);

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
          energy = /peak|drop|climax/.test(label) ? 1 : /build|rise/.test(label) ? 0.7 : 0.4;
          sceneHue = parseHue(s.background || spec.background || "#0a1020", baseHue + si * 15);
          sceneLocal = (tMs - s.startMs) / Math.max(1, s.endMs - s.startMs);
          sceneIdx = si;
          break;
        }
      }

      try {
        // 1) Math geometry kinetic field
        drawGeometryField(ctx, t, seed + sceneIdx, energy, sceneHue);

        // 2) AI accent plates (animated)
        if (accents.length) {
          const plate = accents[sceneIdx % accents.length]!;
          const a = 0.35 + energy * 0.25;
          drawAccentPlate(ctx, plate, sceneLocal, a, sceneIdx);
        }

        // 3) Spec layers (type, shapes, graphs, particles)
        drawSpecLayers(ctx, spec, t, imageCache);

        // 4) Finish
        finishFrame(ctx, t, seed);
      } catch {
        ctx.fillStyle = "#0a0820";
        ctx.fillRect(0, 0, W, H);
      }

      if (i % 12 === 0) report(0.2 + (i / totalFrames) * 0.78);
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
    console.warn("[Zeros] hyper-peak video failed", e);
    report(1);
    return { blob: await emergencyBlob(ext, mimeType), ext };
  }
}
