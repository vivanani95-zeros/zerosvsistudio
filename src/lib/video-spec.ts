/**
 * VideoSpec — structured brief for Opus-style code-to-video motion graphics.
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
  const seed = Math.floor(Math.random() * 1e9);
  // 50s default film with unique scene backgrounds
  return {
    title,
    durationSec: 50,
    fps: 24,
    width: 1280,
    height: 720,
    script: `Detailed plan: Hook on "${title}" with sparse geometry; build density with glass and type; peak with graph/impact; resolve into calm end card. Unique palette per beat.`,
    style: "premium cinematic 2D · unique per scene",
    background: "#0a0c18",
    seed,
    scenes: [
      {
        startMs: 0, endMs: 6000, label: "intro", ease: "easeOut", background: "#0a1020",
        layers: [
          { type: "particles", count: 22, color: "#5b8cff", speed: 0.25 },
          { type: "shape", shape: "orb", x: 0.55, y: 0.15, w: 0.45, h: 0.45, color: "rgba(80,120,255,0.35)", fadeInMs: 400 },
          { type: "shape", shape: "circle", x: 0.12, y: 0.55, w: 0.12, h: 0.12, color: "rgba(110,231,255,0.2)", fadeInMs: 500 },
          { type: "text", text: title, x: 0.5, y: 0.42, fontSize: 52, color: "#f4f6ff", align: "center", weight: 750, fadeInMs: 350 },
          { type: "text", text: "A new chapter", x: 0.5, y: 0.54, fontSize: 20, color: "#8aa0d8", align: "center", weight: 500, fadeInMs: 600 },
        ],
      },
      {
        startMs: 6000, endMs: 14000, label: "build", ease: "easeInOut", background: "#120a18",
        layers: [
          { type: "particles", count: 18, color: "#c084fc", speed: 0.4 },
          { type: "shape", shape: "glass", x: 0.1, y: 0.25, w: 0.8, h: 0.42, color: "rgba(255,255,255,0.05)", stroke: "rgba(200,160,255,0.25)", strokeWidth: 1, fadeInMs: 300 },
          { type: "shape", shape: "rect", x: 0.08, y: 0.12, w: 0.08, h: 0.08, color: "rgba(192,132,252,0.35)", rotate: 12, fadeInMs: 400 },
          { type: "text", text: "The old path ends here", x: 0.5, y: 0.42, fontSize: 32, color: "#f0e8ff", align: "center", weight: 650, fadeInMs: 350 },
          { type: "text", text: "Clarity over chaos", x: 0.5, y: 0.54, fontSize: 18, color: "#b8a0d8", align: "center", weight: 450, fadeInMs: 500 },
        ],
      },
      {
        startMs: 14000, endMs: 24000, label: "rise", ease: "easeOut", background: "#08141c",
        layers: [
          { type: "particles", count: 30, color: "#34d399", speed: 0.55 },
          { type: "shape", shape: "rounded", x: 0.15, y: 0.2, w: 0.7, h: 0.18, color: "rgba(52,211,153,0.12)", stroke: "rgba(52,211,153,0.3)", strokeWidth: 1, fadeInMs: 250 },
          { type: "shape", shape: "circle", x: 0.75, y: 0.6, w: 0.18, h: 0.18, color: "rgba(52,211,153,0.18)", fadeInMs: 400 },
          { type: "text", text: title.slice(0, 36), x: 0.5, y: 0.28, fontSize: 28, color: "#e8fff6", align: "center", weight: 700, fadeInMs: 300 },
          { type: "text", text: "Built different", x: 0.5, y: 0.55, fontSize: 36, color: "#6ee7b7", align: "center", weight: 700, fadeInMs: 450 },
        ],
      },
      {
        startMs: 24000, endMs: 36000, label: "peak", ease: "bounce", background: "#0c1018",
        layers: [
          { type: "particles", count: 40, color: "#38bdf8", speed: 0.7 },
          { type: "graph", style: "bar", points: [{ label: "Before", value: 28 }, { label: "Now", value: 68 }, { label: "Peak", value: 96 }], x: 0.12, y: 0.18, w: 0.76, h: 0.42, color: "#38bdf8", fadeInMs: 400 },
          { type: "text", text: "Results that compound", x: 0.5, y: 0.72, fontSize: 24, color: "#e0f2fe", align: "center", weight: 600, fadeInMs: 500 },
        ],
      },
      {
        startMs: 36000, endMs: 44000, label: "resolve", ease: "easeInOut", background: "#100c14",
        layers: [
          { type: "particles", count: 16, color: "#fbbf24", speed: 0.3 },
          { type: "shape", shape: "pill", x: 0.25, y: 0.38, w: 0.5, h: 0.1, color: "rgba(251,191,36,0.15)", fadeInMs: 300 },
          { type: "shape", shape: "line", x: 0.2, y: 0.55, w: 0.6, h: 0.01, color: "rgba(251,191,36,0.4)", strokeWidth: 2, fadeInMs: 400 },
          { type: "text", text: "Quiet power", x: 0.5, y: 0.42, fontSize: 34, color: "#fef3c7", align: "center", weight: 650, fadeInMs: 350 },
        ],
      },
      {
        startMs: 44000, endMs: 50000, label: "outro", ease: "easeOut", background: "#08060f",
        layers: [
          { type: "text", text: "Made with Zeros", x: 0.5, y: 0.44, fontSize: 38, color: "#d0d8ff", align: "center", weight: 700, fadeInMs: 400 },
          { type: "text", text: "VsiStudio", x: 0.5, y: 0.56, fontSize: 16, color: "#8890b8", align: "center", weight: 450, fadeInMs: 550 },
        ],
      },
    ],
    audio: {
      mood: "cinematic",
      bpm: 96,
      voiceoverLines: [
        { startMs: 500, text: title.slice(0, 40) },
        { startMs: 7000, text: "The old path ends here" },
        { startMs: 15000, text: "Built different" },
        { startMs: 25000, text: "Results that compound" },
        { startMs: 45000, text: "Made with Zeros" },
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
    const endMs = asNumber(o.endMs, startMs + 1000, startMs + 100, durationMs + 2000);
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
  // 40s–120s cinematic range
  const durationSec = asNumber(parsed.durationSec, 50, 40, 120);
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
    fps: 24,
    width: 1280,
    height: 720,
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
