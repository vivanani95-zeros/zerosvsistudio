/**
 * Zeros Video Engine — peak browser-side video-diffusion approximation (silent).
 *
 * As close as pure Canvas can get to diffusion-like living video:
 *  - Dual-layer flow-field mesh warp (coarse + fine detail motion)
 *  - Temporal feedback buffer (each frame bleeds into the next — coherent motion)
 *  - Dense 32×18 grid → independent motion on fine regions
 *  - 8 AI scene plates, long dissolves, continuous camera
 *  - Film grain, vignette, letterbox, high bitrate
 *  - Real-time pacing so MediaRecorder encodes full duration
 *
 * Note: true latent video diffusion (Runway/Kling) needs a video model API.
 * This is the maximum quality path available fully in-browser.
 */

import { generateImage } from "@/lib/ai-client";
import type { VideoSpec } from "@/lib/video-spec";

const FONT = '"Inter","SF Pro Display","Segoe UI",system-ui,sans-serif';
const W = 1280;
const H = 720;
const FPS = 24;
const DURATION_SEC = 18;
const TOTAL_FRAMES = DURATION_SEC * FPS; // 432
const FRAME_MS = Math.round(1000 / FPS);
const HARD_TIMEOUT_MS = 10 * 60 * 1000;
const PER_IMAGE_TIMEOUT_MS = 48_000;
const SCENE_COUNT = 8;

// Diffusion-like mesh
const GRID_X = 32;
const GRID_Y = 18;
const WARP_COARSE = 16;
const WARP_FINE = 7;
const TEMPORAL_BLEND = 0.22; // feedback strength (coherence)

export type RenderVideoResult = { blob: Blob; ext: "mp4" | "webm" };

function clamp01(t: number) {
  return Math.min(1, Math.max(0, t));
}
function easeInOut(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
function smoothstep(a: number, b: number, x: number) {
  const t = clamp01((x - a) / (b - a || 1));
  return t * t * (3 - 2 * t);
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
  const look =
    "ultra cinematic photoreal film frame, motion-ready living plate, anamorphic bokeh, volumetric haze, teal shadows amber highlights, wet reflections, shallow DOF, 16:9, NO text NO watermark NO logo NO UI NO subtitles";
  const fromScenes = (spec.scenes || [])
    .slice(0, SCENE_COUNT)
    .map((s, i) => {
      const textLayer = s.layers?.find((l) => l.type === "text" && "text" in l);
      const label =
        (textLayer && "text" in textLayer ? String(textLayer.text) : s.label) || `beat ${i + 1}`;
      return `${look}. Continuity shot ${i + 1} of one film about "${title}": ${String(label).slice(0, 90)}.`;
    })
    .filter(Boolean);
  if (fromScenes.length >= 5) return fromScenes;
  return [
    `${look}. Shot 1 establishing night avenue, headlights in fog, "${title}".`,
    `${look}. Shot 2 medium silhouette figure, cold rim light, "${title}".`,
    `${look}. Shot 3 intimate face close-up, soft key + rim, "${title}".`,
    `${look}. Shot 4 walking motion energy, shallow DOF, "${title}".`,
    `${look}. Shot 5 hero object / product reveal, studio edge light, "${title}".`,
    `${look}. Shot 6 emotional peak, strong contrast, "${title}".`,
    `${look}. Shot 7 quiet aftermath, cooler grade, "${title}".`,
    `${look}. Shot 8 final atmosphere hold, empty frame energy, "${title}".`,
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
    setTimeout(() => done(img.complete && img.width > 0 ? img : null), 16_000);
  });
}

function paintFallbackKey(index: number, title: string): HTMLImageElement {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const hues = [195, 205, 215, 230, 245, 200, 220, 235];
  const h0 = hues[index % hues.length]!;
  const grad = g.createRadialGradient(W * 0.32, H * 0.28, 8, W * 0.5, H * 0.55, W * 0.85);
  grad.addColorStop(0, `hsla(${h0},52%,34%,1)`);
  grad.addColorStop(0.5, `hsla(${h0 + 18},48%,12%,1)`);
  grad.addColorStop(1, "#020108");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 6; i++) {
    const ox = W * (0.08 + i * 0.15);
    const oy = H * (0.3 + (i % 3) * 0.18);
    const rg = g.createRadialGradient(ox, oy, 0, ox, oy, 100 + i * 18);
    rg.addColorStop(0, `hsla(${38 + i * 10},92%,72%,0.32)`);
    rg.addColorStop(1, "transparent");
    g.fillStyle = rg;
    g.beginPath();
    g.arc(ox, oy, 130, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = "rgba(235,240,255,0.9)";
  g.font = `700 34px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(title.slice(0, 28) || "Zeros", W / 2, H * 0.74);
  const img = new Image();
  img.src = c.toDataURL("image/png");
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
  deadline: number = Date.now() + HARD_TIMEOUT_MS * 0.42,
): Promise<HTMLImageElement[]> {
  const images: HTMLImageElement[] = [];
  const count = Math.min(SCENE_COUNT, prompts.length);
  for (let i = 0; i < count; i++) {
    if (Date.now() > deadline) {
      for (let j = i; j < count; j++) images.push(await ensureImageReady(paintFallbackKey(j, title)));
      break;
    }
    onProgress?.(0.04 + (i / count) * 0.34);
    let got: HTMLImageElement | null = null;
    try {
      const url = await withTimeout(generateImage(prompts[i]!), PER_IMAGE_TIMEOUT_MS, null as unknown as string);
      if (url) got = await withTimeout(loadImage(url), 15_000, null);
    } catch (e) {
      console.warn("[Zeros] keyframe fail", i, e);
    }
    if (got && got.width > 0) images.push(got);
    else images.push(await ensureImageReady(paintFallbackKey(i, title)));
  }
  if (!images.length) {
    for (let i = 0; i < 4; i++) images.push(await ensureImageReady(paintFallbackKey(i, title)));
  }
  return images;
}

/** Dual-layer flow-field mesh warp — coarse structure + fine detail motion */
function drawWarped(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  time: number,
  zoom: number,
  panX: number,
  panY: number,
  alpha: number,
) {
  if (!img?.width || alpha < 0.01) return;

  const scale = Math.max(W / img.width, H / img.height) * zoom;
  const dw = img.width * scale;
  const dh = img.height * scale;
  const ox = (W - dw) / 2 + panX * Math.max(0, dw - W) * 0.42;
  const oy = (H - dh) / 2 + panY * Math.max(0, dh - H) * 0.42;

  const cellW = dw / GRID_X;
  const cellH = dh / GRID_Y;
  const srcCW = img.width / GRID_X;
  const srcCH = img.height / GRID_Y;

  ctx.save();
  ctx.globalAlpha = alpha;

  for (let gy = 0; gy < GRID_Y; gy++) {
    for (let gx = 0; gx < GRID_X; gx++) {
      const u = gx / GRID_X;
      const v = gy / GRID_Y;

      // Coarse flow (big shapes drift)
      const cx =
        Math.sin(time * 1.4 + u * 5.5 + v * 2.8) * WARP_COARSE +
        Math.cos(time * 0.7 + u * 2.1 - v * 3.6) * (WARP_COARSE * 0.4);
      const cy =
        Math.cos(time * 1.25 + v * 5.2 + u * 2.4) * WARP_COARSE +
        Math.sin(time * 0.9 + v * 2.6 + u * 3.9) * (WARP_COARSE * 0.4);

      // Fine flow (local detail wiggle — diffusion-like micro motion)
      const fx =
        Math.sin(time * 3.6 + u * 14.0 + v * 9.5) * WARP_FINE +
        Math.cos(time * 4.2 + u * 18.0 - v * 11.0) * (WARP_FINE * 0.5);
      const fy =
        Math.cos(time * 3.3 + v * 13.0 + u * 8.0) * WARP_FINE +
        Math.sin(time * 4.0 + v * 16.5 - u * 10.0) * (WARP_FINE * 0.5);

      const adx = cx + fx;
      const ady = cy + fy;

      // Neighbor differential → slight stretch (organic squash)
      const u2 = (gx + 1) / GRID_X;
      const v2 = (gy + 1) / GRID_Y;
      const cx2 = Math.sin(time * 1.4 + u2 * 5.5 + v * 2.8) * WARP_COARSE;
      const cy2 = Math.cos(time * 1.25 + v2 * 5.2 + u * 2.4) * WARP_COARSE;
      const stretchX = 1 + (cx2 - cx) * 0.0018;
      const stretchY = 1 + (cy2 - cy) * 0.0018;

      const dx = ox + gx * cellW + adx;
      const dy = oy + gy * cellH + ady;
      const dww = cellW * stretchX + 1.5;
      const dhh = cellH * stretchY + 1.5;

      try {
        ctx.drawImage(
          img,
          gx * srcCW,
          gy * srcCH,
          srcCW + 0.6,
          srcCH + 0.6,
          dx,
          dy,
          dww,
          dhh,
        );
      } catch {
        /* */
      }
    }
  }

  ctx.restore();
}

function cameraAt(globalT: number, sceneIndex: number) {
  const drift = globalT * Math.PI * 2;
  const zoom = 1.12 + 0.09 * Math.sin(drift * 0.38 + sceneIndex) + globalT * 0.035;
  const panX = 0.52 * Math.sin(drift * 0.24 + sceneIndex * 0.75);
  const panY = 0.34 * Math.cos(drift * 0.19 + sceneIndex * 0.55);
  return { zoom, panX, panY };
}

function filmGrain(ctx: CanvasRenderingContext2D, seed: number) {
  ctx.save();
  ctx.globalAlpha = 0.055;
  for (let i = 0; i < 120; i++) {
    const x = ((seed * 1103515245 + i * 12345) >>> 0) % W;
    const y = ((seed * 214013 + i * 9876) >>> 0) % H;
    const s = 1 + (i % 3);
    ctx.fillStyle = i % 2 ? "#fff" : "#000";
    ctx.fillRect(x, y, s, s);
  }
  ctx.restore();
}

function vignette(ctx: CanvasRenderingContext2D) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.14, W / 2, H / 2, H * 0.95);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.58)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawCaption(ctx: CanvasRenderingContext2D, text: string, alpha: number) {
  if (!text || alpha < 0.04) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `600 22px ${FONT}`;
  const pad = 20;
  const tw = Math.min(W * 0.86, ctx.measureText(text).width + pad * 2);
  const th = 40;
  const tx = (W - tw) / 2;
  const ty = H - 96;
  ctx.beginPath();
  ctx.roundRect(tx, ty, tw, th, 12);
  ctx.fillStyle = "rgba(5,7,14,0.8)";
  ctx.fill();
  ctx.fillStyle = "#eef1ff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, ty + th / 2, tw - pad);
  ctx.restore();
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
    }, 2500);
  });
  recorder.start(40);
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = "#080616";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#c8d0ff";
    ctx.font = `600 30px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("Zeros", W / 2, H / 2);
    await waitFrame(70);
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
    report(0.03);
    const prompts = scenePrompts(spec);
    const images = await generateKeyframes(prompts, title, report, started + HARD_TIMEOUT_MS * 0.4);
    report(0.38);

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Temporal feedback buffer — previous frame for diffusion-like coherence
    const feedback = document.createElement("canvas");
    feedback.width = W;
    feedback.height = H;
    const fctx = feedback.getContext("2d", { alpha: false })!;
    fctx.fillStyle = "#030208";
    fctx.fillRect(0, 0, W, H);

    const videoStream = canvas.captureStream(FPS);
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(videoStream, { mimeType, videoBitsPerSecond: 6_000_000 });
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

    const encodeBudget = Math.max(
      (DURATION_SEC + 14) * 1000,
      HARD_TIMEOUT_MS - (Date.now() - started) - 4000,
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
      }, encodeBudget);
      const finish = () => {
        window.clearTimeout(timer);
        if (chunks.length) resolve(new Blob(chunks, { type: ext === "mp4" ? "video/mp4" : "video/webm" }));
        else void emergencyBlob(ext, mimeType).then(resolve);
      };
      recorder.onerror = finish;
      recorder.onstop = finish;
    });

    recorder.start(80);
    report(0.4);

    const n = Math.max(1, images.length);
    const dissolveRatio = 0.28;

    for (let i = 0; i < TOTAL_FRAMES; i++) {
      if (Date.now() - started > HARD_TIMEOUT_MS - 5000) {
        for (let j = i; j < TOTAL_FRAMES; j++) {
          const gt = j / (TOTAL_FRAMES - 1);
          const si = Math.min(n - 1, Math.floor(gt * n));
          const cam = cameraAt(gt, si);
          ctx.fillStyle = "#030208";
          ctx.fillRect(0, 0, W, H);
          drawWarped(ctx, images[si]!, j / FPS, cam.zoom, cam.panX, cam.panY, 1);
          vignette(ctx);
        }
        break;
      }

      const globalT = i / (TOTAL_FRAMES - 1);
      const scenePos = globalT * n;
      const si = Math.min(n - 1, Math.floor(scenePos));
      const local = scenePos - si;
      const nextI = Math.min(n - 1, si + 1);
      const tSec = i / FPS;

      const cam = cameraAt(globalT, si);
      const camNext = cameraAt(globalT, nextI);

      // Temporal feedback: bleed previous frame for coherent diffusion-like motion
      ctx.globalAlpha = 1;
      ctx.drawImage(feedback, 0, 0);
      ctx.fillStyle = `rgba(3,2,8,${1 - TEMPORAL_BLEND})`;
      ctx.fillRect(0, 0, W, H);

      // Current living plate
      drawWarped(ctx, images[si]!, tSec, cam.zoom, cam.panX, cam.panY, 1);

      if (si < n - 1 && local > 1 - dissolveRatio) {
        const fade = easeInOut((local - (1 - dissolveRatio)) / dissolveRatio);
        drawWarped(ctx, images[nextI]!, tSec + 0.25, camNext.zoom, camNext.panX, camNext.panY, fade);
      }

      vignette(ctx);
      filmGrain(ctx, i * 9973 + 17);

      const bar = Math.round(H * 0.07);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, bar);
      ctx.fillRect(0, H - bar, W, bar);

      const cap = captions[Math.min(captions.length - 1, si)] || captions[0] || title;
      const capA =
        local < 0.1 ? easeInOut(local / 0.1) : local > 0.9 ? easeInOut((1 - local) / 0.1) : 1;
      const dissolveDamp =
        si < n - 1 && local > 1 - dissolveRatio
          ? 1 - smoothstep(1 - dissolveRatio, 1, local) * 0.5
          : 1;
      drawCaption(ctx, String(cap).slice(0, 70), capA * dissolveDamp);

      // Store for next-frame temporal feedback
      fctx.drawImage(canvas, 0, 0);

      if (i % 6 === 0) report(0.4 + (i / TOTAL_FRAMES) * 0.57);

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
    return { blob: await emergencyBlob(ext, mimeType), ext };
  } catch (e) {
    console.warn("[Zeros] video error", e);
    report(1);
    return { blob: await emergencyBlob(ext, mimeType), ext };
  }
}
