/**
 * Zeros Video Engine — Opus-style code-to-video (silent).
 * Every frame = seek(t). Unique backgrounds & motion per scene.
 * Duration: 40–120 seconds. Always returns a blob (fallback if needed).
 */

import type { VideoLayer, VideoSpec } from "@/lib/video-spec";
import { defaultVideoSpec } from "@/lib/video-spec";

const FONT = '"Inter","SF Pro Display","Segoe UI",system-ui,sans-serif';
const W = 1280;
const H = 720;
const FPS = 24;
const MIN_SEC = 40;
const MAX_SEC = 120;
const HARD_TIMEOUT_MS = 12 * 60 * 1000; // room for 2min real-time encode

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
    case "easeInOut":
    default:
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }
}

function layerAlpha(layer: VideoLayer, localMs: number, sceneDur: number): number {
  const fi = "fadeInMs" in layer && typeof layer.fadeInMs === "number" ? layer.fadeInMs : 350;
  const fo = "fadeOutMs" in layer && typeof layer.fadeOutMs === "number" ? layer.fadeOutMs : 280;
  let a = 1;
  if (fi > 0 && localMs < fi) a = Math.min(a, ease("easeOut", localMs / fi));
  if (fo > 0 && localMs > sceneDur - fo) a = Math.min(a, ease("easeIn", (sceneDur - localMs) / fo));
  return clamp01(a);
}

function seeded(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** Safe rounded rect — some browsers lack roundRect */
function rr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
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

function drawBackground(
  ctx: CanvasRenderingContext2D,
  bg: string,
  t: number,
  seed: number,
  variant: number,
) {
  const hue = parseHue(bg, 230 + (variant % 7) * 18);
  const modes = variant % 4;

  if (modes === 0) {
    // Radial depth
    const g = ctx.createRadialGradient(W * 0.45, H * 0.35, 10, W * 0.5, H * 0.55, W * 0.8);
    g.addColorStop(0, `hsla(${hue},45%,28%,1)`);
    g.addColorStop(0.5, bg || "#0a0820");
    g.addColorStop(1, "#020108");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (modes === 1) {
    // Diagonal wash
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, `hsla(${hue},40%,18%,1)`);
    g.addColorStop(0.5, bg || "#0a0820");
    g.addColorStop(1, `hsla(${hue + 40},35%,8%,1)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (modes === 2) {
    // Split vertical
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, `hsla(${hue - 20},40%,12%,1)`);
    g.addColorStop(0.5, bg || "#0a0820");
    g.addColorStop(1, `hsla(${hue + 30},40%,14%,1)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else {
    // Soft vignette fill
    ctx.fillStyle = bg || "#0a0820";
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W * 0.5, H * 0.4, 30, W * 0.5, H * 0.5, W * 0.7);
    g.addColorStop(0, `hsla(${hue},50%,30%,0.35)`);
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Unique drifting lights per variant
  const rnd = seeded(seed + variant * 97);
  const count = 3 + (variant % 3);
  for (let i = 0; i < count; i++) {
    const px = W * (0.1 + rnd() * 0.8);
    const py = H * (0.15 + rnd() * 0.6);
    const phase = t * (0.12 + rnd() * 0.25) + i + variant;
    const ox = px + Math.sin(phase) * (30 + rnd() * 40);
    const oy = py + Math.cos(phase * 0.85) * (20 + rnd() * 30);
    const r = 60 + rnd() * 120;
    const rg = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
    rg.addColorStop(0, `hsla(${hue + i * 20},70%,60%,0.12)`);
    rg.addColorStop(1, "transparent");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(ox, oy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  count: number,
  color: string,
  speed: number,
  t: number,
  seed: number,
  alpha: number,
) {
  const rnd = seeded(seed + 99);
  ctx.save();
  ctx.globalAlpha = alpha * 0.7;
  for (let i = 0; i < count; i++) {
    const baseX = rnd();
    const baseY = rnd();
    const size = 1.2 + rnd() * 2.4;
    const drift = t * speed * (0.3 + rnd());
    const x = ((baseX + Math.sin(drift + i) * 0.04 + 10) % 1) * W;
    const y = ((baseY - drift * 0.08 + 10) % 1) * H;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  layer: Extract<VideoLayer, { type: "shape" }>,
  alpha: number,
  t: number,
  animStyle: number,
) {
  const x = (layer.x ?? 0.5) * W;
  const y = (layer.y ?? 0.5) * H;
  const w = Math.max(2, (layer.w ?? 0.3) * W);
  const h = Math.max(2, (layer.h ?? 0.2) * H);
  const rot = ((layer.rotate ?? 0) * Math.PI) / 180;

  // Unique motion signature per anim style
  let breathe = 1;
  let spin = 0;
  let bobX = 0;
  let bobY = 0;
  if (animStyle % 4 === 0) {
    breathe = 1 + Math.sin(t * 1.2) * 0.025;
  } else if (animStyle % 4 === 1) {
    spin = Math.sin(t * 0.6) * 0.08;
    bobY = Math.sin(t * 1.5) * 6;
  } else if (animStyle % 4 === 2) {
    bobX = Math.sin(t * 1.1) * 8;
    breathe = 1 + Math.cos(t * 0.9) * 0.02;
  } else {
    spin = t * 0.15;
    bobY = Math.cos(t * 0.8) * 4;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x + w / 2 + bobX, y + h / 2 + bobY);
  ctx.rotate(rot + spin);
  ctx.scale(breathe, breathe);
  ctx.translate(-(x + w / 2), -(y + h / 2));

  const color = layer.color || "rgba(255,255,255,0.1)";

  try {
    if (layer.shape === "orb") {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = Math.min(w, h) / 2;
      const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.05, cx, cy, r);
      g.addColorStop(0, "rgba(200,210,255,0.55)");
      g.addColorStop(0.4, color);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (layer.shape === "glass") {
      rr(ctx, x, y, w, h, 18);
      ctx.fillStyle = color;
      ctx.fill();
      if (layer.stroke) {
        ctx.strokeStyle = layer.stroke;
        ctx.lineWidth = layer.strokeWidth || 1;
        ctx.stroke();
      }
      const hg = ctx.createLinearGradient(x, y, x, y + h * 0.4);
      hg.addColorStop(0, "rgba(255,255,255,0.12)");
      hg.addColorStop(1, "transparent");
      ctx.fillStyle = hg;
      ctx.fill();
    } else if (layer.shape === "circle") {
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    } else if (layer.shape === "pill") {
      rr(ctx, x, y, w, h, h / 2);
      ctx.fillStyle = color;
      ctx.fill();
    } else if (layer.shape === "line") {
      ctx.beginPath();
      ctx.moveTo(x, y + h / 2);
      ctx.lineTo(x + w, y + h / 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, layer.strokeWidth || 2);
      ctx.stroke();
    } else {
      rr(ctx, x, y, w, h, layer.shape === "rounded" ? 16 : 4);
      ctx.fillStyle = color;
      ctx.fill();
      if (layer.stroke) {
        ctx.strokeStyle = layer.stroke;
        ctx.lineWidth = layer.strokeWidth || 1;
        ctx.stroke();
      }
    }
  } catch {
    /* never break a frame */
  }
  ctx.restore();
}

function drawText(
  ctx: CanvasRenderingContext2D,
  layer: Extract<VideoLayer, { type: "text" }>,
  alpha: number,
  localMs: number,
) {
  const text = layer.text || "";
  if (!text) return;
  const x = (layer.x ?? 0.5) * W;
  const y = (layer.y ?? 0.5) * H;
  const fs = layer.fontSize ?? 42;
  const weight = layer.weight ?? 650;
  const align = layer.align || "center";
  const fi = layer.fadeInMs ?? 400;
  const reveal = clamp01(localMs / Math.max(200, fi));
  const chars = Math.ceil(text.length * ease("easeOut", reveal));
  const shown = text.slice(0, chars);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${weight} ${fs}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = layer.color || "#f4f5ff";
  try {
    ctx.fillText(shown, x, y, W * 0.9);
  } catch {
    /* */
  }
  ctx.restore();
}

function drawGraph(
  ctx: CanvasRenderingContext2D,
  layer: Extract<VideoLayer, { type: "graph" }>,
  alpha: number,
  localMs: number,
) {
  const points = layer.points || [];
  if (!points.length) return;
  const x = (layer.x ?? 0.12) * W;
  const y = (layer.y ?? 0.25) * H;
  const w = (layer.w ?? 0.76) * W;
  const h = (layer.h ?? 0.4) * H;
  const color = layer.color || "#6ee7ff";
  const maxV = Math.max(...points.map((p) => p.value), 1);
  const grow = ease("easeOut", clamp01(localMs / 900));

  ctx.save();
  ctx.globalAlpha = alpha;
  try {
    rr(ctx, x - 12, y - 12, w + 24, h + 40, 16);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fill();
    ctx.strokeStyle = "rgba(160,180,255,0.15)";
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
      const gap = 12;
      const bw = (w - gap * (points.length - 1)) / points.length;
      points.forEach((p, i) => {
        const bh = Math.max(2, (p.value / maxV) * h * grow);
        const bx = x + i * (bw + gap);
        const by = y + h - bh;
        const g = ctx.createLinearGradient(bx, by, bx, y + h);
        g.addColorStop(0, color);
        g.addColorStop(1, "rgba(80,100,255,0.25)");
        ctx.fillStyle = g;
        rr(ctx, bx, by, bw, bh, 8);
        ctx.fill();
        if (p.label) {
          ctx.fillStyle = "rgba(200,210,240,0.75)";
          ctx.font = `500 13px ${FONT}`;
          ctx.textAlign = "center";
          ctx.fillText(p.label, bx + bw / 2, y + h + 18);
        }
      });
    }
  } catch {
    /* */
  }
  ctx.restore();
}

function drawImageLayer(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | undefined,
  layer: Extract<VideoLayer, { type: "image" | "logo" }>,
  alpha: number,
) {
  if (!img?.width) return;
  const x = (layer.x ?? 0.5) * W;
  const y = (layer.y ?? 0.5) * H;
  const w = (layer.w ?? 0.28) * W;
  const h = (layer.h ?? 0.2) * H;
  ctx.save();
  ctx.globalAlpha = alpha;
  try {
    const scale = Math.min(w / img.width, h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, x - dw / 2, y - dh / 2, dw, dh);
  } catch {
    /* */
  }
  ctx.restore();
}

function vignette(ctx: CanvasRenderingContext2D) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.9);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function grain(ctx: CanvasRenderingContext2D, seed: number) {
  ctx.save();
  ctx.globalAlpha = 0.04;
  for (let i = 0; i < 90; i++) {
    const x = ((seed * 1103515245 + i * 12345) >>> 0) % W;
    const y = ((seed * 214013 + i * 76543) >>> 0) % H;
    ctx.fillStyle = i % 2 ? "#fff" : "#000";
    ctx.fillRect(x, y, 1 + (i % 2), 1 + (i % 2));
  }
  ctx.restore();
}

function letterbox(ctx: CanvasRenderingContext2D) {
  const bar = Math.round(H * 0.06);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, bar);
  ctx.fillRect(0, H - bar, W, bar);
}

function seek(
  ctx: CanvasRenderingContext2D,
  spec: VideoSpec,
  tSec: number,
  imageCache: Map<string, HTMLImageElement>,
) {
  const tMs = tSec * 1000;
  const seed = spec.seed ?? 42;
  const scenes = spec.scenes || [];

  // Pick dominant scene for background uniqueness
  let activeBg = spec.background || "#07060f";
  let variant = 0;
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i]!;
    if (tMs >= s.startMs && tMs <= s.endMs) {
      activeBg = s.background || activeBg;
      variant = i;
      break;
    }
  }

  drawBackground(ctx, activeBg, tSec, seed, variant);

  for (let si = 0; si < scenes.length; si++) {
    const scene = scenes[si]!;
    if (tMs < scene.startMs - 50 || tMs > scene.endMs + 50) continue;
    const sceneDur = Math.max(1, scene.endMs - scene.startMs);
    const localMs = tMs - scene.startMs;
    const sceneProgress = clamp01(localMs / sceneDur);
    const sceneEase = ease(scene.ease, sceneProgress);

    let sceneA = 1;
    const edge = 320;
    if (localMs < edge) sceneA = ease("easeOut", localMs / edge);
    if (localMs > sceneDur - edge) sceneA = Math.min(sceneA, ease("easeIn", (sceneDur - localMs) / edge));

    for (const layer of scene.layers) {
      const la = layerAlpha(layer, localMs, sceneDur) * sceneA;
      if (la < 0.02) continue;

      try {
        if (layer.type === "gradient") {
          const ang = ((layer.angle ?? 160) * Math.PI) / 180;
          const g = ctx.createLinearGradient(
            W / 2 - Math.cos(ang) * W,
            H / 2 - Math.sin(ang) * H,
            W / 2 + Math.cos(ang) * W,
            H / 2 + Math.sin(ang) * H,
          );
          g.addColorStop(0, layer.from || activeBg);
          g.addColorStop(1, layer.to || "#120e28");
          ctx.save();
          ctx.globalAlpha = la * 0.85;
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, W, H);
          ctx.restore();
        } else if (layer.type === "particles") {
          drawParticles(
            ctx,
            layer.count ?? 32,
            layer.color || "#7b93ff",
            layer.speed ?? 0.45,
            tSec,
            seed + si * 17,
            la,
          );
        } else if (layer.type === "shape") {
          const drifted = {
            ...layer,
            x: (layer.x ?? 0.5) + (sceneEase - 0.5) * 0.025,
            y: (layer.y ?? 0.5) - (sceneEase - 0.5) * 0.02,
          };
          drawShape(ctx, drifted, la, tSec, si + seed);
        } else if (layer.type === "text") {
          drawText(ctx, layer, la, localMs);
        } else if (layer.type === "graph") {
          drawGraph(ctx, layer, la, localMs);
        } else if (layer.type === "image" || layer.type === "logo") {
          drawImageLayer(ctx, imageCache.get(layer.src), layer, la);
        }
      } catch {
        /* skip broken layer */
      }
    }
  }

  vignette(ctx);
  grain(ctx, Math.floor(tSec * 24) * 9973 + seed);
  letterbox(ctx);
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
          setTimeout(resolve, 4000);
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

  const rawDur = input?.durationSec ?? 50;
  const durationSec = Math.min(MAX_SEC, Math.max(MIN_SEC, rawDur));

  const spec: VideoSpec =
    input?.scenes?.length > 0
      ? { ...input, durationSec, fps: FPS, width: W, height: H }
      : { ...defaultVideoSpec(input?.title), durationSec, fps: FPS, width: W, height: H };

  const totalFrames = Math.round(durationSec * FPS);
  const frameMs = Math.round(1000 / FPS);
  const { mimeType, ext } = pickMime();

  try {
    report(0.04);
    const imageCache = await preloadImages(spec);
    report(0.1);

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
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
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

    const budget = Math.max(
      (durationSec + 15) * 1000,
      HARD_TIMEOUT_MS - (Date.now() - started) - 3000,
    );
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
    report(0.12);

    for (let i = 0; i < totalFrames; i++) {
      if (Date.now() - started > HARD_TIMEOUT_MS - 5000) break;
      try {
        seek(ctx, spec, i / FPS, imageCache);
      } catch {
        ctx.fillStyle = "#0a0820";
        ctx.fillRect(0, 0, W, H);
      }
      if (i % 12 === 0) report(0.12 + (i / totalFrames) * 0.85);
      await waitFrame(frameMs);
    }

    report(0.98);
    await waitFrame(200);
    try {
      recorder.stop();
    } catch {
      /* */
    }
    stream.getTracks().forEach((t) => t.stop());

    const blob = await done;
    report(1);
    if (blob.size > 0) return { blob, ext };
    return { blob: await emergencyBlob(ext, mimeType), ext };
  } catch (e) {
    console.warn("[Zeros] video render failed", e);
    report(1);
    return { blob: await emergencyBlob(ext, mimeType), ext };
  }
}
