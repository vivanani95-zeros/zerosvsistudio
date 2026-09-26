import type { SongSpec } from "@/lib/song";

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
  // Truncated JSON — try to close open braces/brackets roughly
  if (depth > 0) {
    let partial = text.slice(start);
    // drop trailing incomplete string
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

function normalizeLyrics(raw: unknown): { section: string; lines: string[] }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s, i) => ({
      section: asString(s.section, `Section ${i + 1}`),
      lines: Array.isArray(s.lines)
        ? s.lines.filter((l): l is string => typeof l === "string" && l.trim().length > 0)
        : typeof s.lines === "string"
          ? [s.lines]
          : [],
    }))
    .filter((s) => s.lines.length > 0);
}

function normalizeChords(raw: unknown): string[][] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is unknown[] => Array.isArray(c))
    .map((c) => c.filter((n): n is string => typeof n === "string" && n.trim().length > 0))
    .filter((c) => c.length > 0);
}

function normalizeMelody(raw: unknown): { note: string; start: number; dur: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .map((m) => ({
      note: asString(m.note, "C4"),
      start: asNumber(m.start, 0, 0, 64),
      dur: asNumber(m.dur, 0.5, 0.05, 8),
    }));
}

function defaultSpec(prompt?: string): SongSpec {
  const title = (prompt ?? "Zeros Track").trim().slice(0, 48) || "Zeros Track";
  return {
    title,
    bpm: 100,
    durationSec: 180,
    style: "modern cinematic pop",
    voice: "Puck",
    vocalStyle: "cinematic",
    lyrics: [
      { section: "Verse 1", lines: ["I woke up chasing signals in the night", "Every city light became a guiding line"] },
      { section: "Pre-Chorus", lines: ["Hold the beat, don't let it fall", "We rise together through it all"] },
      { section: "Chorus", lines: ["This is our sound, this is our fire", "Turn it up higher, take me higher"] },
      { section: "Verse 2", lines: ["Static fades when the melody lands", "Heart in the pocket, world in our hands"] },
      { section: "Chorus", lines: ["This is our sound, this is our fire", "Turn it up higher, take me higher"] },
      { section: "Bridge", lines: ["Quiet for a second, then we explode", "Every broken piece becomes the code"] },
      { section: "Final Chorus", lines: ["This is our sound, this is our fire", "Turn it up higher, take me higher"] },
    ],
    chords: [
      ["C3", "E3", "G3"],
      ["G2", "B2", "D3"],
      ["A2", "C3", "E3"],
      ["F2", "A2", "C3"],
    ],
    melody: [
      { note: "E4", start: 0, dur: 0.5 },
      { note: "G4", start: 0.5, dur: 0.5 },
      { note: "A4", start: 1, dur: 1 },
      { note: "G4", start: 2, dur: 0.5 },
      { note: "E4", start: 2.5, dur: 1.5 },
    ],
    drums: { kick: [0, 2], snare: [1, 3], hat: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] },
    arrangement: {
      seed: Math.floor(Math.random() * 1e9),
      drumStyle: "pop-rock",
      bassStyle: "sub",
      leadStyle: "piano",
      textureStyle: "pads",
      swing: 0.08,
    },
  };
}

/**
 * Parse AI song response robustly:
 * - ```json fences
 * - bare JSON objects
 * - partially truncated JSON (best-effort repair)
 * - falls back to a complete default spec so rendering never hard-fails
 */
export function parseSongSpecFromResponse(full: string, prompt?: string): SongSpec {
  const raw = extractJsonObject(full);
  if (!raw) return defaultSpec(prompt);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return defaultSpec(prompt);
  }

  const lyrics = normalizeLyrics(parsed.lyrics);
  const chords = normalizeChords(parsed.chords);
  const melody = normalizeMelody(parsed.melody);
  const arr = parsed.arrangement && typeof parsed.arrangement === "object"
    ? (parsed.arrangement as Record<string, unknown>)
    : {};

  const drumsRaw = parsed.drums && typeof parsed.drums === "object"
    ? (parsed.drums as Record<string, unknown>)
    : {};

  const spec: SongSpec = {
    title: asString(parsed.title, prompt?.slice(0, 48) || "Zeros Track"),
    bpm: asNumber(parsed.bpm, 100, 68, 175),
    durationSec: asNumber(parsed.durationSec, 200, 36, 240),
    style: asString(parsed.style, "modern pop"),
    voice: asString(parsed.voice, "Puck"),
    vocalStyle: asString(parsed.vocalStyle, "cinematic"),
    lyrics: lyrics.length ? lyrics : defaultSpec(prompt).lyrics,
    chords: chords.length ? chords : defaultSpec(prompt).chords,
    melody: melody.length ? melody : defaultSpec(prompt).melody,
    drums: {
      kick: Array.isArray(drumsRaw.kick) ? drumsRaw.kick.filter((n): n is number => typeof n === "number") : [0, 2],
      snare: Array.isArray(drumsRaw.snare) ? drumsRaw.snare.filter((n): n is number => typeof n === "number") : [1, 3],
      hat: Array.isArray(drumsRaw.hat) ? drumsRaw.hat.filter((n): n is number => typeof n === "number") : [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
    },
    arrangement: {
      seed: asNumber(arr.seed, Math.floor(Math.random() * 1e9), 0, 2_147_483_647),
      drumStyle: asString(arr.drumStyle, "pop-rock"),
      bassStyle: asString(arr.bassStyle, "sub"),
      leadStyle: asString(arr.leadStyle, "piano"),
      textureStyle: asString(arr.textureStyle, "pads"),
      swing: asNumber(arr.swing, 0.1, 0, 0.35),
    },
  };

  return spec;
}
