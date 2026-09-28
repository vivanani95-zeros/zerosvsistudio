/**
 * Zeros Peak Video Engine — pure 2D cinematic motion.
 * Fast guaranteed-finish path: 960×540 @ 15fps, ≤20s (~300 frames).
 * Uses setTimeout yields (NOT requestAnimationFrame) so background tabs still progress.
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

function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number, s = 0.45) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.18, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${s})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

let _grainTile: HTMLCanvasElement | null = null;
function getGrainTile(): HTMLCanvasElement {
  if (_grainTile) return _grainTile;
  const size = 128;
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const g = c.getContext("2d")!;
  const img = g.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < size * size; i++) {
    const n = Math.random();
    const v = (n * 255) | 0;
    const o = i * 4;
    d[o] = v; d[o + 1] = v; d[o + 2] = v; d[o + 3] = n > 0.55 ? 28 : 0;
  }
  g.putImageData(img, 0, 0);
  _grainTile = c;
  return c;
}

function drawFilmGrain(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, tSec: number) {
  const tile = getGrainTile();
  const ox = ((seed * 17 + tSec * 37) % 128 + 128) % 128;
  const oy = ((seed * 31 + tSec * 23) % 128 + 128) % 128;
  ctx.save();
  ctx.globalAlpha = 0.09;
  ctx.globalCompositeOperation = "soft-light";
  for (let y = -oy; y < h; y += 128) {
    for (let x = -ox; x < w; x += 128) ctx.drawImage(tile, x, y);
  }
  ctx.restore();
}

function drawSoftOrb(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, alpha: number) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  const base = color;
  g.addColorStop(0, base.includes("rgba") ? base.replace(/[\d.]+\)$/, "0.85)") : base + "dd");
  g.addColorStop(0.45, base.includes("rgba") ? base.replace(/[\d.]+\)$/, "0.18)") : base + "33");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, w: number, h: number, count: number, color: string, speed: number, tSec: number, seed: number) {
  const n = Math.min(count, 28);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const s = seed + i * 9973;
    const drift = tSec * speed;
    const px = (((Math.sin(s * 0.017) * 0.5 + 0.5) * w + drift * 42 * (1 + (s % 5))) % w + w) % w;
    const py = (((Math.cos(s * 0.013) * 0.5 + 0.5) * h + drift * 18 * ((s % 3) - 1)) % h + h) % h;
    ctx.globalAlpha = 0.18 + (s % 40) / 200;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, 1.2 + (s % 4) * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawGradientBg(ctx: CanvasRenderingContext2D, w: number, h: number, from: string, to: string, angle: number) {
  const rad = (angle * Math.PI) / 180;
  const cx = w / 2, cy = h / 2;
  const len = Math.hypot(w, h) / 2;
  const g = ctx.createLinearGradient(cx - Math.cos(rad) * len, cy - Math.sin(rad) * len, cx + Math.cos(rad) * len, cy + Math.sin(rad) * len);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

type GraphPoint = { label?: string; value: number };

function drawGraph(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, points: GraphPoint[], style: "bar" | "line", color: string, alpha: number) {
  if (!points.length) return;
  const max = Math.max(...points.map((p) => p.value), 1);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fill();
  ctx.strokeStyle = "rgba(160,180,255,0.28)";
  ctx.lineWidth = 1;
  ctx.stroke();
  const pad = 20;
  const gx = x + pad, gy = y + pad, gw = w - pad * 2, gh = h - pad * 2 - 14;
  if (style === "bar") {
    const bw = (gw / points.length) * 0.62;
    const gap = (gw / points.length) * 0.38;
    points.forEach((p, i) => {
      const bh = (p.value / max) * gh;
      const bx = gx + i * (bw + gap) + gap * 0.5;
      const by = gy + gh - bh;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 4);
      ctx.fill();
    });
  } else {
    ctx.beginPath();
    points.forEach((p, i) => {
      const px = gx + (i / Math.max(1, points.length - 1)) * gw;
      const py = gy + gh - (p.value / max) * gh;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  ctx.restore();
}

const imageCache = new Map<string, HTMLImageElement | null>();

async function preloadImages(spec: VideoSpec): Promise<void> {
  const urls = new Set<string>();
  for (const sc of spec.scenes) {
    for (const layer of sc.layers) {
      if ((layer.type === "image" || layer.type === "logo") && "src" in layer && layer.src) urls.add(layer.src);
    }
  }
  if (!urls.size) return;
  await Promise.race([
    Promise.all(
      [...urls].slice(0, 6).map(
        (url) =>
          new Promise<void>((resolve) => {
            if (imageCache.has(url)) { resolve(); return; }
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => { imageCache.set(url, img); resolve(); };
            img.onerror = () => { imageCache.set(url, null); resolve(); };
            img.src = url;
            setTimeout(() => { if (!imageCache.has(url)) { imageCache.set(url, null); resolve(); } }, 800);
          }),
      ),
    ),
    new Promise<void>((r) => setTimeout(r, 1200)),
  ]);
}

function drawLayer(ctx: CanvasRenderingContext2D, layer: VideoLayer, w: number, h: number, localMs: number, sceneDur: number, tSec: number, seed: number, sceneEase: VideoScene["ease"]) {
  if (layer.type === "gradient") {
    drawGradientBg(ctx, w, h, layer.from ?? "#07060f", layer.to ?? "#12102a", layer.angle ?? 155);
    return;
  }
  if (layer.type === "particles") {
    drawParticles(ctx, w, h, layer.count ?? 24, layer.color ?? "#7b93ff", layer.speed ?? 0.4, tSec, seed);
    return;
  }
  const fadeIn = "fadeInMs" in layer ? (layer.fadeInMs ?? 400) : 400;
  const fadeOut = "fadeOutMs" in layer ? (layer.fadeOutMs ?? 300) : 300;
  const alpha = layerAlpha(localMs, sceneDur, fadeIn, fadeOut);
  if (alpha <= 0.01) return;
  const enterT = fadeIn > 0 ? ease(Math.min(1, localMs / fadeIn), sceneEase || "easeOut") : 1;
  const lift = (1 - enterT) * 24;

  if (layer.type === "text") {
    const x = (layer.x ?? 0.5) * w;
    const y = (layer.y ?? 0.5) * h + lift * 0.5;
    const size = Math.round((layer.fontSize ?? 48) * (w / 960));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `${layer.weight ?? 650} ${size}px ${FONT}`;
    ctx.fillStyle = layer.color ?? "#f4f5ff";
    ctx.textAlign = layer.align ?? "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(100,140,255,0.4)";
    ctx.shadowBlur = Math.min(24, size * 0.3);
    const lines = (layer.text || "").split("\n");
    const lineH = size * 1.2;
    const startY = y - ((lines.length - 1) * lineH) / 2;
    lines.forEach((line, i) => ctx.fillText(line, x, startY + i * lineH, w * 0.9));
    ctx.restore();
    return;
  }

  if (layer.type === "shape") {
    const x = (layer.x ?? 0) * w;
    const y = (layer.y ?? 0) * h + lift * 0.3;
    const sw = (layer.w ?? 0.3) * w;
    const sh = (layer.h ?? 0.2) * h;
    const cx = x + sw / 2, cy = y + sh / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    const shape = layer.shape || "rounded";
    if (shape === "circle" || shape === "orb") {
      drawSoftOrb(ctx, cx, cy, Math.max(sw, sh) / 2, layer.color ?? "rgba(120,140,255,0.5)", 1);
    } else if (shape === "rounded" || shape === "glass") {
      const r = Math.min(sw, sh) * 0.12;
      ctx.beginPath(); ctx.roundRect(x, y, sw, sh, r);
      ctx.fillStyle = layer.color ?? "rgba(255,255,255,0.07)"; ctx.fill();
      ctx.strokeStyle = layer.stroke || "rgba(180,200,255,0.3)"; ctx.lineWidth = 1; ctx.stroke();
    } else if (shape === "pill") {
      ctx.beginPath(); ctx.roundRect(x, y, sw, sh, Math.min(sw, sh) / 2);
      ctx.fillStyle = layer.color ?? "rgba(255,255,255,0.12)"; ctx.fill();
    } else if (shape === "line") {
      ctx.strokeStyle = layer.stroke || layer.color || "#a8b8ff"; ctx.lineWidth = layer.strokeWidth || 2; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + sw, y + sh); ctx.stroke();
    } else {
      ctx.fillStyle = layer.color ?? "rgba(255,255,255,0.08)"; ctx.fillRect(x, y, sw, sh);
    }
    ctx.restore();
    return;
  }

  if (layer.type === "image" || layer.type === "logo") {
    const src = layer.src;
    const img = src ? imageCache.get(src) : null;
    const x = (layer.x ?? 0.5) * w;
    const y = (layer.y ?? 0.5) * h + lift * 0.4;
    const maxW = (layer.w ?? 0.28) * w;
    const maxH = (layer.h ?? 0.2) * h;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (img && img.width > 0) {
      const aspect = img.width / img.height;
      let dw = maxW, dh = maxW / aspect;
      if (dh > maxH) { dh = maxH; dw = maxH * aspect; }
      ctx.drawImage(img, x - dw / 2, y - dh / 2, dw, dh);
    } else {
      ctx.beginPath(); ctx.roundRect(x - maxW / 2, y - maxH / 2, maxW, maxH, 10);
      ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fill();
    }
    ctx.restore();
    return;
  }

  if (layer.type === "graph") {
    const x = (layer.x ?? 0.12) * w;
    const y = (layer.y ?? 0.25) * h + lift * 0.25;
    const gw = (layer.w ?? 0.76) * w;
    const gh = (layer.h ?? 0.4) * h;
    const points = (layer.points ?? []).map((p) => ({
      label: typeof p === "object" && p && "label" in p ? String((p as { label?: string }).label ?? "") : "",
      value: typeof p === "number" ? p : typeof p === "object" && p && "value" in p ? Number((p as { value: number }).value) : 0,
    }));
    drawGraph(ctx, x, y, gw, gh, points, layer.style === "line" ? "line" : "bar", layer.color ?? "#6ee7ff", alpha);
  }
}

function paintFrame(ctx: CanvasRenderingContext2D, spec: VideoSpec, tMs: number) {
  const w = spec.width, h = spec.height, tSec = tMs / 1000, seed = spec.seed ?? 1;
  ctx.fillStyle = spec.background || "#07060f";
  ctx.fillRect(0, 0, w, h);
  const active = spec.scenes.filter((s) => tMs >= s.startMs && tMs < s.endMs);
  if (active.length === 0 && spec.scenes.length) {
    const last = spec.scenes[spec.scenes.length - 1]!;
    if (tMs >= last.startMs) active.push(last);
  }
  drawSoftOrb(ctx, w * 0.15, h * 0.2, w * 0.28, "rgba(90,70,200,0.28)", 0.55);
  drawSoftOrb(ctx, w * 0.85, h * 0.75, w * 0.3, "rgba(40,140,220,0.22)", 0.5);
  for (const scene of active) {
    const localMs = tMs - scene.startMs;
    const sceneDur = Math.max(1, scene.endMs - scene.startMs);
    for (const layer of scene.layers) drawLayer(ctx, layer, w, h, localMs, sceneDur, tSec, seed, scene.ease);
  }
  drawVignette(ctx, w, h, 0.42);
  if ((Math.floor(tSec * 15) % 2) === 0) drawFilmGrain(ctx, w, h, seed, tSec);
  const bar = Math.round(h * 0.04);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, bar);
  ctx.fillRect(0, h - bar, w, bar);
  const lines = spec.audio?.voiceoverLines ?? [];
  const caption = lines.find((l, i) => { const next = lines[i + 1]; return tMs >= l.startMs && (!next || tMs < next.startMs); });
  if (caption?.text) {
    ctx.save();
    const fs = Math.round(18 * (w / 960));
    ctx.font = `500 ${fs}px ${FONT}`;
    const tw = Math.min(w * 0.8, ctx.measureText(caption.text).width + 40);
    const th = Math.round(36 * (h / 540));
    const tx = (w - tw) / 2;
    const ty = h - bar - Math.round(48 * (h / 540));
    ctx.beginPath(); ctx.roundRect(tx, ty, tw, th, 10);
    ctx.fillStyle = "rgba(6,8,18,0.8)"; ctx.fill();
    ctx.fillStyle = "#eef1ff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(caption.text, w / 2, ty + th / 2, tw - 20);
    ctx.restore();
  }
}

function startAudioBed(ctx: AudioContext, dest: MediaStreamAudioDestinationNode, mood: string, bpm: number, durationSec: number) {
  const master = ctx.createGain(); master.gain.value = 0.28; master.connect(dest);
  const beat = 60 / Math.max(60, Math.min(160, bpm)); const now = ctx.currentTime;
  const moodMap: Record<string, { root: number; intervals: number[]; filter: number }> = {
    cinematic: { root: 110, intervals: [0, 3, 7, 10], filter: 900 }, upbeat: { root: 146, intervals: [0, 4, 7, 12], filter: 1800 },
    ambient: { root: 82, intervals: [0, 5, 7, 12], filter: 600 }, playful: { root: 174, intervals: [0, 4, 7, 11], filter: 2000 },
    tense: { root: 98, intervals: [0, 1, 6, 10], filter: 700 }, warm: { root: 130, intervals: [0, 4, 7, 9], filter: 1200 },
  };
  const m = moodMap[mood] ?? moodMap.cinematic!;
  for (let i = 0; i < 2; i++) {
    const osc = ctx.createOscillator(); osc.type = i === 0 ? "sawtooth" : "sine";
    osc.frequency.value = (m.root * Math.pow(2, m.intervals[i % m.intervals.length]! / 12)) / (i === 0 ? 2 : 1);
    const g = ctx.createGain(); g.gain.value = 0.1 / (i + 1);
    const filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = m.filter;
    osc.connect(filt); filt.connect(g); g.connect(master); osc.start(now); osc.stop(now + durationSec + 0.4);
  }
  const pulseCount = Math.min(Math.floor(durationSec / beat), 80);
  for (let i = 0; i < pulseCount; i++) {
    const t = now + i * beat;
    const osc = ctx.createOscillator(); osc.type = "sine";
    osc.frequency.setValueAtTime(90, t); osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    osc.connect(g); g.connect(master); osc.start(t); osc.stop(t + 0.18);
  }
  master.gain.setValueAtTime(0.28, now + Math.max(0, durationSec - 1));
  master.gain.linearRampToValueAtTime(0.0001, now + durationSec);
  return () => { try { master.disconnect(); } catch { /* */ } };
}

function pickMimeType(): { mimeType: string; ext: "mp4" | "webm" } {
  const webm = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"];
  const mp4 = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4"];
  if (typeof MediaRecorder !== "undefined") {
    // Prefer webm — more reliable in Chrome/Firefox for canvas captureStream
    for (const t of webm) if (MediaRecorder.isTypeSupported(t)) return { mimeType: t, ext: "webm" };
    for (const t of mp4) if (MediaRecorder.isTypeSupported(t)) return { mimeType: t, ext: "mp4" };
  }
  return { mimeType: "video/webm", ext: "webm" };
}

function resolveSize(_spec: VideoSpec): { width: number; height: number } {
  return { width: 960, height: 540 };
}

/** setTimeout — NOT rAF. rAF freezes for hours when the tab is backgrounded. */
const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 0));

export type RenderVideoResult = { blob: Blob; ext: "mp4" | "webm" };

export async function renderVideo(spec: VideoSpec, onProgress?: (ratio: number) => void): Promise<Blob> {
  return (await renderVideoWithMeta(spec, onProgress)).blob;
}

export async function renderVideoWithMeta(spec: VideoSpec, onProgress?: (ratio: number) => void): Promise<RenderVideoResult> {
  const fps = 15;
  const durationSec = Math.min(20, Math.max(8, Math.min(Number(spec.durationSec) || 16, 20)));
  const totalFrames = Math.ceil(durationSec * fps);
  const frameDurationMs = 1000 / fps;
  const { width, height } = resolveSize(spec);
  const renderSpec: VideoSpec = { ...spec, width, height, fps, durationSec };

  const report = (r: number) => {
    try { onProgress?.(Math.max(0, Math.min(1, r))); } catch { /* */ }
  };

  report(0.04);
  await preloadImages(renderSpec);
  report(0.08);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!ctx) throw new Error("Canvas 2D unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "low";

  let audioCtx: AudioContext | null = null;
  let stopAudio: (() => void) | null = null;
  let audioDest: MediaStreamAudioDestinationNode | null = null;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AC();
    if (audioCtx.state === "suspended") { try { await audioCtx.resume(); } catch { /* */ } }
    audioDest = audioCtx.createMediaStreamDestination();
    stopAudio = startAudioBed(audioCtx, audioDest, spec.audio?.mood || "cinematic", spec.audio?.bpm || 96, durationSec);
  } catch (e) {
    console.warn("[Zeros] audio bed failed:", e);
  }

  const videoStream = canvas.captureStream(fps);
  const mixed = new MediaStream();
  videoStream.getVideoTracks().forEach((t) => mixed.addTrack(t));
  audioDest?.stream.getAudioTracks().forEach((t) => mixed.addTrack(t));

  const { mimeType, ext } = pickMimeType();
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(mixed, { mimeType, videoBitsPerSecond: 2_000_000, audioBitsPerSecond: 96_000 });
  } catch {
    try { recorder = new MediaRecorder(mixed, { mimeType }); }
    catch { recorder = new MediaRecorder(mixed); }
  }

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };

  const done = new Promise<Blob>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      try { recorder.stop(); } catch { /* */ }
      if (chunks.length) {
        resolve(new Blob(chunks, { type: ext === "mp4" ? "video/mp4" : "video/webm" }));
      } else {
        reject(new Error("Video timed out — try again"));
      }
    }, 45_000);
    recorder.onerror = () => { window.clearTimeout(timer); reject(new Error("MediaRecorder failed")); };
    recorder.onstop = () => {
      window.clearTimeout(timer);
      resolve(new Blob(chunks, { type: ext === "mp4" ? "video/mp4" : "video/webm" }));
    };
  });

  recorder.start(50);
  report(0.1);

  for (let i = 0; i < totalFrames; i++) {
    paintFrame(ctx, renderSpec, i * frameDurationMs);
    report(0.1 + (i / Math.max(1, totalFrames - 1)) * 0.85);
    await yieldFrame();
  }

  paintFrame(ctx, renderSpec, durationSec * 1000 - 1);
  report(0.97);
  await new Promise((r) => setTimeout(r, 100));
  try { recorder.stop(); } catch { /* */ }
  videoStream.getTracks().forEach((t) => t.stop());
  mixed.getTracks().forEach((t) => t.stop());
  stopAudio?.();
  try { await audioCtx?.close(); } catch { /* */ }

  const blob = await done;
  report(1);
  if (!blob.size) throw new Error("Empty video blob");
  return { blob, ext };
}
