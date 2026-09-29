/**
 * Zeros Video Engine — full-duration silent cinematic video.
 *
 * WHY videos were only ~2s before:
 *   canvas.captureStream + MediaRecorder records WALL-CLOCK time.
 *   Painting 300 frames with setTimeout(0) finishes in ~1–2s, so the
 *   encoded file was only ~2s long. Fix: wait ~1/FPS between frames.
 *
 * Pipeline:
 *  1) Up to 8 AI scene images (Image API) with timeouts + painted fallbacks
 *  2) Real-time Ken Burns + crossfade across ALL 300 frames @ 15fps = 20s
 *  3) MediaRecorder → webm/mp4 (silent, no music/song)
 *
 * Hard ceiling: 10 minutes. Always returns a video blob.
 */

import { generateImage } from "@/lib/ai-client";
import type { VideoSpec } from "@/lib/video-spec";

const FONT = '"Inter","SF Pro Display","Segoe UI",system-ui,sans-serif';
const W = 1280;
const H = 720;
const FPS = 15;
const DURATION_SEC = 20;
const TOTAL_FRAMES = DURATION_SEC * FPS; // 300
const FRAME_MS = Math.round(1000 / FPS); // ~67ms — real-time pacing
const HARD_TIMEOUT_MS = 10 * 60 * 1000;
const PER_IMAGE_TIMEOUT_MS = 50_000;

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
  const title = (spec.title || "Cinematic video").slice(0, 56);
  // Manus-style: cinematic, film still, real lighting, shallow DOF, no UI text
  const base =
    "ultra cinematic film still, photoreal, anamorphic bokeh, volumetric light, shallow depth of field, wet asphalt reflections, moody teal and amber grade, 16:9, no text, no watermark, no logo, no UI, no subtitles";
  const fromScenes = (spec.scenes || [])
    .slice(0, 8)
    .map((s, i) => {
      const textLayer = s.layers?.find((l) => l.type === "text" && "text" in l);
      const label =
        (textLayer && "text" in textLayer ? String(textLayer.text) : s.label) || `scene ${i + 1}`;
      return `${base}. Subject for "${title}": ${String(label).slice(0, 100)}. Premium commercial look.`;
    })
    .filter(Boolean);
  if (fromScenes.length >= 4) return fromScenes;
  return [
    `${base}. Wide establishing night street, distant headlights in fog, for "${title}".`,
    `${base}. Medium shot, subject half in silhouette against cold city light, for "${title}".`,
    `${base}. Close emotional face, soft rim light, for "${title}".`,
    `${base}. Dynamic mid action beat, motion energy, for "${title}".`,
    `${base}. Hero product / key object reveal, studio rim light, for "${title}".`,
    `${base}. Climactic peak moment, strong contrast, for "${title}".`,
    `${base}. Quiet resolution, cooler grade, for "${title}".`,
    `${base}. Final end-card atmosphere, empty frame with atmosphere, for "${title}".`,
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
    setTimeout(() => done(img.complete && img.width > 0 ? img : null), 18_000);
  });
}

function paintFallbackKey(index: number, title: string): HTMLImageElement {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const hues = [200, 220, 250, 280, 190, 210, 240, 260];
  const h0 = hues[index % hues.length]!;
  const grad = g.createRadialGradient(W * 0.35, H * 0.3, 20, W / 2, H / 2, W * 0.75);
  grad.addColorStop(0, `hsla(${h0},55%,38%,0.95)`);
  grad.addColorStop(0.45, `hsla(${h0 + 25},50%,14%,1)`);
  grad.addColorStop(1, "#04030a");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 4; i++) {
    const ox = W * (0.15 + i * 0.22);
    const oy = H * (0.25 + (i % 2) * 0.35);
    const rg = g.createRadialGradient(ox, oy, 0, ox, oy, 140);
    rg.addColorStop(0, `hsla(${h0 + i * 15},70%,55%,0.28)`);
    rg.addColorStop(1, "transparent");
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);
  }
  g.fillStyle = "rgba(240,245,255,0.9)";
  g.font = `700 40px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(title.slice(0, 32) || "Zeros", W / 2, H / 2 - 8);
  g.fillStyle = "rgba(160,200,230,0.65)";
  g.font = `500 16px ${FONT}`;
  g.fillText(`Scene ${index + 1}`, W / 2, H / 2 + 30);
  const img = new Image();
  img.src = c.toDataURL("image/png");
  return img;
}

async function ensureImageReady(img: HTMLImageElement): Promise<HTMLImageElement> {
  if (img.complete && img.width > 0) return img;
  return new Promise((resolve) => {
    img.onload = () => resolve(img);
    img.onerror = () => resolve(img);
    setTimeout(() => resolve(img), 2500);
  });
}

async function generateKeyframes(
  prompts: string[],
  title: string,
  onProgress?: (r: number) => void,
  deadline: number = Date.now() + HARD_TIMEOUT_MS * 0.5,
): Promise<HTMLImageElement[]> {
  const images: HTMLImageElement[] = [];
  const count = Math.min(8, prompts.length);

  for (let i = 0; i < count; i++) {
    if (Date.now() > deadline) {
      for (let j = i; j < count; j++) {
        images.push(await ensureImageReady(paintFallbackKey(j, title)));
      }
      break;
    }
    onProgress?.(0.04 + (i / count) * 0.4);
    let got: HTMLImageElement | null = null;
    try {
      const url = await withTimeout(generateImage(prompts[i]!), PER_IMAGE_TIMEOUT_MS, null as unknown as string);
      if (url) got = await withTimeout(loadImage(url), 16_000, null);
    } catch (e) {
      console.warn("[Zeros] keyframe AI fail", i, e);
    }
    if (got && got.width > 0) images.push(got);
    else images.push(await ensureImageReady(paintFallbackKey(i, title)));
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
    ctx.fillStyle = "#05040e";
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const iw = img.width;
  const ih = img.height;
  const scale = Math.max(W / iw, H / ih) * zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (W - dw) / 2 + panX * Math.max(0, dw - W) * 0.35;
  const dy = (H - dh) / 2 + panY * Math.max(0, dh - H) * 0.35;
  try {
    ctx.drawImage(img, dx, dy, dw, dh);
  } catch {
    ctx.fillStyle = "#05040e";
    ctx.fillRect(0, 0, W, H);
  }
}

function drawCaption(ctx: CanvasRenderingContext2D, text: string, alpha: number) {
  if (!text || alpha < 0.05) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  const fs = 24;
  ctx.font = `600 ${fs}px ${FONT}`;
  const padX = 22;
  const tw = Math.min(W * 0.88, ctx.measureText(text).width + padX * 2);
  const th = 44;
  const tx = (W - tw) / 2;
  const ty = H - 88;
  ctx.beginPath();
  ctx.roundRect(tx, ty, tw, th, 14);
  ctx.fillStyle = "rgba(6,8,16,0.82)";
  ctx.fill();
  ctx.fillStyle = "#f2f4ff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, ty + th / 2, tw - padX);
  ctx.restore();
}

function vignette(ctx: CanvasRenderingContext2D) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.18, W / 2, H / 2, H * 0.9);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
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

/** Wait until next frame slot so MediaRecorder gets real-time duration */
const waitFrame = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
    }, 2200);
  });
  recorder.start(50);
  for (let i = 0; i < 24; i++) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#0a0820");
    g.addColorStop(1, "#121028");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#c8d0ff";
    ctx.font = `600 32px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("Zeros", W / 2, H / 2);
    await waitFrame(80);
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
    const images = await generateKeyframes(prompts, title, report, started + HARD_TIMEOUT_MS * 0.45);
    report(0.45);

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // captureStream(0) = push frames on demand when canvas is painted;
    // we still pace with FRAME_MS so duration matches wall clock.
    const videoStream = canvas.captureStream(FPS);

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(videoStream, {
        mimeType,
        videoBitsPerSecond: 4_000_000,
      });
    } catch {
      try {
        recorder = new MediaRecorder(videoStream, { mimeType });
      } catch {
        recorder = new MediaRecorder(videoStream);
      }
    }

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data?.size) chunks.push(e.data);
    };

    // Encode phase needs ~DURATION_SEC + margin of wall clock
    const encodeBudget = Math.max(
      (DURATION_SEC + 8) * 1000,
      HARD_TIMEOUT_MS - (Date.now() - started) - 5_000,
    );
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
      }, encodeBudget);
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

    recorder.start(100);
    report(0.48);

    const n = Math.max(1, images.length);
    const framesPerScene = TOTAL_FRAMES / n;
    const crossfadeFrames = Math.min(18, Math.floor(framesPerScene * 0.25));

    // REAL-TIME PACING: each frame waits ~FRAME_MS so MediaRecorder
    // records a true ~20s video instead of a 2s burst.
    for (let i = 0; i < TOTAL_FRAMES; i++) {
      if (Date.now() - started > HARD_TIMEOUT_MS - 6_000) {
        // Safety: finish remaining without full waits
        for (let j = i; j < TOTAL_FRAMES; j++) {
          const t = j / (TOTAL_FRAMES - 1);
          const sceneF = t * n;
          const si = Math.min(n - 1, Math.floor(sceneF));
          const local = sceneF - si;
          ctx.fillStyle = "#05040e";
          ctx.fillRect(0, 0, W, H);
          coverDraw(ctx, images[si]!, 1.08 + local * 0.08, 0, 0);
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

      // Smooth Ken Burns
      const zoom = 1.04 + easeInOut(local) * 0.12;
      const panX = Math.sin((si + 1) * 1.4) * (easeInOut(local) - 0.5) * 1.6;
      const panY = Math.cos((si + 1) * 1.1) * (easeInOut(local) - 0.5) * 1.2;

      ctx.fillStyle = "#05040e";
      ctx.fillRect(0, 0, W, H);
      coverDraw(ctx, img, zoom, panX, panY);

      if (si < n - 1 && local > 1 - crossfadeFrames / framesPerScene) {
        const fade = easeInOut(
          (local - (1 - crossfadeFrames / framesPerScene)) / (crossfadeFrames / framesPerScene),
        );
        ctx.save();
        ctx.globalAlpha = fade;
        coverDraw(ctx, next, 1.04, 0, 0);
        ctx.restore();
      }

      vignette(ctx);

      // Cinematic letterbox
      const bar = Math.round(H * 0.06);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, bar);
      ctx.fillRect(0, H - bar, W, bar);

      const cap = captions[Math.min(captions.length - 1, si)] || captions[0] || title;
      const capA =
        local < 0.12 ? easeInOut(local / 0.12) : local > 0.88 ? easeInOut((1 - local) / 0.12) : 1;
      drawCaption(ctx, String(cap).slice(0, 72), capA);

      if (i % 4 === 0) report(0.48 + (i / TOTAL_FRAMES) * 0.5);

      // Critical: real-time wait so duration ≈ 20s
      await waitFrame(FRAME_MS);
    }

    report(0.98);
    await waitFrame(200);
    try {
      recorder.stop();
    } catch {
      /* */
    }
    videoStream.getTracks().forEach((t) => t.stop());

    const blob = await done;
    report(1);
    if (blob.size > 0) return { blob, ext };
    const emergency = await emergencyBlob(ext, mimeType);
    return { blob: emergency, ext };
  } catch (e) {
    console.warn("[Zeros] video pipeline error, emergency fallback", e);
    const emergency = await emergencyBlob(ext, mimeType);
    report(1);
    return { blob: emergency, ext };
  }
}
