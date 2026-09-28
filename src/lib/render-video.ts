/**
 * Zeros Video Engine — AI image frames + smooth stitch.
 * 1) Generates scene images via /api/generate-image (same as Image mode)
 * 2) Ken Burns + crossfade between scenes @ 15fps, max 20s
 * 3) MediaRecorder → webm/mp4 with audio bed
 */

import { generateImage } from "@/lib/ai-client";
import type { VideoSpec } from "@/lib/video-spec";

const FONT = '"Inter","SF Pro Display","Segoe UI",system-ui,sans-serif';
const W = 960;
const H = 540;
const FPS = 15;
const MAX_SEC = 20;

export type RenderVideoResult = { blob: Blob; ext: "mp4" | "webm" };

function easeInOut(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function scenePrompts(spec: VideoSpec): string[] {
  const title = (spec.title || "Cinematic video").slice(0, 48);
  const style =
    "cinematic still, photoreal, dramatic lighting, shallow depth of field, film grain, 16:9, no text, no watermark, no logo";
  const fromScenes = (spec.scenes || [])
    .slice(0, 6)
    .map((s, i) => {
      const textLayer = s.layers?.find((l) => l.type === "text" && "text" in l);
      const label =
        (textLayer && "text" in textLayer ? String(textLayer.text) : s.label) ||
        `scene ${i + 1}`;
      return `${style}. Subject for "${title}": ${String(label).slice(0, 80)}. Moody premium look.`;
    })
    .filter(Boolean);
  if (fromScenes.length >= 3) return fromScenes;
  return [
    `${style}. Epic opening frame for "${title}", wide establishing shot.`,
    `${style}. Mid story moment for "${title}", focused subject, tension.`,
    `${style}. Hero product / reveal for "${title}", studio light.`,
    `${style}. Dynamic action beat for "${title}", motion blur hints.`,
    `${style}. Emotional close-up for "${title}", soft bokeh.`,
    `${style}. Closing frame for "${title}", calm resolution, dusk light.`,
  ];
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
    setTimeout(() => resolve(img.complete && img.width > 0 ? img : null), 12_000);
  });
}

async function generateSceneImages(
  prompts: string[],
  onProgress?: (r: number) => void,
): Promise<HTMLImageElement[]> {
  const images: HTMLImageElement[] = [];
  for (let i = 0; i < prompts.length; i++) {
    onProgress?.(0.05 + (i / prompts.length) * 0.45);
    try {
      const url = await generateImage(prompts[i]!);
      const img = await loadImage(url);
      if (img) images.push(img);
    } catch (e) {
      console.warn("[Zeros] scene image failed", i, e);
    }
  }
  // Need at least one image — solid fallback gradient canvas
  if (!images.length) {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#0a0820");
    grad.addColorStop(1, "#1a1040");
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
    if (blob) {
      const url = URL.createObjectURL(blob);
      const img = await loadImage(url);
      if (img) images.push(img);
    }
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
  const iw = img.width;
  const ih = img.height;
  const scale = Math.max(W / iw, H / ih) * zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (W - dw) / 2 + panX * (dw - W) * 0.25;
  const dy = (H - dh) / 2 + panY * (dh - H) * 0.25;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawCaption(ctx: CanvasRenderingContext2D, text: string, alpha: number) {
  if (!text || alpha < 0.05) return;
  ctx.save();
  ctx.globalAlpha = alpha;
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
  master.gain.value = 0.26;
  master.connect(dest);
  const now = ctx.currentTime;
  const beat = 60 / Math.max(70, Math.min(140, bpm));
  for (let i = 0; i < 2; i++) {
    const osc = ctx.createOscillator();
    osc.type = i === 0 ? "sawtooth" : "sine";
    osc.frequency.value = i === 0 ? 55 : 110;
    const g = ctx.createGain();
    g.gain.value = 0.08 / (i + 1);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 800;
    osc.connect(f);
    f.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + durationSec + 0.3);
  }
  const pulses = Math.min(Math.floor(durationSec / beat), 60);
  for (let i = 0; i < pulses; i++) {
    const t = now + i * beat;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 0.16);
  }
  master.gain.setValueAtTime(0.26, now + Math.max(0, durationSec - 1));
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
  const report = (r: number) => {
    try {
      onProgress?.(Math.max(0, Math.min(1, r)));
    } catch {
      /* */
    }
  };

  const durationSec = Math.min(MAX_SEC, Math.max(8, Number(spec.durationSec) || 16));
  const totalFrames = Math.ceil(durationSec * FPS);
  const captions =
    spec.audio?.voiceoverLines?.map((l) => l.text).filter(Boolean) ||
    (spec.scenes || [])
      .map((s) => {
        const t = s.layers?.find((l) => l.type === "text" && "text" in l);
        return t && "text" in t ? String(t.text) : s.label || "";
      })
      .filter(Boolean);

  report(0.02);
  const prompts = scenePrompts(spec);
  const images = await generateSceneImages(prompts, report);
  report(0.55);

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
    stopAudio = startAudio(audioCtx, audioDest, durationSec, spec.audio?.bpm || 96);
  } catch (e) {
    console.warn("[Zeros] audio failed", e);
  }

  const videoStream = canvas.captureStream(FPS);
  const mixed = new MediaStream();
  videoStream.getVideoTracks().forEach((t) => mixed.addTrack(t));
  audioDest?.stream.getAudioTracks().forEach((t) => mixed.addTrack(t));

  const { mimeType, ext } = pickMime();
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

  const done = new Promise<Blob>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      try {
        recorder.stop();
      } catch {
        /* */
      }
      if (chunks.length) resolve(new Blob(chunks, { type: ext === "mp4" ? "video/mp4" : "video/webm" }));
      else reject(new Error("Video timed out"));
    }, 90_000);
    recorder.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("MediaRecorder failed"));
    };
    recorder.onstop = () => {
      window.clearTimeout(timer);
      resolve(new Blob(chunks, { type: ext === "mp4" ? "video/mp4" : "video/webm" }));
    };
  });

  recorder.start(50);
  report(0.58);

  const n = Math.max(1, images.length);
  const framesPerScene = totalFrames / n;
  const crossfadeFrames = Math.min(12, Math.floor(framesPerScene * 0.2));

  for (let i = 0; i < totalFrames; i++) {
    const t = i / Math.max(1, totalFrames - 1);
    const sceneF = t * n;
    const si = Math.min(n - 1, Math.floor(sceneF));
    const local = sceneF - si;
    const img = images[si]!;
    const next = images[Math.min(n - 1, si + 1)]!;

    // Ken Burns
    const zoom = 1.05 + local * 0.12;
    const panX = Math.sin((si + 1) * 1.7) * (local - 0.5) * 2;
    const panY = Math.cos((si + 1) * 1.3) * (local - 0.5) * 2;

    ctx.fillStyle = "#05040e";
    ctx.fillRect(0, 0, W, H);
    coverDraw(ctx, img, zoom, panX, panY);

    // Crossfade into next near end of scene
    if (si < n - 1 && local > 1 - crossfadeFrames / framesPerScene) {
      const fade = easeInOut(
        (local - (1 - crossfadeFrames / framesPerScene)) / (crossfadeFrames / framesPerScene),
      );
      ctx.save();
      ctx.globalAlpha = fade;
      coverDraw(ctx, next, 1.05, 0, 0);
      ctx.restore();
    }

    vignette(ctx);

    // Letterbox
    const bar = Math.round(H * 0.04);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, bar);
    ctx.fillRect(0, H - bar, W, bar);

    const cap = captions[Math.min(captions.length - 1, si)] || captions[0] || spec.title || "";
    const capA =
      local < 0.15 ? easeInOut(local / 0.15) : local > 0.85 ? easeInOut((1 - local) / 0.15) : 1;
    drawCaption(ctx, String(cap).slice(0, 60), capA);

    report(0.58 + (i / totalFrames) * 0.4);
    await yieldTick();
  }

  report(0.98);
  await new Promise((r) => setTimeout(r, 80));
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
  if (!blob.size) throw new Error("Empty video");
  return { blob, ext };
}
