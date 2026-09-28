/**
 * VideoSpec — structured brief for pure 2D premium cinematic video.
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
    }
  | {
      type: "image";
      src: string;
      x?: number;
      y?: number;
      w?: number;
      h?: number;
      fadeInMs?: number;
      fadeOutMs?: number;
    }
  | {
      type: "logo";
      src: string;
      x?: number;
      y?: number;
      w?: number;
      h?: number;
      fadeInMs?: number;
      fadeOutMs?: number;
    }
  | {
      type: "graph";
      style?: "bar" | "line";
      points?: { label?: string; value: number }[];
      x?: number;
      y?: number;
      w?: number;
      h?: number;
      color?: string;
      fadeInMs?: number;
      fadeOutMs?: number;
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
    durationSec: 16,
    fps: 15,
    width: 960,
    height: 540,
    script: `Studio product trailer: ${title}`,
    style: "premium cinematic 2D",
    background: "#07060f",
    seed: Math.floor(Math.random() * 1e9),
    scenes: [
      {
        startMs: 0, endMs: 2500, label: "Hook", ease: "easeOut",
        layers: [
          { type: "shape", shape: "orb", x: 0.5, y: 0.2, w: 0.5, h: 0.5, color: "rgba(100,80,220,0.45)", fadeInMs: 200 },
          { type: "text", text: title, x: 0.5, y: 0.44, fontSize: 56, color: "#f6f7ff", align: "center", weight: 700, fadeInMs: 300 },
          { type: "text", text: "A new way forward", x: 0.5, y: 0.56, fontSize: 22, color: "#9aabff", align: "center", weight: 500, fadeInMs: 500 },
        ],
      },
      {
        startMs: 2500, endMs: 5500, label: "Problem", ease: "easeInOut",
        layers: [
          { type: "shape", shape: "glass", x: 0.1, y: 0.28, w: 0.8, h: 0.38, color: "rgba(255,255,255,0.05)", stroke: "rgba(160,180,255,0.28)", strokeWidth: 1, fadeInMs: 250 },
          { type: "text", text: "The old way is broken", x: 0.5, y: 0.42, fontSize: 34, color: "#eef0ff", align: "center", weight: 650, fadeInMs: 300 },
          { type: "text", text: "Too slow · Too complex", x: 0.5, y: 0.54, fontSize: 20, color: "#a8b4e0", align: "center", weight: 450, fadeInMs: 450 },
        ],
      },
      {
        startMs: 5500, endMs: 9000, label: "Reveal", ease: "easeOut",
        layers: [
          { type: "text", text: title.slice(0, 36), x: 0.5, y: 0.4, fontSize: 40, color: "#f4f5ff", align: "center", weight: 700, fadeInMs: 300 },
          { type: "text", text: "Built different", x: 0.5, y: 0.52, fontSize: 24, color: "#6ee7ff", align: "center", weight: 600, fadeInMs: 450 },
        ],
      },
      {
        startMs: 9000, endMs: 12500, label: "Feature", ease: "easeInOut",
        layers: [
          { type: "graph", style: "bar", points: [{ label: "Before", value: 28 }, { label: "Now", value: 72 }, { label: "Peak", value: 95 }], x: 0.12, y: 0.2, w: 0.76, h: 0.4, color: "#6ee7ff", fadeInMs: 300 },
          { type: "text", text: "Results that compound", x: 0.5, y: 0.72, fontSize: 24, color: "#eef0ff", align: "center", weight: 600, fadeInMs: 400 },
        ],
      },
      {
        startMs: 12500, endMs: 16000, label: "End card", ease: "easeOut",
        layers: [
          { type: "text", text: "Made with Zeros", x: 0.5, y: 0.46, fontSize: 40, color: "#d0d8ff", align: "center", weight: 700, fadeInMs: 300 },
          { type: "text", text: "VsiStudio", x: 0.5, y: 0.58, fontSize: 18, color: "#8a96c8", align: "center", weight: 450, fadeInMs: 450 },
        ],
      },
    ],
    audio: {
      mood: "cinematic",
      bpm: 96,
      voiceoverLines: [
        { startMs: 400, text: title.slice(0, 40) },
        { startMs: 2800, text: "The old way is broken" },
        { startMs: 6000, text: "Built different" },
        { startMs: 9500, text: "Results that compound" },
        { startMs: 13000, text: "Made with Zeros" },
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
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
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
        align: (["left", "center", "right"].includes(asString(o.align, "center")) ? asString(o.align, "center") : "center") as "left" | "center" | "right",
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
      out.push({ type: "particles", count: asNumber(o.count, 28, 8, 60), color: asString(o.color, "#7b93ff"), speed: asNumber(o.speed, 0.4, 0.05, 3) });
    } else if (type === "gradient") {
      out.push({ type: "gradient", from: asString(o.from, "#07060f"), to: asString(o.to, "#14102a"), angle: asNumber(o.angle, 155, 0, 360) });
    } else if (type === "image" || type === "logo") {
      const src = asString(o.src, "");
      if (!src) continue;
      out.push({
        type: type as "image" | "logo",
        src,
        x: asNumber(o.x, 0.5, 0, 1),
        y: asNumber(o.y, 0.5, 0, 1),
        w: asNumber(o.w, 0.28, 0.05, 1),
        h: asNumber(o.h, 0.2, 0.05, 1),
        fadeInMs: asNumber(o.fadeInMs, 400, 0, 5000),
        fadeOutMs: asNumber(o.fadeOutMs, 300, 0, 5000),
      });
    } else if (type === "graph") {
      const ptsRaw = Array.isArray(o.points) ? o.points : [];
      const points = ptsRaw
        .map((p) => {
          if (typeof p === "number") return { value: p };
          if (p && typeof p === "object") {
            const r = p as Record<string, unknown>;
            return { label: typeof r.label === "string" ? r.label : undefined, value: asNumber(r.value, 0, 0, 1e9) };
          }
          return null;
        })
        .filter((p): p is { label?: string; value: number } => !!p);
      if (!points.length) continue;
      out.push({
        type: "graph",
        style: asString(o.style, "bar") === "line" ? "line" : "bar",
        points,
        x: asNumber(o.x, 0.12, 0, 1),
        y: asNumber(o.y, 0.25, 0, 1),
        w: asNumber(o.w, 0.76, 0.1, 1),
        h: asNumber(o.h, 0.4, 0.1, 1),
        color: asString(o.color, "#6ee7ff"),
        fadeInMs: asNumber(o.fadeInMs, 400, 0, 5000),
        fadeOutMs: asNumber(o.fadeOutMs, 300, 0, 5000),
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
  // Hard clamp so browser encode always finishes
  const durationSec = asNumber(parsed.durationSec, 16, 8, 20);
  const durationMs = durationSec * 1000;
  const scenes = normalizeScenes(parsed.scenes, durationMs);
  const audioRaw = parsed.audio && typeof parsed.audio === "object" ? (parsed.audio as Record<string, unknown>) : {};
  const voRaw = Array.isArray(audioRaw.voiceoverLines) ? audioRaw.voiceoverLines : [];
  const voiceoverLines = voRaw
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    .map((v) => ({ startMs: asNumber(v.startMs, 0, 0, durationMs), text: asString(v.text, "") }))
    .filter((v) => v.text.length > 0);
  return {
    title: asString(parsed.title, fallback.title),
    durationSec,
    fps: 15,
    width: 960,
    height: 540,
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
