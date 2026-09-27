/**
 * VideoSpec — structured brief for premium cinematic video (Three.js 3D + 2D overlay + audio).
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
      shape: "rect" | "circle" | "rounded" | "line" | "orb" | "glass" | "pill";
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
  return {
    title,
    durationSec: 14,
    fps: 30,
    width: 1920,
    height: 1080,
    script: `Cinematic 3D motion piece: ${title}`,
    style: "premium cinematic 3D + 2D motion graphics",
    background: "#07060f",
    seed: Math.floor(Math.random() * 1e9),
    scenes: [
      {
        startMs: 0,
        endMs: 2800,
        label: "Title",
        ease: "easeOut",
        layers: [
          { type: "shape", shape: "orb", x: 0.55, y: 0.15, w: 0.5, h: 0.5, color: "rgba(100,80,220,0.45)", fadeInMs: 200 },
          { type: "shape", shape: "orb", x: -0.05, y: 0.5, w: 0.4, h: 0.4, color: "rgba(40,120,220,0.35)", fadeInMs: 400 },
          { type: "text", text: title, x: 0.5, y: 0.44, fontSize: 72, color: "#f6f7ff", align: "center", weight: 700, fadeInMs: 500 },
          { type: "text", text: "by Zeros · 3D cinematic", x: 0.5, y: 0.58, fontSize: 22, color: "#9aabff", align: "center", weight: 500, fadeInMs: 800 },
        ],
      },
      {
        startMs: 2800,
        endMs: 9000,
        label: "Body",
        ease: "easeInOut",
        layers: [
          { type: "particles", count: 55, color: "#7b93ff", speed: 0.35 },
          { type: "shape", shape: "glass", x: 0.12, y: 0.22, w: 0.76, h: 0.52, color: "rgba(255,255,255,0.06)", stroke: "rgba(160,180,255,0.3)", strokeWidth: 1.5, fadeInMs: 350 },
          { type: "text", text: title.slice(0, 42), x: 0.5, y: 0.4, fontSize: 44, color: "#eef0ff", align: "center", weight: 650, fadeInMs: 450 },
          { type: "text", text: "Three.js depth · Real audio · Pure code", x: 0.5, y: 0.54, fontSize: 20, color: "#a8b4e0", align: "center", weight: 450, fadeInMs: 650 },
          { type: "shape", shape: "pill", x: 0.35, y: 0.62, w: 0.3, h: 0.055, color: "rgba(120,140,255,0.2)", stroke: "rgba(160,180,255,0.4)", strokeWidth: 1, fadeInMs: 700 },
        ],
      },
      {
        startMs: 9000,
        endMs: 14000,
        label: "Outro",
        ease: "easeOut",
        layers: [
          { type: "shape", shape: "orb", x: 0.3, y: 0.25, w: 0.4, h: 0.4, color: "rgba(90,70,200,0.3)", fadeInMs: 200 },
          { type: "text", text: "Made with Zeros", x: 0.5, y: 0.46, fontSize: 40, color: "#d0d8ff", align: "center", weight: 650, fadeInMs: 350 },
          { type: "text", text: "World's funniest AI · VsiStudio", x: 0.5, y: 0.56, fontSize: 18, color: "#8a96c8", align: "center", weight: 450, fadeInMs: 550 },
        ],
      },
    ],
    audio: {
      mood: "cinematic",
      bpm: 96,
      voiceoverLines: [
        { startMs: 400, text: title.slice(0, 48) },
        { startMs: 3200, text: "Depth. Motion. Sound." },
        { startMs: 9500, text: "Made with Zeros" },
      ],
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
  let depth = 0,
    inString = false,
    escaped = false;
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
  const shapes = ["rect", "circle", "rounded", "line", "orb", "glass", "pill"];
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
        fontSize: asNumber(o.fontSize, 42, 12, 160),
        color: asString(o.color, "#f4f5ff"),
        align: (["left", "center", "right"].includes(asString(o.align, "center"))
          ? asString(o.align, "center")
          : "center") as "left" | "center" | "right",
        weight: asNumber(o.weight, 650, 300, 900),
        fadeInMs: asNumber(o.fadeInMs, 400, 0, 5000),
        fadeOutMs: asNumber(o.fadeOutMs, 300, 0, 5000),
      });
    } else if (type === "shape") {
      const sh = asString(o.shape, "rounded");
      out.push({
        type: "shape",
        shape: (shapes.includes(sh) ? sh : "rounded") as "rect" | "circle" | "rounded" | "line" | "orb" | "glass" | "pill",
        x: asNumber(o.x, 0.1, 0, 1),
        y: asNumber(o.y, 0.1, 0, 1),
        w: asNumber(o.w, 0.3, 0.01, 1),
        h: asNumber(o.h, 0.2, 0.01, 1),
        color: asString(o.color, "rgba(255,255,255,0.08)"),
        stroke: typeof o.stroke === "string" ? o.stroke : undefined,
        strokeWidth: asNumber(o.strokeWidth, 0, 0, 20),
        rotate: asNumber(o.rotate, 0, -360, 360),
        fadeInMs: asNumber(o.fadeInMs, 350, 0, 5000),
        fadeOutMs: asNumber(o.fadeOutMs, 250, 0, 5000),
      });
    } else if (type === "particles") {
      out.push({
        type: "particles",
        count: asNumber(o.count, 48, 8, 120),
        color: asString(o.color, "#7b93ff"),
        speed: asNumber(o.speed, 0.4, 0.05, 3),
      });
    } else if (type === "gradient") {
      out.push({
        type: "gradient",
        from: asString(o.from, "#07060f"),
        to: asString(o.to, "#14102a"),
        angle: asNumber(o.angle, 155, 0, 360),
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
    if (!layers.length) continue;
    scenes.push({
      startMs,
      endMs,
      label: typeof o.label === "string" ? o.label : undefined,
      background: typeof o.background === "string" ? o.background : undefined,
      layers,
      ease: (["linear", "easeIn", "easeOut", "easeInOut", "bounce"].includes(asString(o.ease, "easeInOut"))
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
  const audioRaw = parsed.audio && typeof parsed.audio === "object" ? (parsed.audio as Record<string, unknown>) : {};
  const voRaw = Array.isArray(audioRaw.voiceoverLines) ? audioRaw.voiceoverLines : [];
  const voiceoverLines = voRaw
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    .map((v) => ({ startMs: asNumber(v.startMs, 0, 0, durationMs), text: asString(v.text, "") }))
    .filter((v) => v.text.length > 0);
  let width = asNumber(parsed.width, 1920, 1280, 3840);
  let height = asNumber(parsed.height, 1080, 720, 2160);
  if (width > 2560 || height > 1440) {
    width = 1920;
    height = 1080;
  }
  return {
    title: asString(parsed.title, fallback.title),
    durationSec,
    fps: asNumber(parsed.fps, 30, 24, 30),
    width,
    height,
    script: asString(parsed.script, fallback.script),
    style: asString(parsed.style, fallback.style ?? "cinematic"),
    background: asString(parsed.background, fallback.background ?? "#07060f"),
    scenes,
    seed: asNumber(parsed.seed, fallback.seed ?? 1, 0, 2_147_483_647),
    audio: {
      mood: (["upbeat", "cinematic", "ambient", "playful", "tense", "warm"].includes(asString(audioRaw.mood, "cinematic"))
        ? asString(audioRaw.mood, "cinematic")
        : "cinematic") as NonNullable<VideoAudio["mood"]>,
      bpm: asNumber(audioRaw.bpm, 96, 60, 160),
      voiceoverLines: voiceoverLines.length ? voiceoverLines : fallback.audio?.voiceoverLines ?? [],
    },
  };
}
