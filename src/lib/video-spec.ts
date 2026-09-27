/**
 * VideoSpec — structured brief that Zeros outputs for code-based video generation.
 * Client renderer (canvas + MediaRecorder) turns this into a downloadable WebM/MP4-friendly blob.
 */

export type VideoLayer =
  | {
      type: "text";
      text: string;
      x?: number;
      y?: number;
      fontSize?: number;
      color?: string;
      align?: "left" | "center" | "right";
      weight?: number;
      fadeInMs?: number;
      fadeOutMs?: number;
    }
  | {
      type: "shape";
      shape: "rect" | "circle" | "rounded" | "line";
      x?: number;
      y?: number;
      w?: number;
      h?: number;
      color?: string;
      stroke?: string;
      strokeWidth?: number;
      rotate?: number;
      fadeInMs?: number;
      fadeOutMs?: number;
    }
  | {
      type: "particles";
      count?: number;
      color?: string;
      speed?: number;
    }
  | {
      type: "gradient";
      from?: string;
      to?: string;
      angle?: number;
    };

export type VideoScene = {
  startMs: number;
  endMs: number;
  label?: string;
  background?: string;
  layers: VideoLayer[];
  ease?: "linear" | "easeIn" | "easeOut" | "easeInOut" | "bounce";
};

export type VideoAudio = {
  mood?: "upbeat" | "cinematic" | "ambient" | "playful" | "tense" | "warm";
  bpm?: number;
  voiceoverLines?: { startMs: number; text: string }[];
};

export type VideoSpec = {
  title: string;
  durationSec: number;
  fps: number;
  width: number;
  height: number;
  script: string;
  style?: string;
  background?: string;
  scenes: VideoScene[];
  audio?: VideoAudio;
  seed?: number;
};

export function defaultVideoSpec(prompt?: string): VideoSpec {
  const title = (prompt ?? "Zeros Video").trim().slice(0, 64) || "Zeros Video";
  const durationSec = 12;
  return {
    title,
    durationSec,
    fps: 30,
    width: 1280,
    height: 720,
    script: `Whimsical explainer: ${title}`,
    style: "cinematic motion graphics",
    background: "#0a0a12",
    seed: Math.floor(Math.random() * 1e9),
    scenes: [
      {
        startMs: 0,
        endMs: 2500,
        label: "Title",
        background: "#0a0a12",
        layers: [
          { type: "gradient", from: "#0a0a12", to: "#1a1030", angle: 160 },
          {
            type: "text",
            text: title,
            x: 0.5,
            y: 0.45,
            fontSize: 56,
            color: "#f5f5ff",
            align: "center",
            weight: 700,
            fadeInMs: 400,
          },
          {
            type: "text",
            text: "by Zeros",
            x: 0.5,
            y: 0.58,
            fontSize: 22,
            color: "#8b9cff",
            align: "center",
            fadeInMs: 700,
          },
        ],
      },
      {
        startMs: 2500,
        endMs: 8000,
        label: "Body",
        layers: [
          { type: "gradient", from: "#0f1020", to: "#1a2040", angle: 120 },
          { type: "particles", count: 40, color: "#6b8cff", speed: 0.4 },
          {
            type: "shape",
            shape: "rounded",
            x: 0.15,
            y: 0.28,
            w: 0.7,
            h: 0.44,
            color: "rgba(255,255,255,0.06)",
            stroke: "rgba(140,160,255,0.35)",
            strokeWidth: 2,
            fadeInMs: 300,
          },
          {
            type: "text",
            text: title.slice(0, 48),
            x: 0.5,
            y: 0.42,
            fontSize: 32,
            color: "#eef0ff",
            align: "center",
            weight: 600,
            fadeInMs: 400,
          },
          {
            type: "text",
            text: "Motion · Type · Sound — pure code",
            x: 0.5,
            y: 0.55,
            fontSize: 18,
            color: "#9aa8d8",
            align: "center",
            fadeInMs: 600,
          },
        ],
      },
      {
        startMs: 8000,
        endMs: 12000,
        label: "Outro",
        layers: [
          { type: "gradient", from: "#120818", to: "#0a0a12", angle: 200 },
          {
            type: "text",
            text: "Made with Zeros",
            x: 0.5,
            y: 0.48,
            fontSize: 28,
            color: "#c8d0ff",
            align: "center",
            weight: 600,
            fadeInMs: 300,
          },
        ],
      },
    ],
    audio: {
      mood: "cinematic",
      bpm: 100,
      voiceoverLines: [],
    },
  };
}

function extractJsonObject(text: string): string | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const inner = fenced[1].trim();
    if (inner.startsWith("{")) {
      const nested = extractJsonObject(inner);
      if (nested) return nested;
      return inner;
    }
  }
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  if (depth > 0) {
    let partial = text.slice(start);
    partial = partial.replace(/,\s*"[^"]*$/, "");
    partial = partial.replace(/,\s*$/, "");
    while (depth > 0) {
      partial += "}";
      depth--;
    }
    try {
      JSON.parse(partial);
      return partial;
    } catch {
      return null;
    }
  }
  return null;
}

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function asNumber(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeLayers(raw: unknown): VideoLayer[] {
  if (!Array.isArray(raw)) return [];
  const out: VideoLayer[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const type = asString(o.type, "");
    if (type === "text") {
      out.push({
        type: "text",
        text: asString(o.text, ""),
        x: asNumber(o.x, 0.5, 0, 1),
        y: asNumber(o.y, 0.5, 0, 1),
        fontSize: asNumber(o.fontSize, 32, 10, 120),
        color: asString(o.color, "#ffffff"),
        align: (["left", "center", "right"].includes(asString(o.align, "center"))
          ? asString(o.align, "center")
          : "center") as "left" | "center" | "right",
        weight: asNumber(o.weight, 600, 300, 900),
        fadeInMs: asNumber(o.fadeInMs, 300, 0, 5000),
        fadeOutMs: asNumber(o.fadeOutMs, 200, 0, 5000),
      });
    } else if (type === "shape") {
      out.push({
        type: "shape",
        shape: (["rect", "circle", "rounded", "line"].includes(asString(o.shape, "rect"))
          ? asString(o.shape, "rect")
          : "rect") as "rect" | "circle" | "rounded" | "line",
        x: asNumber(o.x, 0.1, 0, 1),
        y: asNumber(o.y, 0.1, 0, 1),
        w: asNumber(o.w, 0.3, 0.01, 1),
        h: asNumber(o.h, 0.2, 0.01, 1),
        color: asString(o.color, "rgba(255,255,255,0.1)"),
        stroke: typeof o.stroke === "string" ? o.stroke : undefined,
        strokeWidth: asNumber(o.strokeWidth, 0, 0, 20),
        rotate: asNumber(o.rotate, 0, -360, 360),
        fadeInMs: asNumber(o.fadeInMs, 200, 0, 5000),
        fadeOutMs: asNumber(o.fadeOutMs, 200, 0, 5000),
      });
    } else if (type === "particles") {
      out.push({
        type: "particles",
        count: asNumber(o.count, 30, 5, 120),
        color: asString(o.color, "#6b8cff"),
        speed: asNumber(o.speed, 0.5, 0.05, 3),
      });
    } else if (type === "gradient") {
      out.push({
        type: "gradient",
        from: asString(o.from, "#0a0a12"),
        to: asString(o.to, "#1a1030"),
        angle: asNumber(o.angle, 160, 0, 360),
      });
    }
  }
  return out;
}

function normalizeScenes(raw: unknown, durationMs: number): VideoScene[] {
  if (!Array.isArray(raw) || raw.length === 0) return defaultVideoSpec().scenes;
  const scenes: VideoScene[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const startMs = asNumber(o.startMs, 0, 0, durationMs);
    const endMs = asNumber(o.endMs, startMs + 1000, startMs + 100, durationMs + 1000);
    const layers = normalizeLayers(o.layers);
    if (layers.length === 0) continue;
    scenes.push({
      startMs,
      endMs,
      label: typeof o.label === "string" ? o.label : undefined,
      background: typeof o.background === "string" ? o.background : undefined,
      layers,
      ease: (["linear", "easeIn", "easeOut", "easeInOut", "bounce"].includes(
        asString(o.ease, "easeInOut"),
      )
        ? asString(o.ease, "easeInOut")
        : "easeInOut") as VideoScene["ease"],
    });
  }
  return scenes.length ? scenes.sort((a, b) => a.startMs - b.startMs) : defaultVideoSpec().scenes;
}

export function parseVideoSpecFromResponse(full: string, prompt?: string): VideoSpec {
  const fallback = defaultVideoSpec(prompt);
  const raw = extractJsonObject(full);
  if (!raw) return fallback;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return fallback;
  }

  const durationSec = asNumber(parsed.durationSec, fallback.durationSec, 6, 45);
  const durationMs = durationSec * 1000;
  const scenes = normalizeScenes(parsed.scenes, durationMs);

  const audioRaw =
    parsed.audio && typeof parsed.audio === "object"
      ? (parsed.audio as Record<string, unknown>)
      : {};
  const voRaw = Array.isArray(audioRaw.voiceoverLines) ? audioRaw.voiceoverLines : [];
  const voiceoverLines = voRaw
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    .map((v) => ({
      startMs: asNumber(v.startMs, 0, 0, durationMs),
      text: asString(v.text, ""),
    }))
    .filter((v) => v.text.length > 0);

  return {
    title: asString(parsed.title, fallback.title),
    durationSec,
    fps: asNumber(parsed.fps, 30, 24, 30),
    width: asNumber(parsed.width, 1280, 640, 1920),
    height: asNumber(parsed.height, 720, 360, 1080),
    script: asString(parsed.script, fallback.script),
    style: asString(parsed.style, fallback.style ?? "cinematic"),
    background: asString(parsed.background, fallback.background ?? "#0a0a12"),
    scenes,
    seed: asNumber(parsed.seed, fallback.seed ?? 1, 0, 2_147_483_647),
    audio: {
      mood: (["upbeat", "cinematic", "ambient", "playful", "tense", "warm"].includes(
        asString(audioRaw.mood, "cinematic"),
      )
        ? asString(audioRaw.mood, "cinematic")
        : "cinematic") as NonNullable<VideoAudio["mood"]>,
      bpm: asNumber(audioRaw.bpm, 100, 60, 160),
      voiceoverLines,
    },
  };
}
