/**
 * Zeros Peak Video Engine — pure 2D premium cinematic motion graphics.
 * No Three.js. Canvas 2D: backgrounds, orbs, glass, text, particles,
 * images/logos, bar/line graphs, smooth motion, film grain, letterbox, real audio.
 * Up to 30s @ 1920×1080. Studio / trailer-grade polish.
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

function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number, s = 0.55) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.18, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${s})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

let _grainTile: HTMLCanvasElement | null = null;
function getGrainTile(): HTMLCanvasElement {
  if (_grainTile) return _grainTile;
  const size = 256;
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const g = c.getContext("2d")!;
  const img = g.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < size * size; i++) {
    const n = Math.random();
    const v = (n * 255) | 0;
    const o = i * 4;
    d[o] = v; d[o + 1] = v; d[o + 2] = v; d[o + 3] = n > 0.52 ? 32 : 0;
  }
  g.putImageData(img, 0, 0);
  _grainTile = c;
  return c;
}

function drawFilmGrain(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, tSec: number) {
  const tile = getGrainTile();
  const ox = ((seed * 17 + tSec * 37) % 256 + 256) % 256;
  const oy = ((seed * 31 + tSec * 23) % 256 + 256) % 256;
  ctx.save();
  ctx.globalAlpha = 0.11;
  ctx.globalCompositeOperation = "soft-light";
  for (let y = -oy; y < h; y += 256) {
    for (let x = -ox; x < w; x += 256) ctx.drawImage(tile, x, y);
  }
  ctx.restore();
}

function drawSoftOrb(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, alpha: number) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  const base = color;
  g.addColorStop(0, base.includes("rgba") ? base.replace(/[\d.]+\)$/, "0.9)") : base + "ee");
  g.addColorStop(0.4, base.includes("rgba") ? base.replace(/[\d.]+\)$/, "0.22)") : base + "44");
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
  const n = Math.min(count, 90);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const s = seed + i * 9973;
    const drift = tSec * speed;
    const px = (((Math.sin(s * 0.017) * 0.5 + 0.5) * w + drift * 42 * (1 + (s % 5))) % w + w) % w;
    const py = (((Math.cos(s * 0.013) * 0.5 + 0.5) * h + drift * 18 * ((s % 3) - 1)) % h + h) % h;
    ctx.globalAlpha = 0.18 + (s % 40) / 200;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, 1.3 + (s % 5) * 0.9, 0, Math.PI * 2);
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
  ctx.roundRect(x, y, w, h, 16);
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fill();
  ctx.strokeStyle = "rgba(160,180,255,0.28)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  const pad = 28;
  const gx = x + pad, gy = y + pad, gw = w - pad * 2, gh = h - pad * 2 - 18;
  if (style === "bar") {
    const bw = (gw / points.length) * 0.62;
    const gap = (gw / points.length) * 0.38;
    points.forEach((p, i) => {
      const bh = (p.value / max) * gh;
      const bx = gx + i * (bw + gap) + gap * 0.5;
      const by = gy + gh - bh;
      const grad = ctx.createLinearGradient(bx, by, bx, by + bh);
      grad.addColorStop(0, color);
      grad.addColorStop(1, "rgba(80,100,220,0.35)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 6);
      ctx.fill();
      if (p.label) {
        ctx.fillStyle = "rgba(220,228,255,0.85)";
        ctx.font = `500 ${Math.round(11 * (w / 400))}px ${FONT}`;
        ctx.textAlign = "center";
        ctx.fillText(p.label, bx + bw / 2, gy + gh + 16, bw);
      }
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
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.lineTo(gx + gw, gy + gh);
    ctx.lineTo(gx, gy + gh);
    ctx.closePath();
    const fg = ctx.createLinearGradient(0, gy, 0, gy + gh);
    fg.addColorStop(0, color.includes("rgba") ? color.replace(/[\d.]+\)$/, "0.28)") : color + "44");
    fg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = fg;
    ctx.fill();
    points.forEach((p, i) => {
      const px = gx + (i / Math.max(1, points.length - 1)) * gw;
      const py = gy + gh - (p.value / max) * gh;
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    });
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
  await Promise.all(
    [...urls].map(
      (url) =>
        new Promise<void>((resolve) => {
          if (imageCache.has(url)) { resolve(); return; }
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => { imageCache.set(url, img); resolve(); };
          img.onerror = () => { imageCache.set(url, null); resolve(); };
          img.src = url;
          setTimeout(() => { if (!imageCache.has(url)) { imageCache.set(url, null); resolve(); } }, 4000);
        }),
    ),
  );
}

function drawLayer(ctx: CanvasRenderingContext2D, layer: VideoLayer, w: number, h: number, localMs: number, sceneDur: number, tSec: number, seed: number, sceneEase: VideoScene["ease"]) {
  if (layer.type === "gradient") {
    drawGradientBg(ctx, w, h, layer.from ?? "#07060f", layer.to ?? "#12102a", layer.angle ?? 155);
    return;
  }
  if (layer.type === "particles") {
    drawParticles(ctx, w, h, layer.count ?? 55, layer.color ?? "#7b93ff", layer.speed ?? 0.4, tSec, seed);
    return;
  }
  const fadeIn = "fadeInMs" in layer ? (layer.fadeInMs ?? 400) : 400;
  const fadeOut = "fadeOutMs" in layer ? (layer.fadeOutMs ?? 300) : 300;
  const alpha = layerAlpha(localMs, sceneDur, fadeIn, fadeOut);
  if (alpha <= 0.01) return;
  const enterT = fadeIn > 0 ? ease(Math.min(1, localMs / fadeIn), sceneEase || "easeOut") : 1;
  const lift = (1 - enterT) * 32;

  if (layer.type === "text") {
    const x = (layer.x ?? 0.5) * w;
    const y = (layer.y ?? 0.5) * h + lift * 0.5;
    const size = Math.round((layer.fontSize ?? 48) * (w / 1920));
    ctx.save();
    ctx.globalAlpha = alpha;
    const tScale = 0.92 + enterT * 0.08;
    ctx.translate(x, y);
    ctx.scale(tScale, tScale);
    ctx.translate(-x, -y);
    ctx.font = `${layer.weight ?? 650} ${size}px ${FONT}`;
    ctx.fillStyle = layer.color ?? "#f4f5ff";
    ctx.textAlign = layer.align ?? "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(100,140,255,0.6)";
    ctx.shadowBlur = Math.min(48, size * 0.45);
    const lines = (layer.text || "").split("\n");
    const lineH = size * 1.22;
    const startY = y - ((lines.length - 1) * lineH) / 2;
    lines.forEach((line, i) => ctx.fillText(line, x, startY + i * lineH, w * 0.9));
    ctx.shadowBlur = 0;
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
    const scale = 0.88 + enterT * 0.12;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy); ctx.scale(scale, scale);
    if (layer.rotate) ctx.rotate((layer.rotate * Math.PI) / 180);
    ctx.translate(-cx, -cy);
    const shape = layer.shape || "rounded";
    if (shape === "circle" || shape === "orb") {
      drawSoftOrb(ctx, cx, cy, Math.max(sw, sh) / 2, layer.color ?? "rgba(120,140,255,0.55)", 1);
    } else if (shape === "rounded" || shape === "glass") {
      const r = Math.min(sw, sh) * 0.14;
      ctx.beginPath(); ctx.roundRect(x, y, sw, sh, r);
      ctx.fillStyle = layer.color ?? "rgba(255,255,255,0.07)"; ctx.fill();
      const hg = ctx.createLinearGradient(x, y, x, y + sh);
      hg.addColorStop(0, "rgba(255,255,255,0.16)"); hg.addColorStop(0.5, "rgba(255,255,255,0.02)"); hg.addColorStop(1, "rgba(0,0,0,0.18)");
      ctx.fillStyle = hg; ctx.fill();
      ctx.strokeStyle = layer.stroke || "rgba(180,200,255,0.35)"; ctx.lineWidth = layer.strokeWidth ?? 1.4; ctx.stroke();
    } else if (shape === "pill") {
      ctx.beginPath(); ctx.roundRect(x, y, sw, sh, Math.min(sw, sh) / 2);
      ctx.fillStyle = layer.color ?? "rgba(255,255,255,0.12)"; ctx.fill();
      if (layer.stroke) { ctx.strokeStyle = layer.stroke; ctx.lineWidth = layer.strokeWidth ?? 1; ctx.stroke(); }
    } else if (shape === "line") {
      ctx.strokeStyle = layer.stroke || layer.color || "#a8b8ff"; ctx.lineWidth = layer.strokeWidth || 3; ctx.lineCap = "round";
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
    ctx.globalAlpha = alpha * (layer.type === "logo" ? 0.95 : 1);
    if (img && img.width > 0) {
      const aspect = img.width / img.height;
      let dw = maxW, dh = maxW / aspect;
      if (dh > maxH) { dh = maxH; dw = maxH * aspect; }
      const dx = x - dw / 2, dy = y - dh / 2;
      if (layer.type === "logo") {
        ctx.beginPath(); ctx.roundRect(dx - 12, dy - 12, dw + 24, dh + 24, 14);
        ctx.fillStyle = "rgba(255,255,255,0.06)"; ctx.fill();
      }
      ctx.drawImage(img, dx, dy, dw, dh);
    } else {
      ctx.beginPath(); ctx.roundRect(x - maxW / 2, y - maxH / 2, maxW, maxH, 12);
      ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fill();
      ctx.strokeStyle = "rgba(180,200,255,0.3)"; ctx.stroke();
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
  const ox1 = w * (0.12 + Math.sin(tSec * 0.22) * 0.04);
  const oy1 = h * (0.18 + Math.cos(tSec * 0.18) * 0.03);
  const ox2 = w * (0.88 + Math.cos(tSec * 0.17) * 0.03);
  const oy2 = h * (0.75 + Math.sin(tSec * 0.21) * 0.04);
  const ox3 = w * (0.5 + Math.sin(tSec * 0.12) * 0.06);
  drawSoftOrb(ctx, ox1, oy1, w * 0.32, "rgba(90,70,200,0.32)", 0.6);
  drawSoftOrb(ctx, ox2, oy2, w * 0.34, "rgba(40,140,220,0.26)", 0.55);
  drawSoftOrb(ctx, ox3, h * 1.02, w * 0.5, "rgba(140,80,220,0.14)", 0.4);
  const sweep = ctx.createLinearGradient(0, h * 0.55, w, h * 0.7);
  sweep.addColorStop(0, "rgba(0,0,0,0)");
  sweep.addColorStop(0.35 + Math.sin(tSec * 0.3) * 0.1, "rgba(80,120,255,0.06)");
  sweep.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = sweep;
  ctx.fillRect(0, 0, w, h);
  for (const scene of active) {
    if (scene.background) {
      ctx.fillStyle = scene.background;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    const localMs = tMs - scene.startMs;
    const sceneDur = Math.max(1, scene.endMs - scene.startMs);
    for (const layer of scene.layers) drawLayer(ctx, layer, w, h, localMs, sceneDur, tSec, seed, scene.ease);
  }
  drawVignette(ctx, w, h, 0.52);
  drawFilmGrain(ctx, w, h, seed, tSec);
  const bar = Math.round(h * 0.045);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, bar);
  ctx.fillRect(0, h - bar, w, bar);
  const lines = spec.audio?.voiceoverLines ?? [];
  const caption = lines.find((l, i) => { const next = lines[i + 1]; return tMs >= l.startMs && (!next || tMs < next.startMs); });
  if (caption?.text) {
    ctx.save();
    const fs = Math.round(22 * (w / 1920));
    ctx.font = `500 ${fs}px ${FONT}`;
    const metrics = ctx.measureText(caption.text);
    const padX = 28;
    const tw = Math.min(w * 0.82, metrics.width + padX * 2);
    const th = Math.round(48 * (h / 1080));
    const tx = (w - tw) / 2;
    const ty = h - bar - Math.round(62 * (h / 1080));
    ctx.beginPath(); ctx.roundRect(tx, ty, tw, th, 14);
    ctx.fillStyle = "rgba(6,8,18,0.82)"; ctx.fill();
    ctx.strokeStyle = "rgba(160,180,255,0.3)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "#eef1ff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(caption.text, w / 2, ty + th / 2, tw - padX);
    ctx.restore();
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
    const t = now + i * beat;
    const osc = ctx.createOscillator(); osc.type = "sine";
    osc.frequency.setValueAtTime(90, t); osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.34, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(g); g.connect(master); osc.start(t); osc.stop(t + 0.2);
  }
  const shimmerCount = Math.min(Math.floor(durationSec / (beat * 2)), 60);
  for (let i = 0; i < shimmerCount; i++) {
    const t = now + i * beat * 2 + beat * 0.5;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 880 + (i % 5) * 110;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.04, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    const filt = ctx.createBiquadFilter();
    filt.type = "highpass";
    filt.frequency.value = 600;
    osc.connect(filt); filt.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + 0.15);
  }
  master.gain.setValueAtTime(0.32, now + Math.max(0, durationSec - 1.2));
  master.gain.linearRampToValueAtTime(0.0001, now + durationSec);
  return () => { try { master.disconnect(); } catch { /* */ } };
}

function pickMimeType(): { mimeType: string; ext: "mp4" | "webm" } {
  const mp4 = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1.4D401E,mp4a.40.2", "video/mp4"];
  const webm = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
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
  return (await renderVideoWithMeta(spec, onProgress)).blob;
}

export async function renderVideoWithMeta(spec: VideoSpec, onProgress?: (ratio: number) => void): Promise<RenderVideoResult> {
  const fps = Math.min(30, Math.max(24, Math.round(spec.fps || 30)));
  const durationSec = Math.min(30, Math.max(20, spec.durationSec || 30));
  const totalFrames = Math.ceil(durationSec * fps);
  const frameDurationMs = 1000 / fps;
  const { width, height } = resolveSize(spec);
  const renderSpec: VideoSpec = { ...spec, width, height, fps, durationSec };

  await preloadImages(renderSpec);

  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!ctx) throw new Error("Canvas 2D unavailable");
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";

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
  try { recorder = new MediaRecorder(mixed, { mimeType, videoBitsPerSecond: 10_000_000, audioBitsPerSecond: 160_000 }); }
  catch { recorder = new MediaRecorder(mixed); }

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

  const done = new Promise<Blob>((resolve, reject) => {
    const timer = window.setTimeout(() => { try { recorder.stop(); } catch { /* */ } reject(new Error("Video encode timed out")); }, 180_000);
    recorder.onerror = () => { window.clearTimeout(timer); reject(new Error("MediaRecorder failed")); };
    recorder.onstop = () => {
      window.clearTimeout(timer);
      resolve(new Blob(chunks, { type: ext === "mp4" ? "video/mp4" : (mimeType.split(";")[0] || "video/webm") }));
    };
  });

  recorder.start(100);
  for (let i = 0; i < totalFrames; i++) {
    paintFrame(ctx, renderSpec, i * frameDurationMs);
    onProgress?.(i / totalFrames);
    if (i % 2 === 0) await yieldFrame();
    else await new Promise<void>((r) => setTimeout(r, 0));
  }
  paintFrame(ctx, renderSpec, durationSec * 1000 - 1);
  onProgress?.(0.98);
  await new Promise((r) => setTimeout(r, 100));
  try { recorder.stop(); } catch { /* */ }
  videoStream.getTracks().forEach((t) => t.stop());
  mixed.getTracks().forEach((t) => t.stop());
  stopAudio?.();
  try { await audioCtx?.close(); } catch { /* */ }
  const blob = await done;
  onProgress?.(1);
  if (!blob.size) throw new Error("Video encode produced empty blob");
  return { blob, ext };
}
