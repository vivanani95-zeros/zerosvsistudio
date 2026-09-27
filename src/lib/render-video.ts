/**
 * Zeros Peak 2D Video Engine — studio-grade browser renderer.
 * Canvas paint → MediaRecorder (WebM). Cinematic type, glass, orbs, grain, letterbox, eases.
 */

import type { VideoLayer, VideoScene, VideoSpec } from "@/lib/video-spec";

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
      if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
      if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
      return n1 * (x -= 2.625 / d1) * x + 0.984375;
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

function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number, s = 0.52) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.22, w / 2, h / 2, Math.max(w, h) * 0.74);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${s})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawFilmGrain(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, tSec: number) {
  ctx.save();
  ctx.globalAlpha = 0.04;
  const step = 3;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const n = Math.sin((x + 17) * (y + 29) * ((seed % 997) + 1) + tSec * 42) * 0.5 + 0.5;
      if (n > 0.58) {
        const v = Math.floor(160 + n * 90);
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
  g.addColorStop(0.4, base.includes("rgba") ? base.replace(/[\d.]+\)$/, "0.22)") : base + "40");
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

function drawParticles(ctx: CanvasRenderingContext2D, w: number, h: number, count: number, color: string, speed: number, tSec: number, seed: number) {
  ctx.save();
  for (let i = 0; i < count; i++) {
    const s = seed + i * 9973;
    const drift = tSec * speed;
    const px = (((Math.sin(s * 0.017) * 0.5 + 0.5) * w + drift * 38 * (1 + (s % 5))) % w + w) % w;
    const py = (((Math.cos(s * 0.013) * 0.5 + 0.5) * h + drift * 15 * ((s % 3) - 1)) % h + h) % h;
    const r = 1.1 + (s % 5) * 0.7;
    ctx.globalAlpha = 0.16 + (s % 40) / 220;
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
    drawParticles(ctx, w, h, layer.count ?? 52, layer.color ?? "#7b93ff", layer.speed ?? 0.42, tSec, seed);
    return;
  }

  const fadeIn = "fadeInMs" in layer ? (layer.fadeInMs ?? 400) : 400;
  const fadeOut = "fadeOutMs" in layer ? (layer.fadeOutMs ?? 300) : 300;
  const alpha = layerAlpha(localMs, sceneDur, fadeIn, fadeOut);
  if (alpha <= 0.01) return;
  const enterT = fadeIn > 0 ? ease(Math.min(1, localMs / fadeIn), sceneEase || "easeOut") : 1;
  const lift = (1 - enterT) * 22;

  ctx.save();
  ctx.globalAlpha = alpha;

  if (layer.type === "text") {
    const x = (layer.x ?? 0.5) * w;
    const y = (layer.y ?? 0.5) * h + lift * 0.45;
    const size = layer.fontSize ?? 42;
    const weight = layer.weight ?? 650;
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = layer.color ?? "#f4f5ff";
    ctx.textAlign = layer.align ?? "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(120,140,255,0.5)";
    ctx.shadowBlur = Math.min(32, size * 0.4);
    const lines = (layer.text || "").split("\n");
    const lineH = size * 1.22;
    const startY = y - ((lines.length - 1) * lineH) / 2;
    lines.forEach((line, i) => ctx.fillText(line, x, startY + i * lineH, w * 0.88));
    ctx.shadowBlur = 0;
    lines.forEach((line, i) => ctx.fillText(line, x, startY + i * lineH, w * 0.88));
  } else if (layer.type === "shape") {
    const x = (layer.x ?? 0) * w;
    const y = (layer.y ?? 0) * h + lift * 0.28;
    const sw = (layer.w ?? 0.3) * w;
    const sh = (layer.h ?? 0.2) * h;
    const cx = x + sw / 2;
    const cy = y + sh / 2;
    const scale = 0.9 + enterT * 0.1;
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
      hg.addColorStop(0, "rgba(255,255,255,0.14)");
      hg.addColorStop(0.45, "rgba(255,255,255,0.02)");
      hg.addColorStop(1, "rgba(0,0,0,0.18)");
      ctx.fillStyle = hg;
      ctx.fill();
      ctx.strokeStyle = layer.stroke || "rgba(180,200,255,0.32)";
      ctx.lineWidth = layer.strokeWidth ?? 1.35;
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

function paintFrame(ctx: CanvasRenderingContext2D, spec: VideoSpec, tMs: number) {
  const w = spec.width;
  const h = spec.height;
  const tSec = tMs / 1000;
  const seed = spec.seed ?? 1;

  ctx.fillStyle = spec.background || "#07060f";
  ctx.fillRect(0, 0, w, h);

  const active = spec.scenes.filter((s) => tMs >= s.startMs && tMs < s.endMs);
  if (active.length === 0 && spec.scenes.length) {
    const last = spec.scenes[spec.scenes.length - 1]!;
    if (tMs >= last.startMs) active.push(last);
  }

  for (const scene of active) {
    const localMs = tMs - scene.startMs;
    const sceneDur = Math.max(1, scene.endMs - scene.startMs);
    if (scene.background) {
      ctx.fillStyle = scene.background;
      ctx.fillRect(0, 0, w, h);
    }
    for (const layer of scene.layers) {
      drawLayer(ctx, layer, w, h, localMs, sceneDur, tSec, seed, scene.ease);
    }
  }

  drawSoftOrb(ctx, w * 0.12, h * 0.18, w * 0.3, "rgba(90,70,200,0.38)", 0.38);
  drawSoftOrb(ctx, w * 0.88, h * 0.78, w * 0.34, "rgba(40,120,220,0.32)", 0.32);
  drawSoftOrb(ctx, w * 0.5, h * 0.92, w * 0.4, "rgba(140,80,220,0.15)", 0.22);

  drawVignette(ctx, w, h, 0.52);
  drawFilmGrain(ctx, w, h, seed, tSec);

  const bar = Math.round(h * 0.045);
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
    ctx.font = `500 19px ${FONT}`;
    const metrics = ctx.measureText(caption.text);
    const padX = 24;
    const tw = Math.min(w * 0.82, metrics.width + padX * 2);
    const th = 44;
    const tx = (w - tw) / 2;
    const ty = h - bar - 58;
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, th, 14);
    ctx.fillStyle = "rgba(6,8,18,0.78)";
    ctx.fill();
    ctx.strokeStyle = "rgba(160,180,255,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#eef1ff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(caption.text, w / 2, ty + th / 2, tw - padX);
    ctx.restore();
  }
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

export async function renderVideo(spec: VideoSpec, onProgress?: (ratio: number) => void): Promise<Blob> {
  const fps = Math.min(30, Math.max(24, Math.round(spec.fps || 30)));
  const durationSec = Math.min(45, Math.max(6, spec.durationSec || 12));
  const totalFrames = Math.ceil(durationSec * fps);
  const frameDurationMs = 1000 / fps;

  const canvas = document.createElement("canvas");
  canvas.width = spec.width || 1280;
  canvas.height = spec.height || 720;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const stream = canvas.captureStream(fps);
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 10_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error("MediaRecorder failed"));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType.split(";")[0] || "video/webm" }));
  });

  recorder.start(60);

  for (let i = 0; i < totalFrames; i++) {
    paintFrame(ctx, spec, i * frameDurationMs);
    onProgress?.(i / totalFrames);
    await new Promise<void>((r) => {
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => r());
      else setTimeout(r, 0);
    });
  }

  paintFrame(ctx, spec, durationSec * 1000 - 1);
  await new Promise((r) => setTimeout(r, 160));
  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());

  const blob = await done;
  onProgress?.(1);
  if (!blob.size) throw new Error("Video encode produced empty blob");
  return blob;
}
