/**
 * Browser-native video renderer for VideoSpec.
 * Pipeline: canvas paint per frame → MediaRecorder (WebM) → Blob.
 */

import type { VideoLayer, VideoScene, VideoSpec } from "@/lib/video-spec";

function ease(t: number, kind: VideoScene["ease"] = "easeInOut"): number {
  const x = Math.min(1, Math.max(0, t));
  switch (kind) {
    case "linear":
      return x;
    case "easeIn":
      return x * x;
    case "easeOut":
      return 1 - (1 - x) * (1 - x);
    case "bounce":
      return 1 - Math.abs(Math.cos(x * Math.PI * 2.5)) * (1 - x);
    case "easeInOut":
    default:
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  }
}

function layerAlpha(
  localMs: number,
  sceneDur: number,
  fadeInMs = 300,
  fadeOutMs = 200,
): number {
  let a = 1;
  if (fadeInMs > 0 && localMs < fadeInMs) a = Math.min(a, localMs / fadeInMs);
  if (fadeOutMs > 0 && localMs > sceneDur - fadeOutMs) {
    a = Math.min(a, (sceneDur - localMs) / fadeOutMs);
  }
  return Math.max(0, Math.min(1, a));
}

function drawGradient(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  from: string,
  to: string,
  angle: number,
) {
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

function drawParticles(
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
    const px = ((Math.sin(s) * 0.5 + 0.5) * w + tSec * speed * 40 * (1 + (s % 5))) % w;
    const py = ((Math.cos(s * 1.3) * 0.5 + 0.5) * h + tSec * speed * 18 * ((s % 3) - 1)) % h;
    const r = 1.2 + (s % 4);
    ctx.globalAlpha = 0.25 + (s % 50) / 200;
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
) {
  if (layer.type === "gradient") {
    drawGradient(ctx, w, h, layer.from ?? "#0a0a12", layer.to ?? "#1a1030", layer.angle ?? 160);
    return;
  }
  if (layer.type === "particles") {
    drawParticles(
      ctx,
      w,
      h,
      layer.count ?? 30,
      layer.color ?? "#6b8cff",
      layer.speed ?? 0.5,
      tSec,
      seed,
    );
    return;
  }

  const alpha = layerAlpha(
    localMs,
    sceneDur,
    "fadeInMs" in layer ? layer.fadeInMs : 300,
    "fadeOutMs" in layer ? layer.fadeOutMs : 200,
  );
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;

  if (layer.type === "text") {
    const x = (layer.x ?? 0.5) * w;
    const y = (layer.y ?? 0.5) * h;
    const size = layer.fontSize ?? 32;
    ctx.font = `${layer.weight ?? 600} ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
    ctx.fillStyle = layer.color ?? "#ffffff";
    ctx.textAlign = layer.align ?? "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(100,120,255,0.35)";
    ctx.shadowBlur = 18;
    const lines = (layer.text || "").split("\n");
    const lineH = size * 1.25;
    const startY = y - ((lines.length - 1) * lineH) / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, x, startY + i * lineH, w * 0.9);
    });
  } else if (layer.type === "shape") {
    const x = (layer.x ?? 0) * w;
    const y = (layer.y ?? 0) * h;
    const sw = (layer.w ?? 0.3) * w;
    const sh = (layer.h ?? 0.2) * h;
    const cx = x + sw / 2;
    const cy = y + sh / 2;
    if (layer.rotate) {
      ctx.translate(cx, cy);
      ctx.rotate((layer.rotate * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }
    ctx.fillStyle = layer.color ?? "rgba(255,255,255,0.1)";
    if (layer.shape === "circle") {
      ctx.beginPath();
      ctx.ellipse(cx, cy, sw / 2, sh / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      if (layer.stroke && (layer.strokeWidth ?? 0) > 0) {
        ctx.strokeStyle = layer.stroke;
        ctx.lineWidth = layer.strokeWidth ?? 1;
        ctx.stroke();
      }
    } else if (layer.shape === "rounded") {
      const r = Math.min(sw, sh) * 0.12;
      ctx.beginPath();
      ctx.roundRect(x, y, sw, sh, r);
      ctx.fill();
      if (layer.stroke && (layer.strokeWidth ?? 0) > 0) {
        ctx.strokeStyle = layer.stroke;
        ctx.lineWidth = layer.strokeWidth ?? 1;
        ctx.stroke();
      }
    } else if (layer.shape === "line") {
      ctx.strokeStyle = layer.stroke || layer.color || "#fff";
      ctx.lineWidth = layer.strokeWidth || 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + sw, y + sh);
      ctx.stroke();
    } else {
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

function paintFrame(
  ctx: CanvasRenderingContext2D,
  spec: VideoSpec,
  tMs: number,
) {
  const w = spec.width;
  const h = spec.height;
  const tSec = tMs / 1000;
  const seed = spec.seed ?? 1;

  ctx.fillStyle = spec.background || "#0a0a12";
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
      drawLayer(ctx, layer, w, h, localMs, sceneDur, tSec, seed);
    }
  }

  const lines = spec.audio?.voiceoverLines ?? [];
  const caption = lines.find((l, i) => {
    const next = lines[i + 1];
    return tMs >= l.startMs && (!next || tMs < next.startMs);
  });
  if (caption?.text) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    const pad = 16;
    ctx.font = "500 20px system-ui, sans-serif";
    const metrics = ctx.measureText(caption.text);
    const tw = Math.min(w * 0.85, metrics.width + pad * 2);
    const th = 40;
    const tx = (w - tw) / 2;
    const ty = h - 72;
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, th, 10);
    ctx.fill();
    ctx.fillStyle = "#f0f2ff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(caption.text, w / 2, ty + th / 2, tw - pad);
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

export async function renderVideo(
  spec: VideoSpec,
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  const fps = Math.min(30, Math.max(24, Math.round(spec.fps || 30)));
  const durationSec = Math.min(45, Math.max(6, spec.durationSec || 12));
  const totalFrames = Math.ceil(durationSec * fps);
  const frameDurationMs = 1000 / fps;

  const canvas = document.createElement("canvas");
  canvas.width = spec.width || 1280;
  canvas.height = spec.height || 720;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D unavailable");

  const stream = canvas.captureStream(fps);
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 6_000_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error("MediaRecorder failed"));
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: mimeType.split(";")[0] || "video/webm" }));
    };
  });

  recorder.start(100);

  for (let i = 0; i < totalFrames; i++) {
    const tMs = i * frameDurationMs;
    paintFrame(ctx, spec, tMs);
    onProgress?.(i / totalFrames);
    await new Promise<void>((r) => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => r());
      } else {
        setTimeout(r, 0);
      }
    });
  }

  paintFrame(ctx, spec, durationSec * 1000 - 1);
  await new Promise((r) => setTimeout(r, 120));

  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());

  const blob = await done;
  onProgress?.(1);
  if (!blob.size) throw new Error("Video encode produced empty blob");
  return blob;
}
