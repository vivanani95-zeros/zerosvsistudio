export type SongSpec = {
  title: string;
  bpm: number;
  durationSec: number;
  style?: string;
  voice?: string;
  vocalStyle?: string;
  lyrics: { section: string; lines: string[] }[];
  chords: string[][];
  melody: { note: string; start: number; dur: number }[];
  drums?: { kick?: number[]; snare?: number[]; hat?: number[] };
  arrangement?: {
    seed?: number;
    drumStyle?: string;
    bassStyle?: string;
    leadStyle?: string;
    textureStyle?: string;
    swing?: number;
  };
};

/** Fetches real generated vocal as 24kHz mono PCM. Never blocks forever. */
async function fetchVocal(text: string, voice: string): Promise<Float32Array | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 24000);
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 3500), voice }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { pcm?: string; error?: string };
    if (!json.pcm) return null;
    const bin = atob(json.pcm);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const usable = bytes.length - (bytes.length % 2);
    const ints = new Int16Array(bytes.buffer, 0, usable / 2);
    const out = new Float32Array(ints.length);
    for (let i = 0; i < ints.length; i++) out[i] = (ints[i] ?? 0) / 32768;
    return out;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

const NOTES: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6,
  G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

export function noteToFreq(note: string): number {
  const m = note.trim().match(/^([A-Ga-g][#b]?)(-?\d)$/);
  if (!m) return 440;
  const name = (m[1] ?? "A");
  const pc = NOTES[name.charAt(0).toUpperCase() + name.slice(1)];
  const oct = parseInt(m[2] ?? "4", 10);
  return 440 * Math.pow(2, (((pc ?? 9) + (oct + 1) * 12) - 69) / 12);
}

function env(t: number, dur: number, a = 0.01, d = 0.12, s = 0.65, r = 0.18) {
  if (t < 0) return 0;
  if (t < a) return t / Math.max(a, 1e-4);
  if (t < a + d) return 1 - ((1 - s) * (t - a)) / Math.max(d, 1e-4);
  if (t > dur - r) return Math.max(0, s * ((dur - t) / Math.max(r, 1e-4)));
  return s;
}

function makeRng(seed: number) {
  let x = (seed >>> 0) || 0x9e3779b9;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function hashSeed(...parts: (string | number | undefined)[]): number {
  let h = 2166136261 >>> 0;
  const s = parts.map((p) => String(p ?? "")).join("|") + "|" + Date.now().toString(36) + "|" + Math.random().toString(36);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickVoice(primary: string): string {
  return ["Puck", "Kore", "Charon", "Aoede"].includes(primary) ? primary : "Puck";
}
function backingVoice(primary: string): string {
  return ["Puck", "Kore", "Charon", "Aoede"].find((v) => v !== primary) ?? "Kore";
}

const DRUM_STYLES = [
  "four-on-floor", "breakbeat", "boom-bap", "trap", "half-time",
  "pop-rock", "house", "afro", "techno", "dnb", "latin", "cinematic",
] as const;
const BASS_STYLES = ["sub", "synth", "electric", "picked", "808", "wobble", "cinematic"] as const;
const LEAD_STYLES = ["piano", "pluck", "synth", "guitar", "strings", "bell", "supersaw", "fm"] as const;
const TEXTURE_STYLES = ["pads", "strings", "choir", "ambience", "arp", "guitar", "pluck-cloud", "none"] as const;

const FALLBACK_PROGRESSIONS: string[][][] = [
  [["C3", "E3", "G3"], ["G2", "B2", "D3"], ["A2", "C3", "E3"], ["F2", "A2", "C3"]],
  [["D3", "F3", "A3"], ["Bb2", "D3", "F3"], ["C3", "E3", "G3"], ["A2", "C3", "E3"]],
  [["E3", "G3", "B3"], ["C3", "E3", "G3"], ["A2", "C3", "E3"], ["B2", "D3", "F#3"]],
  [["F2", "A2", "C3"], ["C3", "E3", "G3"], ["D3", "F3", "A3"], ["Bb2", "D3", "F3"]],
  [["G2", "B2", "D3"], ["E3", "G3", "B3"], ["C3", "E3", "G3"], ["D3", "F#3", "A3"]],
  [["A2", "C3", "E3"], ["F2", "A2", "C3"], ["C3", "E3", "G3"], ["G2", "B2", "D3"]],
  [["Bb2", "D3", "F3"], ["Eb3", "G3", "Bb3"], ["F2", "A2", "C3"], ["G2", "Bb2", "D3"]],
  [["C#3", "E3", "G#3"], ["F#2", "A#2", "C#3"], ["B2", "D#3", "F#3"], ["G#2", "C3", "D#3"]],
];

function sectionKind(name: string, bar: number, bars: number): "intro" | "verse" | "build" | "chorus" | "bridge" | "outro" {
  const n = name.toLowerCase();
  if (/intro|open/.test(n)) return "intro";
  if (/outro|end|fade/.test(n)) return "outro";
  if (/bridge|break|middle/.test(n)) return "bridge";
  if (/pre|build|rise/.test(n)) return "build";
  if (/chorus|hook|drop|refrain/.test(n)) return "chorus";
  if (/verse/.test(n)) return "verse";
  const p = bar / Math.max(1, bars);
  if (p < 0.12) return "intro";
  if (p > 0.88) return "outro";
  if (p > 0.55 && p < 0.7) return "bridge";
  if (p > 0.35 && p < 0.5) return "build";
  if (Math.floor(bar / 8) % 2 === 1) return "chorus";
  return "verse";
}

function intensityFor(kind: ReturnType<typeof sectionKind>): number {
  switch (kind) {
    case "intro": return 0.28;
    case "verse": return 0.62;
    case "build": return 0.88;
    case "chorus": return 1;
    case "bridge": return 0.55;
    case "outro": return 0.38;
  }
}

/**
 * Production offline renderer — unique arrangement every call.
 * Layered drums, bass, pads, leads, textures + optional AI vocals.
 */
export async function renderSong(spec: SongSpec): Promise<Blob> {
  const sampleRate = 24000;
  const duration = Math.min(240, Math.max(36, spec.durationSec || 200));
  const bpm = Math.min(175, Math.max(68, spec.bpm || 100));
  const beat = 60 / bpm;
  const len = Math.floor(duration * sampleRate);
  const buf = new Float32Array(len);

  const add = (i: number, v: number) => {
    if (i >= 0 && i < len) buf[i] = (buf[i] ?? 0) + v;
  };

  const lyricFingerprint = (spec.lyrics ?? []).map((s) => s.section + (s.lines?.[0] ?? "")).join("~");
  const seed =
    ((spec.arrangement?.seed ?? 0) ^
      hashSeed(spec.title, lyricFingerprint, spec.style, spec.bpm, Math.random())) >>>
    0;
  const rng = makeRng(seed);
  const rng2 = makeRng(seed ^ 0xa5a5a5a5);

  const swing = Math.min(0.38, Math.max(0, spec.arrangement?.swing ?? rng() * 0.22));
  const drumStyle =
    spec.arrangement?.drumStyle && DRUM_STYLES.includes(spec.arrangement.drumStyle as (typeof DRUM_STYLES)[number])
      ? spec.arrangement.drumStyle
      : DRUM_STYLES[Math.floor(rng() * DRUM_STYLES.length)]!;
  const bassStyle =
    spec.arrangement?.bassStyle && BASS_STYLES.includes(spec.arrangement.bassStyle as (typeof BASS_STYLES)[number])
      ? spec.arrangement.bassStyle
      : BASS_STYLES[Math.floor(rng() * BASS_STYLES.length)]!;
  const leadStyle =
    spec.arrangement?.leadStyle && LEAD_STYLES.includes(spec.arrangement.leadStyle as (typeof LEAD_STYLES)[number])
      ? spec.arrangement.leadStyle
      : LEAD_STYLES[Math.floor(rng() * LEAD_STYLES.length)]!;
  const textureStyle =
    spec.arrangement?.textureStyle && TEXTURE_STYLES.includes(spec.arrangement.textureStyle as (typeof TEXTURE_STYLES)[number])
      ? spec.arrangement.textureStyle
      : TEXTURE_STYLES[Math.floor(rng() * TEXTURE_STYLES.length)]!;

  const wave = (type: string, ph: number, t: number, freq: number): number => {
    if (type === "sine") return Math.sin(2 * Math.PI * ph);
    if (type === "saw") return 2 * ph - 1;
    if (type === "square") return ph < 0.5 ? 1 : -1;
    if (type === "tri") return 4 * Math.abs(ph - 0.5) - 1;
    if (type === "supersaw") {
      let v = 0;
      for (let k = -2; k <= 2; k++) {
        const p = ((t * freq * Math.pow(2, k * 0.012)) % 1 + 1) % 1;
        v += 2 * p - 1;
      }
      return v / 5;
    }
    if (type === "fm") {
      const mod = Math.sin(2 * Math.PI * t * freq * 2.01) * 2.2;
      return Math.sin(2 * Math.PI * ph + mod);
    }
    return Math.sin(2 * Math.PI * ph);
  };

  const tone = (
    startSec: number,
    durSec: number,
    freq: number,
    gain: number,
    type: string,
    detune = 0,
    attack = 0.01,
    release = 0.15,
  ) => {
    const s0 = Math.floor(startSec * sampleRate);
    const n = Math.floor(Math.max(0.02, durSec) * sampleRate);
    const f = freq * Math.pow(2, detune / 1200);
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      const ph = (t * f) % 1;
      const v = wave(type, ph < 0 ? ph + 1 : ph, t, f);
      add(s0 + i, v * gain * env(t, durSec, attack, Math.min(0.28, durSec * 0.2), 0.7, Math.min(release, durSec * 0.4)));
    }
  };

  const delayedTone = (
    startSec: number,
    durSec: number,
    freq: number,
    gain: number,
    type: string,
    delaySec: number,
    feedback: number,
  ) => {
    tone(startSec, durSec, freq, gain, type, (rng2() - 0.5) * 8, 0.006, 0.14);
    tone(startSec + delaySec, durSec * 0.85, freq, gain * feedback, type, (rng2() - 0.5) * 12, 0.01, 0.2);
    tone(startSec + delaySec * 2, durSec * 0.55, freq, gain * feedback * 0.45, type, (rng2() - 0.5) * 14, 0.02, 0.25);
  };

  const kick = (startSec: number, power = 0.9) => {
    const s0 = Math.floor(startSec * sampleRate);
    const n = Math.floor(0.32 * sampleRate);
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      const body = Math.sin(2 * Math.PI * (150 * Math.exp(-t * 22) + 38) * t);
      const click = Math.sin(2 * Math.PI * 1200 * t) * Math.exp(-t * 80) * 0.35;
      add(s0 + i, (body + click) * power * Math.exp(-t * 8.5));
    }
  };

  const snare = (startSec: number, power = 0.36) => {
    const s0 = Math.floor(startSec * sampleRate);
    const n = Math.floor(0.24 * sampleRate);
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      const noise = (rng() * 2 - 1) * Math.exp(-t * 16);
      const toneBody = Math.sin(2 * Math.PI * 195 * t) * Math.exp(-t * 22);
      add(s0 + i, (noise * 0.85 + toneBody * 0.35) * power);
    }
  };

  const hat = (startSec: number, power = 0.1, open = false) => {
    const s0 = Math.floor(startSec * sampleRate);
    const n = Math.floor((open ? 0.14 : 0.055) * sampleRate);
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      const decay = open ? 28 : 70;
      add(s0 + i, (rng() * 2 - 1) * power * Math.exp(-t * decay));
    }
  };

  const clap = (startSec: number) => {
    for (let k = 0; k < 4; k++) snare(startSec + k * 0.009, 0.1);
  };

  const riser = (startSec: number, durSec: number, power: number) => {
    const s0 = Math.floor(startSec * sampleRate);
    const n = Math.floor(durSec * sampleRate);
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      const p = t / durSec;
      const noise = (rng() * 2 - 1) * p * p;
      const sweep = Math.sin(2 * Math.PI * (80 + p * 900) * t) * p * 0.4;
      add(s0 + i, (noise * 0.12 + sweep * 0.08) * power);
    }
  };

  const impact = (startSec: number, power = 0.5) => {
    kick(startSec, power);
    snare(startSec, power * 0.4);
    const s0 = Math.floor(startSec * sampleRate);
    for (let i = 0; i < Math.floor(0.4 * sampleRate); i++) {
      const t = i / sampleRate;
      add(s0 + i, Math.sin(2 * Math.PI * (60 * Math.exp(-t * 6)) * t) * power * 0.5 * Math.exp(-t * 4));
    }
  };

  const progIndex = Math.floor(rng() * FALLBACK_PROGRESSIONS.length);
  const chords =
    spec.chords?.length && spec.chords.some((c) => c.length >= 2)
      ? spec.chords
      : FALLBACK_PROGRESSIONS[progIndex]!;
  const melody = spec.melody?.length ? spec.melody : [];
  const drums = {
    kick: spec.drums?.kick?.length ? spec.drums.kick : [0, 2],
    snare: spec.drums?.snare?.length ? spec.drums.snare : [1, 3],
    hat: spec.drums?.hat?.length
      ? spec.drums.hat
      : [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
  };

  const barLen = 4 * beat;
  const bars = Math.floor(duration / barLen);
  const melodyBars = Math.max(
    1,
    Math.ceil((melody.reduce((mx, n) => Math.max(mx, n.start + n.dur), 0) || 4) / 4),
  );

  const playDrums = (barStart: number, bar: number, intensity: number, kind: ReturnType<typeof sectionKind>) => {
    const shift = swing * beat * 0.4;
    const i = intensity * (kind === "intro" ? 0.5 : kind === "outro" ? 0.6 : 1);
    if (kind === "intro" && bar < 2) {
      for (let b = 0; b < 4; b++) hat(barStart + b * beat, 0.05 * i);
      return;
    }

    if (drumStyle === "four-on-floor" || drumStyle === "house") {
      [0, 1, 2, 3].forEach((b) => kick(barStart + b * beat + (b % 2 ? shift * 0.3 : 0), 0.85 * i));
      [1, 3].forEach((b) => clap(barStart + b * beat));
      for (let b = 0; b < 8; b++) hat(barStart + b * (beat / 2) + (b % 2 ? shift : 0), 0.085 * i, b % 4 === 3);
    } else if (drumStyle === "trap") {
      [0, 1.5, 2.75].forEach((b) => kick(barStart + b * beat, 0.95 * i));
      [1, 3].forEach((b) => snare(barStart + b * beat, 0.38 * i));
      for (let b = 0; b < 16; b++) hat(barStart + b * (beat / 4), 0.06 * i, b % 8 === 7);
    } else if (drumStyle === "breakbeat" || drumStyle === "boom-bap") {
      drums.kick.forEach((b) => kick(barStart + b * beat, 0.84 * i));
      drums.snare.forEach((b) => snare(barStart + b * beat, 0.4 * i));
      drums.hat.forEach((b) => hat(barStart + b * beat + (b % 1 ? shift : 0), 0.09 * i));
      if (bar % 4 === 3) kick(barStart + 3.5 * beat, 0.55 * i);
    } else if (drumStyle === "half-time" || drumStyle === "cinematic") {
      kick(barStart, 0.9 * i);
      snare(barStart + 2 * beat, 0.42 * i);
      for (let b = 0; b < 4; b++) hat(barStart + b * beat, 0.07 * i);
      if (kind === "chorus") kick(barStart + 1.5 * beat, 0.5 * i);
    } else if (drumStyle === "techno") {
      [0, 1, 2, 3].forEach((b) => kick(barStart + b * beat, 0.9 * i));
      for (let b = 0; b < 16; b++) hat(barStart + b * (beat / 4), 0.07 * i);
      if (bar % 2 === 1) snare(barStart + 2 * beat, 0.2 * i);
    } else if (drumStyle === "dnb") {
      [0, 1.75, 2.5].forEach((b) => kick(barStart + b * beat, 0.8 * i));
      [1, 3].forEach((b) => snare(barStart + b * beat, 0.36 * i));
      for (let b = 0; b < 16; b++) hat(barStart + b * (beat / 4) + (b % 2 ? shift * 0.5 : 0), 0.07 * i);
    } else if (drumStyle === "latin" || drumStyle === "afro") {
      [0, 1.5, 2, 3.25].forEach((b) => kick(barStart + b * beat, 0.75 * i));
      [1, 2.5].forEach((b) => snare(barStart + b * beat, 0.28 * i));
      for (let b = 0; b < 12; b++) hat(barStart + b * (beat / 3), 0.08 * i, b % 3 === 2);
    } else {
      drums.kick.forEach((b) => kick(barStart + b * beat, 0.82 * i));
      drums.snare.forEach((b) => snare(barStart + b * beat, 0.38 * i));
      drums.hat.forEach((b) => hat(barStart + b * beat, 0.09 * i));
    }

    if (bar % 8 === 7 && kind !== "intro") {
      for (let f = 0; f < 6; f++) snare(barStart + (2 + f * 0.28) * beat, 0.2 * i * ((f + 1) / 6));
      kick(barStart + 3.75 * beat, 0.7 * i);
    }
  };

  const sectionNames = (spec.lyrics ?? []).map((s) => s.section);

  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * barLen;
    const secName = sectionNames[Math.min(sectionNames.length - 1, Math.floor((bar / bars) * sectionNames.length))] ?? "";
    const kind = sectionKind(secName, bar, bars);
    const intensity = intensityFor(kind);
    const chord = chords[bar % chords.length] ?? chords[0]!;

    chord.forEach((n, idx) => {
      const det = (idx - 1) * (4 + Math.floor(rng() * 5));
      const g = 0.042 * intensity;
      tone(t0, barLen * 0.96, noteToFreq(n), g, "tri", det, 0.12, 0.35);
      if (textureStyle === "strings" || textureStyle === "choir" || textureStyle === "pads") {
        tone(t0 + beat * 0.25, barLen * 0.9, noteToFreq(n) * 2, g * 0.45, "sine", det + 3, 0.35, 0.55);
      }
      if (textureStyle === "choir") {
        tone(t0, barLen * 0.95, noteToFreq(n) * 0.5, g * 0.3, "sine", -det, 0.4, 0.6);
      }
    });

    const root = noteToFreq(chord[0] ?? "C3") / 2;
    const bassGain = (bassStyle === "808" ? 0.2 : bassStyle === "wobble" ? 0.16 : 0.14) * intensity;
    const bassWave = bassStyle === "808" || bassStyle === "sub" ? "sine" : bassStyle === "synth" || bassStyle === "wobble" ? "saw" : "square";
    [0, 1, 2, 3].forEach((b, idx) => {
      const vary = idx === 3 && rng() > 0.4 ? 2 ** ((rng() > 0.5 ? 3 : -2) / 12) : 1;
      const dur = bassStyle === "808" ? beat * 0.85 : beat * 0.72;
      tone(t0 + b * beat, dur, root * vary, bassGain, bassWave, 0, 0.006, 0.16);
      if (bassStyle === "wobble") {
        tone(t0 + b * beat, dur * 0.9, root * vary * 1.01, bassGain * 0.4, "saw", 7, 0.01, 0.12);
      }
    });

    if (kind !== "outro" || bar < bars - 2) playDrums(t0, bar, intensity, kind);

    if (kind === "build") riser(t0, barLen, intensity * 0.7);
    if (kind === "chorus" && bar % 8 === 0) impact(t0, 0.55 * intensity);

    if (melody.length && kind !== "intro" && kind !== "bridge") {
      const loopOffset = (bar % melodyBars) * 4;
      const playChance = kind === "chorus" ? 1 : 0.75;
      melody
        .filter((n) => n.start >= loopOffset && n.start < loopOffset + 4 && rng() < playChance)
        .forEach((n) => {
          const leadWave =
            leadStyle === "piano" || leadStyle === "bell"
              ? "sine"
              : leadStyle === "strings"
                ? "tri"
                : leadStyle === "supersaw"
                  ? "supersaw"
                  : leadStyle === "fm"
                    ? "fm"
                    : "saw";
          delayedTone(
            t0 + (n.start - loopOffset) * beat,
            Math.max(0.1, n.dur * beat * 0.85),
            noteToFreq(n.note),
            0.1 * intensity,
            leadWave,
            beat * 0.75,
            0.28,
          );
        });
    }

    if ((textureStyle === "arp" || textureStyle === "guitar" || textureStyle === "pluck-cloud") && kind !== "intro") {
      const arpNotes = chord.slice(0, 3);
      for (let a = 0; a < 8; a++) {
        tone(
          t0 + a * (beat / 2),
          beat * 0.3,
          noteToFreq(arpNotes[a % Math.max(1, arpNotes.length)] ?? chord[0] ?? "C3") * 2,
          0.026 * intensity,
          "tri",
          (rng() - 0.5) * 14,
          0.005,
          0.07,
        );
      }
    }

    if (textureStyle === "ambience" || kind === "intro" || kind === "outro") {
      const s0 = Math.floor(t0 * sampleRate);
      const n = Math.floor(barLen * sampleRate);
      for (let i = 0; i < n; i += 3) {
        add(s0 + i, (rng2() * 2 - 1) * 0.008 * intensity);
      }
    }

    if (bar % 8 === 7) {
      for (let r = 0; r < 12; r++) {
        tone(t0 + (r / 12) * barLen, beat * 0.14, 160 + r * 40, 0.01 * intensity * ((r + 1) / 12), "sine", 0, 0.01, 0.08);
      }
    }

    if (bar % 6 === 5) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  const sections = (spec.lyrics ?? []).filter((s) => s.lines?.length).slice(0, 10);
  if (sections.length) {
    const leadVoice = pickVoice(spec.voice || "Puck");
    const supportVoice = backingVoice(leadVoice);
    const vocalStyle = spec.vocalStyle || "cinematic";
    const styleHint = spec.style ?? "modern pop";

    const leadClips: (Float32Array | null)[] = [];
    for (let i = 0; i < sections.length; i += 2) {
      const batch = sections.slice(i, i + 2);
      const clips = await Promise.all(
        batch.map((s) =>
          fetchVocal(
            `You are a professional ${vocalStyle} recording vocalist for a ${styleHint} production.\n` +
              `Sing this section with emotion, clear pitch, rhythmic pocket, and natural dynamics.\n` +
              `Do NOT speak or narrate. Only sing.\n` +
              `Section: ${s.section}\n${s.lines.join("\n")}`,
            leadVoice,
          ),
        ),
      );
      leadClips.push(...clips);
    }

    const backingIndexes = sections
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => /chorus|hook|drop|final|bridge/i.test(s.section))
      .slice(0, 4);

    const backingClips = await Promise.all(
      backingIndexes.map(({ s }) =>
        fetchVocal(
          `Sing soft backing harmonies and short ad-libs for this ${styleHint} ${s.section}.\n` +
            `Airy sustained vowels, tasteful stacks. Do not speak.\nLyrics:\n${s.lines.join("\n")}`,
          supportVoice,
        ),
      ),
    );

    const vocalStart = Math.min(3.5 * barLen, duration * 0.12);
    const slot = (duration - vocalStart - 4) / Math.max(1, leadClips.length);
    for (let i = 0; i < leadClips.length; i++) {
      const clip = leadClips[i];
      if (!clip) continue;
      const startSec = vocalStart + i * slot;
      const start = Math.floor(startSec * sampleRate);
      const duckEnd = Math.min(len, start + clip.length);
      for (let j = start; j < duckEnd; j++) buf[j] = (buf[j] ?? 0) * 0.68;
      for (let j = 0; j < clip.length; j++) {
        const idx = start + j;
        if (idx >= len) break;
        const v = Math.tanh((clip[j] ?? 0) * 1.15);
        buf[idx] = (buf[idx] ?? 0) + v * 0.92;
      }
    }

    for (let b = 0; b < backingIndexes.length; b++) {
      const clip = backingClips[b];
      if (!clip) continue;
      const sectionIndex = backingIndexes[b]?.i ?? 0;
      const start = Math.floor((vocalStart + sectionIndex * slot * 0.85) * sampleRate);
      for (let j = 0; j < clip.length; j++) {
        const idx = start + j;
        if (idx >= len) break;
        buf[idx] = (buf[idx] ?? 0) + (clip[j] ?? 0) * 0.28;
      }
    }
  }

  const fadeIn = Math.min(1.2 * sampleRate, Math.floor(len * 0.02));
  const fadeOut = Math.min(5 * sampleRate, Math.floor(len * 0.1));
  let peak = 0;
  for (let i = 0; i < len; i++) {
    let v = Math.tanh((buf[i] ?? 0) * 1.15);
    if (i < fadeIn) v *= i / fadeIn;
    if (i > len - fadeOut) v *= (len - i) / fadeOut;
    buf[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  const normalizer = peak > 0.01 ? 0.9 / peak : 1;
  for (let i = 0; i < len; i++) buf[i] = (buf[i] ?? 0) * normalizer;

  const wav = new ArrayBuffer(44 + len * 2);
  const view = new DataView(wav);
  const write = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + len * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, len * 2, true);
  for (let i = 0; i < len; i++) {
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, buf[i] ?? 0)) * 32767, true);
  }
  return new Blob([wav], { type: "audio/wav" });
}
