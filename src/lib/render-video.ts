/**
 * Zeros Video Engine — Opus 5.5 style code-to-video (silent).
 *
 * Research: Claude Opus 5.5 does NOT call a video-diffusion model.
 * It writes JavaScript where every frame is a pure function of time:
 *   draw(ctx, t) → canvas → MediaRecorder → MP4/WebM
 * Shapes, kinetic type, graphs, particles, glass, orbs — all code-drawn.
 *
 * This engine does the same: VideoSpec layers → seek(t) → paint frame.
 * No AI stills stitched together. No slideshow.
 */

import type { VideoLayer, VideoScene, VideoSpec } from "@/lib/video-spec";
import { defaultVideoSpec } from "@/lib/video-spec";

const FONT = '"Inter","SF Pro Display","Segoe UI",system-ui,sans-serif';
const W = 1280;
const H = 720;
const FPS = 24;
const MAX_SEC = 18;
const HARD_TIMEOUT_MS = 10 * 60 * 1000;

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

function layerAlpha(
  layer: VideoLayer,
  localMs: number,
  sceneDur: number,
): number {
  const fi = "fadeInMs" in layer && typeof layer.fadeInMs === "number" ? layer.fadeInMs : 350;
  const fo = "fadeOutMs" in layer && typeof layer.fadeOutMs === "number" ? layer.fadeOutMs : 280;
  let a = 1;
  if (fi > 0 && localMs < fi) a = Math.min(a, ease("easeOut", localMs / fi));
  if (fo > 0 && localMs > sceneDur - fo) a = Math.min(a, ease("easeIn", (sceneDur - localMs) / fo));
  return clamp01(a);
}

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function drawBackground(ctx: CanvasRenderingContext2D, bg: string, t: number, seed: number) {
  // Deep cinematic base
  const g = ctx.createRadialGradient(W * 0.5, H * 0.4, 20, W * 0.5, H * 0.5, W * 0.75);
  g.addColorStop(0, "#1a1435");
  g.addColorStop(0.45, bg || "#0a0820");
  g.addColorStop(1, "#030208");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Slow drifting atmosphere orbs (purposeful, not AI-slop spam)
  const rnd = seeded(seed);
  for (let i = 0; i < 4; i++) {
    const px = W * (0.15 + rnd() * 0.7);
    const py = H * (0.2 + rnd() * 0.5);
    const phase = t * (0.15 + rnd() * 0.2) + i;
    const ox = px + Math.sin(phase) * 40;
    const oy = py + Math.cos(phase * 0.8) * 28;
    const r = 80 + rnd() * 100;
    const rg = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
    const hue = 220 + i * 25;
    rg.addColorStop(0, `hsla(${hue},70%,55%,0.14)`);
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
    const x = ((baseX + Math.sin(drift + i) * 0.04) % 1) * W;
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
) {
  const x = (layer.x ?? 0.5) * W;
  const y = (layer.y ?? 0.5) * H;
  const w = (layer.w ?? 0.3) * W;
  const h = (layer.h ?? 0.2) * H;
  const rot = ((layer.rotate ?? 0) * Math.PI) / 180;
  // Subtle life: slow breathe
  const breathe = 1 + Math.sin(t * 1.2) * 0.02;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(rot);
  ctx.scale(breathe, breathe);
  ctx.translate(-(x + w / 2), -(y + h / 2));

  const color = layer.color || "rgba(255,255,255,0.1)";

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
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 18);
    ctx.fillStyle = color;
    ctx.fill();
    if (layer.stroke) {
      ctx.strokeStyle = layer.stroke;
      ctx.lineWidth = layer.strokeWidth || 1;
      ctx.stroke();
    }
    // glass highlight
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
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
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
    // rect / rounded
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, layer.shape === "rounded" ? 16 : 4);
    ctx.fillStyle = color;
    ctx.fill();
    if (layer.stroke) {
      ctx.strokeStyle = layer.stroke;
      ctx.lineWidth = layer.strokeWidth || 1;
      ctx.stroke();
    }
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

  // Per-letter kinetic reveal
  const reveal = clamp01(localMs / Math.max(200, fi));
  const chars = Math.ceil(text.length * ease("easeOut", reveal));
  const shown = text.slice(0, chars);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${weight} ${fs}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  // soft shadow for premium type
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = layer.color || "#f4f5ff";
  ctx.fillText(shown, x, y, W * 0.9);
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

  // panel
  ctx.beginPath();
  ctx.roundRect(x - 12, y - 12, w + 24, h + 40, 16);
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
      const bh = (p.value / maxV) * h * grow;
      const bx = x + i * (bw + gap);
      const by = y + h - bh;
      const g = ctx.createLinearGradient(bx, by, bx, y + h);
      g.addColorStop(0, color);
      g.addColorStop(1, "rgba(80,100,255,0.25)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 8);
      ctx.fill();
      if (p.label) {
        ctx.fillStyle = "rgba(200,210,240,0.75)";
        ctx.font = `500 13px ${FONT}`;
        ctx.textAlign = "center";
        ctx.fillText(p.label, bx + bw / 2, y + h + 18);
      }
    });
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
  const scale = Math.min(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x - dw / 2, y - dh / 2, dw, dh);
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

/** Opus-style: pure function of time — draw everything for this moment */
function seek(
  ctx: CanvasRenderingContext2D,
  spec: VideoSpec,
  tSec: number,
  imageCache: Map<string, HTMLImageElement>,
) {
  const tMs = tSec * 1000;
  const seed = spec.seed ?? 42;
  const bg = spec.background || "#07060f";

  drawBackground(ctx, bg, tSec, seed);

  // Active scenes at this time (allow overlap for soft transitions)
  const scenes = spec.scenes || [];
  for (const scene of scenes) {
    if (tMs < scene.startMs - 50 || tMs > scene.endMs + 50) continue;
    const sceneDur = Math.max(1, scene.endMs - scene.startMs);
    const localMs = tMs - scene.startMs;
    const sceneProgress = clamp01(localMs / sceneDur);
    const sceneEase = ease(scene.ease, sceneProgress);

    // Scene enter/exit envelope
    let sceneA = 1;
    const edge = 280;
    if (localMs < edge) sceneA = ease("easeOut", localMs / edge);
    if (localMs > sceneDur - edge) sceneA = Math.min(sceneA, ease("easeIn", (sceneDur - localMs) / edge));

    for (const layer of scene.layers) {
      const la = layerAlpha(layer, localMs, sceneDur) * sceneA;
      if (la < 0.02) continue;

      if (layer.type === "gradient") {
        const ang = ((layer.angle ?? 160) * Math.PI) / 180;
        const g = ctx.createLinearGradient(
          W / 2 - Math.cos(ang) * W,
          H / 2 - Math.sin(ang) * H,
          W / 2 + Math.cos(ang) * W,
          H / 2 + Math.sin(ang) * H,
        );
        g.addColorStop(0, layer.from || bg);
        g.addColorStop(1, layer.to || "#120e28");
        ctx.save();
        ctx.globalAlpha = la * 0.85;
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      } else if (layer.type === "particles") {
        drawParticles(ctx, layer.count ?? 32, layer.color || "#7b93ff", layer.speed ?? 0.45, tSec, seed, la);
      } else if (layer.type === "shape") {
        // Drift shapes slightly with scene ease
        const drifted = {
          ...layer,
          x: (layer.x ?? 0.5) + (sceneEase - 0.5) * 0.02,
          y: (layer.y ?? 0.5) - (sceneEase - 0.5) * 0.015,
        };
        drawShape(ctx, drifted, la, tSec);
      } else if (layer.type === "text") {
        drawText(ctx, layer, la, localMs);
      } else if (layer.type === "graph") {
        drawGraph(ctx, layer, la, localMs);
      } else if (layer.type === "image" || layer.type === "logo") {
        drawImageLayer(ctx, imageCache.get(layer.src), layer, la);
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

  // Normalize: always have usable scenes
  const spec: VideoSpec =
    input?.scenes?.length > 0
      ? {
          ...input,
          durationSec: Math.min(MAX_SEC, Math.max(8, input.durationSec || 16)),
          fps: FPS,
          width: W,
          height: H,
        }
      : { ...defaultVideoSpec(input?.title), durationSec: 16, fps: FPS, width: W, height: H };

  const durationSec = Math.min(MAX_SEC, Math.max(8, spec.durationSec || 16));
  const totalFrames = Math.round(durationSec * FPS);
  const frameMs = Math.round(1000 / FPS);
  const { mimeType, ext } = pickMime();

  try {
    report(0.05);
    const imageCache = await preloadImages(spec);
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

    const budget = Math.max((durationSec + 10) * 1000, HARD_TIMEOUT_MS - (Date.now() - started) - 3000);
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

    recorder.start(80);
    report(0.15);

    // Frame-exact: every frame is seek(t) — Opus style
    for (let i = 0; i < totalFrames; i++) {
      if (Date.now() - started > HARD_TIMEOUT_MS - 4000) break;
      const t = i / FPS;
      seek(ctx, spec, t, imageCache);
      if (i % 8 === 0) report(0.15 + (i / totalFrames) * 0.8);
      await waitFrame(frameMs);
    }

    report(0.97);
    await waitFrame(150);
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
    console.warn("[Zeros] Opus-style render failed", e);
    report(1);
    return { blob: await emergencyBlob(ext, mimeType), ext };
  }
}
