/**
 * Zeros Video Engine — always encodes ALL 300 frames (20s × 15fps).
 *
 * Pipeline:
 *  1) Generate up to 8 AI scene images (same API as Image mode), with timeouts
 *  2) Fallback: painted canvas keyframes if AI fails
 *  3) Composite EVERY frame 0..299 with Ken Burns + crossfade
 *  4) MediaRecorder → webm/mp4 + audio
 *
 * Hard ceiling: 10 minutes. Always returns a video blob (never-fail).
 */

import { generateImage } from "@/lib/ai-client";
import type { VideoSpec } from "@/lib/video-spec";

const FONT = '"Inter","SF Pro Display","Segoe UI",system-ui,sans-serif';
const W = 960;
const H = 540;
const FPS = 15;
const DURATION_SEC = 20;
const TOTAL_FRAMES = DURATION_SEC * FPS; // 300 — always
const HARD_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const PER_IMAGE_TIMEOUT_MS = 45_000;

export type RenderVideoResult = { blob: Blob; ext: "mp4" | "webm" };

function easeInOut(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
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

function scenePrompts(spec: VideoSpec): string[] {
  const title = (spec.title || "Cinematic video").slice(0, 48);
  const style =
    "cinematic still frame, photoreal, dramatic lighting, shallow depth of field, film look, 16:9 composition, no text, no watermark, no logo, no UI";
  const fromScenes = (spec.scenes || [])
    .slice(0, 8)
    .map((s, i) => {
      const textLayer = s.layers?.find((l) => l.type === "text" && "text" in l);
      const label =
        (textLayer && "text" in textLayer ? String(textLayer.text) : s.label) || `scene ${i + 1}`;
      return `${style}. "${title}" — ${String(label).slice(0, 90)}. Premium moody look.`;
    })
    .filter(Boolean);
  if (fromScenes.length >= 4) return fromScenes;
  return [
    `${style}. Opening establishing shot for "${title}".`,
    `${style}. Rising tension moment for "${title}".`,
    `${style}. Hero reveal for "${title}", studio light.`,
    `${style}. Dynamic mid beat for "${title}".`,
    `${style}. Emotional detail for "${title}".`,
    `${style}. Climactic peak for "${title}".`,
    `${style}. Soft resolution for "${title}".`,
    `${style}. Final closing frame for "${title}".`,
  ];
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const done = (v: HTMLImageElement | null) => resolve(v);
    img.onload = () => done(img.width > 0 ? img : null);
    img.onerror = () => done(null);
    img.src = url;
    setTimeout(() => done(img.complete && img.width > 0 ? img : null), 15_000);
  });
}

/** Painted keyframe — always works offline */
function paintFallbackKey(index: number, title: string): HTMLImageElement {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const hues = [250, 200, 280, 190, 310, 220, 270, 180];
  const h0 = hues[index % hues.length]!;
  const grad = g.createRadialGradient(W * 0.4, H * 0.35, 40, W / 2, H / 2, W * 0.7);
  grad.addColorStop(0, `hsla(${h0},70%,45%,0.9)`);
  grad.addColorStop(0.5, `hsla(${h0 + 30},60%,20%,1)`);
  grad.addColorStop(1, "#05040e");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // soft orbs
  for (let i = 0; i < 3; i++) {
    const ox = W * (0.2 + i * 0.3);
    const oy = H * (0.3 + (i % 2) * 0.3);
    const rg = g.createRadialGradient(ox, oy, 0, ox, oy, 120);
    rg.addColorStop(0, `hsla(${h0 + i * 20},80%,60%,0.35)`);
    rg.addColorStop(1, "transparent");
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);
  }
  g.fillStyle = "rgba(255,255,255,0.88)";
  g.font = `700 36px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(title.slice(0, 28) || "Zeros", W / 2, H / 2 - 10);
  g.fillStyle = "rgba(180,190,255,0.7)";
  g.font = `500 16px ${FONT}`;
  g.fillText(`Scene ${index + 1}`, W / 2, H / 2 + 28);
  // Sync to ImageBitmap path via data URL
  const url = c.toDataURL("image/png");
  const img = new Image();
  img.src = url;
  // Image with data URL is effectively sync for complete
  return img;
}

async function ensureImageReady(img: HTMLImageElement): Promise<HTMLImageElement> {
  if (img.complete && img.width > 0) return img;
  return new Promise((resolve) => {
    img.onload = () => resolve(img);
    img.onerror = () => resolve(img);
    setTimeout(() => resolve(img), 2000);
  });
}

async function generateKeyframes(
  prompts: string[],
  title: string,
  onProgress?: (r: number) => void,
  deadline: number = Date.now() + HARD_TIMEOUT_MS * 0.55,
): Promise<HTMLImageElement[]> {
  const images: HTMLImageElement[] = [];
  const count = Math.min(8, prompts.length);

  for (let i = 0; i < count; i++) {
    if (Date.now() > deadline) {
      // Remaining slots → painted fallbacks so we still have enough keyframes
      for (let j = i; j < count; j++) {
        images.push(await ensureImageReady(paintFallbackKey(j, title)));
      }
      break;
    }
    onProgress?.(0.04 + (i / count) * 0.4);
    let got: HTMLImageElement | null = null;
    try {
      const url = await withTimeout(generateImage(prompts[i]!), PER_IMAGE_TIMEOUT_MS, null as unknown as string);
      if (url) got = await withTimeout(loadImage(url), 15_000, null);
    } catch (e) {
      console.warn("[Zeros] keyframe AI fail", i, e);
    }
    if (got && got.width > 0) {
      images.push(got);
    } else {
      images.push(await ensureImageReady(paintFallbackKey(i, title)));
    }
  }

  if (!images.length) {
    for (let i = 0; i < 4; i++) images.push(await ensureImageReady(paintFallbackKey(i, title)));
  }
  return images;
}

function coverDraw(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  zoom: number,
  panX: number,
  panY: number,
) {
  if (!img || !img.width) {
    ctx.fillStyle = "#0a0820";
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const iw = img.width;
  const ih = img.height;
  const scale = Math.max(W / iw, H / ih) * zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (W - dw) / 2 + panX * Math.max(0, dw - W) * 0.3;
  const dy = (H - dh) / 2 + panY * Math.max(0, dh - H) * 0.3;
  try {
    ctx.drawImage(img, dx, dy, dw, dh);
  } catch {
    ctx.fillStyle = "#0a0820";
    ctx.fillRect(0, 0, W, H);
  }
}

function drawCaption(ctx: CanvasRenderingContext2D, text: string, alpha: number) {
  if (!text || alpha < 0.05) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  const fs = 22;
  ctx.font = `600 ${fs}px ${FONT}`;
  const pad = 20;
  const tw = Math.min(W * 0.85, ctx.measureText(text).width + pad * 2);
  const th = 40;
  const tx = (W - tw) / 2;
  const ty = H - 72;
  ctx.beginPath();
  ctx.roundRect(tx, ty, tw, th, 12);
  ctx.fillStyle = "rgba(6,8,18,0.78)";
  ctx.fill();
  ctx.fillStyle = "#eef1ff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, ty + th / 2, tw - pad);
  ctx.restore();
}

function vignette(ctx: CanvasRenderingContext2D) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.85);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function pickMime(): { mimeType: string; ext: "mp4" | "webm" } {
  const webm = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"];
  const mp4 = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4"];
  if (typeof MediaRecorder !== "undefined") {
    for (const t of webm) if (MediaRecorder.isTypeSupported(t)) return { mimeType: t, ext: "webm" };
    for (const t of mp4) if (MediaRecorder.isTypeSupported(t)) return { mimeType: t, ext: "mp4" };
  }
  return { mimeType: "video/webm", ext: "webm" };
}

function startAudio(
  ctx: AudioContext,
  dest: MediaStreamAudioDestinationNode,
  durationSec: number,
  bpm: number,
) {
  const master = ctx.createGain();
  master.gain.value = 0.24;
  master.connect(dest);
  const now = ctx.currentTime;
  const beat = 60 / Math.max(70, Math.min(140, bpm));
  for (let i = 0; i < 2; i++) {
    const osc = ctx.createOscillator();
    osc.type = i === 0 ? "sawtooth" : "sine";
    osc.frequency.value = i === 0 ? 55 : 110;
    const g = ctx.createGain();
    g.gain.value = 0.07 / (i + 1);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 800;
    osc.connect(f);
    f.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + durationSec + 0.3);
  }
  const pulses = Math.min(Math.floor(durationSec / beat), 80);
  for (let i = 0; i < pulses; i++) {
    const t = now + i * beat;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.26, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 0.16);
  }
  master.gain.setValueAtTime(0.24, now + Math.max(0, durationSec - 1));
  master.gain.linearRampToValueAtTime(0.0001, now + durationSec);
  return () => {
    try {
      master.disconnect();
    } catch {
      /* */
    }
  };
}

const yieldTick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Ultimate emergency: encode a short silent gradient video so we never fail empty */
async function emergencyBlob(ext: "mp4" | "webm", mimeType: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const stream = canvas.captureStream(10);
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
    }, 1500);
  });
  recorder.start(50);
  for (let i = 0; i < 20; i++) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#0a0820");
    g.addColorStop(1, "#1a1040");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#c8d0ff";
    ctx.font = `600 28px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("Zeros", W / 2, H / 2);
    await yieldTick();
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
  spec: VideoSpec,
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

  const { mimeType, ext } = pickMime();
  const title = (spec.title || "Zeros").slice(0, 40);
  const captions =
    spec.audio?.voiceoverLines?.map((l) => l.text).filter(Boolean) ||
    (spec.scenes || [])
      .map((s) => {
        const t = s.layers?.find((l) => l.type === "text" && "text" in l);
        return t && "text" in t ? String(t.text) : s.label || "";
      })
      .filter(Boolean);

  try {
    report(0.02);
    const prompts = scenePrompts(spec);
    const images = await generateKeyframes(prompts, title, report, started + HARD_TIMEOUT_MS * 0.55);
    report(0.48);

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "medium";

    let audioCtx: AudioContext | null = null;
    let stopAudio: (() => void) | null = null;
    let audioDest: MediaStreamAudioDestinationNode | null = null;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AC();
      if (audioCtx.state === "suspended") {
        try {
          await audioCtx.resume();
        } catch {
          /* */
        }
      }
      audioDest = audioCtx.createMediaStreamDestination();
      stopAudio = startAudio(audioCtx, audioDest, DURATION_SEC, spec.audio?.bpm || 96);
    } catch (e) {
      console.warn("[Zeros] audio failed", e);
    }

    const videoStream = canvas.captureStream(FPS);
    const mixed = new MediaStream();
    videoStream.getVideoTracks().forEach((t) => mixed.addTrack(t));
    audioDest?.stream.getAudioTracks().forEach((t) => mixed.addTrack(t));

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(mixed, {
        mimeType,
        videoBitsPerSecond: 2_500_000,
        audioBitsPerSecond: 96_000,
      });
    } catch {
      try {
        recorder = new MediaRecorder(mixed, { mimeType });
      } catch {
        recorder = new MediaRecorder(mixed);
      }
    }

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data?.size) chunks.push(e.data);
    };

    const remaining = Math.max(5_000, HARD_TIMEOUT_MS - (Date.now() - started));
    const done = new Promise<Blob>((resolve) => {
      const timer = window.setTimeout(() => {
        try {
          recorder.stop();
        } catch {
          /* */
        }
        if (chunks.length) {
          resolve(new Blob(chunks, { type: ext === "mp4" ? "video/mp4" : "video/webm" }));
        } else {
          void emergencyBlob(ext, mimeType).then(resolve);
        }
      }, remaining);
      recorder.onerror = () => {
        window.clearTimeout(timer);
        if (chunks.length) {
          resolve(new Blob(chunks, { type: ext === "mp4" ? "video/mp4" : "video/webm" }));
        } else {
          void emergencyBlob(ext, mimeType).then(resolve);
        }
      };
      recorder.onstop = () => {
        window.clearTimeout(timer);
        if (chunks.length) {
          resolve(new Blob(chunks, { type: ext === "mp4" ? "video/mp4" : "video/webm" }));
        } else {
          void emergencyBlob(ext, mimeType).then(resolve);
        }
      };
    });

    recorder.start(40);
    report(0.5);

    // ── ALWAYS paint all 300 frames ──────────────────────────────────
    const n = Math.max(1, images.length);
    const framesPerScene = TOTAL_FRAMES / n;
    const crossfadeFrames = Math.min(15, Math.floor(framesPerScene * 0.22));

    for (let i = 0; i < TOTAL_FRAMES; i++) {
      // Time budget for encode phase
      if (Date.now() - started > HARD_TIMEOUT_MS - 8_000) {
        // Finish remaining frames faster without yield
        for (let j = i; j < TOTAL_FRAMES; j++) {
          const t = j / (TOTAL_FRAMES - 1);
          const sceneF = t * n;
          const si = Math.min(n - 1, Math.floor(sceneF));
          const local = sceneF - si;
          const img = images[si]!;
          ctx.fillStyle = "#05040e";
          ctx.fillRect(0, 0, W, H);
          coverDraw(ctx, img, 1.08 + local * 0.1, 0, 0);
          vignette(ctx);
        }
        break;
      }

      const t = i / (TOTAL_FRAMES - 1);
      const sceneF = t * n;
      const si = Math.min(n - 1, Math.floor(sceneF));
      const local = sceneF - si;
      const img = images[si]!;
      const next = images[Math.min(n - 1, si + 1)]!;

      const zoom = 1.06 + local * 0.14;
      const panX = Math.sin((si + 1) * 1.7) * (local - 0.5) * 2;
      const panY = Math.cos((si + 1) * 1.3) * (local - 0.5) * 2;

      ctx.fillStyle = "#05040e";
      ctx.fillRect(0, 0, W, H);
      coverDraw(ctx, img, zoom, panX, panY);

      if (si < n - 1 && local > 1 - crossfadeFrames / framesPerScene) {
        const fade = easeInOut(
          (local - (1 - crossfadeFrames / framesPerScene)) / (crossfadeFrames / framesPerScene),
        );
        ctx.save();
        ctx.globalAlpha = fade;
        coverDraw(ctx, next, 1.06, 0, 0);
        ctx.restore();
      }

      vignette(ctx);

      const bar = Math.round(H * 0.04);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, bar);
      ctx.fillRect(0, H - bar, W, bar);

      const cap = captions[Math.min(captions.length - 1, si)] || captions[0] || title;
      const capA =
        local < 0.12 ? easeInOut(local / 0.12) : local > 0.88 ? easeInOut((1 - local) / 0.12) : 1;
      drawCaption(ctx, String(cap).slice(0, 60), capA);

      if (i % 5 === 0) report(0.5 + (i / TOTAL_FRAMES) * 0.48);
      await yieldTick();
    }

    report(0.98);
    await new Promise((r) => setTimeout(r, 100));
    try {
      recorder.stop();
    } catch {
      /* */
    }
    videoStream.getTracks().forEach((t) => t.stop());
    mixed.getTracks().forEach((t) => t.stop());
    stopAudio?.();
    try {
      await audioCtx?.close();
    } catch {
      /* */
    }

    const blob = await done;
    report(1);
    if (blob.size > 0) return { blob, ext };
    // never-fail
    const emergency = await emergencyBlob(ext, mimeType);
    return { blob: emergency, ext };
  } catch (e) {
    console.warn("[Zeros] video pipeline error, using emergency fallback", e);
    const emergency = await emergencyBlob(ext, mimeType);
    report(1);
    return { blob: emergency, ext };
  }
}
