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

/** Fetches sung/spoken vocals as 24kHz mono PCM float samples. */
async function fetchVocal(text: string, voice: string): Promise<Float32Array | null> {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
    });
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
  }
}

const NOTES: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

export function noteToFreq(note: string): number {
  const m = note.trim().match(/^([A-Ga-g][#b]?)(-?\d)$/);
  if (!m) return 440;
  const pc = NOTES[(m[1] ?? "A").charAt(0).toUpperCase() + (m[1] ?? "").slice(1)];
  const oct = parseInt(m[2] ?? "4", 10);
  const midi = (pc ?? 9) + (oct + 1) * 12;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function env(t: number, dur: number, a = 0.01, d = 0.15, s = 0.6, r = 0.15) {
  if (t < a) return t / Math.max(a, 0.0001);
  if (t < a + d) return 1 - ((1 - s) * (t - a)) / Math.max(d, 0.0001);
  if (t > dur - r) return Math.max(0, s * ((dur - t) / Math.max(r, 0.0001)));
  return s;
}

function makeRng(seed: number) {
  let x = (seed >>> 0) || 0x9e3779b9;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) / 4294967296);
  };
}

function pickVoice(primary: string): string {
  const voices = ["Puck", "Kore", "Charon", "Aoede"];
  return voices.includes(primary) ? primary : voices[0]!;
}

function backingVoice(primary: string): string {
  const voices = ["Puck", "Kore", "Charon", "Aoede"];
  return voices.find((v) => v !== primary) ?? "Kore";
}

/** Renders a full layered song offline and returns a WAV blob. */
export async function renderSong(spec: SongSpec): Promise<Blob> {
  const sampleRate = 24000;
  const duration = Math.min(240, Math.max(180, spec.durationSec || 200));
  const bpm = Math.min(150, Math.max(70, spec.bpm || 100));
  const beat = 60 / bpm;
  const len = Math.floor(duration * sampleRate);
  const buf = new Float32Array(len);
  const add = (i: number, v: number) => {
    if (i >= 0 && i < len) buf[i] = (buf[i] ?? 0) + v;
  };

  // A fresh seed is deliberately mixed into the model-provided seed so that
  // regenerating the same song brief does not collapse into the same beat.
  const seed = ((spec.arrangement?.seed ?? 0) ^ Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  const rng = makeRng(seed);
  const swing = Math.min(0.35, Math.max(0, spec.arrangement?.swing ?? rng() * 0.16));
  const drumStyle = spec.arrangement?.drumStyle ?? ["four-on-floor", "breakbeat", "pop-rock", "trap", "half-time"][Math.floor(rng() * 5)];
  const bassStyle = spec.arrangement?.bassStyle ?? ["sub", "synth", "electric", "picked", "808"][Math.floor(rng() * 5)];
  const leadStyle = spec.arrangement?.leadStyle ?? ["piano", "pluck", "synth", "guitar", "strings", "bell"][Math.floor(rng() * 6)];
  const textureStyle = spec.arrangement?.textureStyle ?? ["pads", "strings", "choir", "ambience", "arp", "guitar"][Math.floor(rng() * 6)];

  const tone = (
    startSec: number,
    durSec: number,
    freq: number,
    gain: number,
    type: "saw" | "sine" | "square" | "tri",
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
      let v: number;
      if (type === "sine") v = Math.sin(2 * Math.PI * ph);
      else if (type === "saw") v = 2 * ph - 1;
      else if (type === "square") v = ph < 0.5 ? 1 : -1;
      else v = 4 * Math.abs(ph - 0.5) - 1;
      // Gentle high-frequency damping keeps the synthetic layer musical instead of harsh.
      const soft = type === "saw" ? 0.82 + 0.18 * Math.sin(2 * Math.PI * 0.5 * t) : 1;
      add(s0 + i, v * gain * soft * env(t, durSec, attack, Math.min(0.3, durSec * 0.22), 0.72, Math.min(release, durSec * 0.35)));
    }
  };

  const kick = (startSec: number, power = 0.9) => {
    const s0 = Math.floor(startSec * sampleRate);
    const n = Math.floor(0.3 * sampleRate);
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      const f = 135 * Math.exp(-t * 20) + 42;
      add(s0 + i, Math.sin(2 * Math.PI * f * t) * power * Math.exp(-t * 9));
    }
  };
  const snare = (startSec: number, power = 0.34) => {
    const s0 = Math.floor(startSec * sampleRate);
    const n = Math.floor(0.22 * sampleRate);
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      const noise = (rng() * 2 - 1) * power * Math.exp(-t * 18);
      const body = Math.sin(2 * Math.PI * 185 * t) * 0.2 * Math.exp(-t * 24);
      add(s0 + i, noise + body);
    }
  };
  const hat = (startSec: number, power = 0.1) => {
    const s0 = Math.floor(startSec * sampleRate);
    const n = Math.floor(0.065 * sampleRate);
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      add(s0 + i, (rng() * 2 - 1) * power * Math.exp(-t * 65));
    }
  };
  const clap = (startSec: number) => {
    for (let k = 0; k < 3; k++) snare(startSec + k * 0.011, 0.11);
  };

  const chords = spec.chords?.length > 0
    ? spec.chords
    : [["C3", "E3", "G3"], ["A2", "C3", "E3"], ["F2", "A2", "C3"], ["G2", "B2", "D3"]];
  const melody = spec.melody?.length ? spec.melody : [];
  const drums = {
    kick: spec.drums?.kick?.length ? spec.drums.kick : [0, 2],
    snare: spec.drums?.snare?.length ? spec.drums.snare : [1, 3],
    hat: spec.drums?.hat?.length ? spec.drums.hat : [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
  };

  const barLen = 4 * beat;
  const bars = Math.floor(duration / barLen);
  const melodyBars = Math.max(1, Math.ceil((melody.reduce((mx, n) => Math.max(mx, n.start + n.dur), 0) || 4) / 4));

  const playDrumPattern = (barStart: number, bar: number, intensity: number) => {
    const shift = swing * beat * 0.35;
    if (drumStyle === "four-on-floor" || drumStyle === "house") {
      [0, 1, 2, 3].forEach((b) => kick(barStart + b * beat + (b % 2 ? shift : 0), 0.82 * intensity));
      [1, 3].forEach((b) => clap(barStart + b * beat));
      for (let b = 0; b < 8; b++) hat(barStart + b * beat / 2 + (b % 2 ? shift : 0), 0.09 * intensity);
    } else if (drumStyle === "breakbeat" || drumStyle === "boom-bap") {
      drums.kick.forEach((b) => kick(barStart + b * beat, 0.82 * intensity));
      drums.snare.forEach((b) => snare(barStart + b * beat, 0.38 * intensity));
      drums.hat.forEach((b) => hat(barStart + b * beat + (b % 2 ? shift : 0), 0.095 * intensity));
      if (bar % 4 === 3) kick(barStart + 3.5 * beat, 0.55 * intensity);
    } else if (drumStyle === "trap") {
      [0, 1.5, 2.75].forEach((b) => kick(barStart + b * beat, 0.92 * intensity));
      [1, 3].forEach((b) => snare(barStart + b * beat, 0.35 * intensity));
      for (let b = 0; b < 16; b++) hat(barStart + b * beat / 4, 0.065 * intensity);
      if (bar % 4 === 3) for (let b = 12; b < 16; b++) hat(barStart + b * beat / 4, 0.11 * intensity);
    } else if (drumStyle === "half-time") {
      [0, 2.5].forEach((b) => kick(barStart + b * beat, 0.88 * intensity));
      snare(barStart + 2 * beat, 0.45 * intensity);
      for (let b = 0; b < 8; b++) hat(barStart + b * beat / 2, 0.075 * intensity);
    } else {
      drums.kick.forEach((b) => kick(barStart + b * beat, 0.8 * intensity));
      drums.snare.forEach((b) => snare(barStart + b * beat, 0.36 * intensity));
      drums.hat.forEach((b) => hat(barStart + b * beat, 0.09 * intensity));
    }
  };

  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * barLen;
    const cycle = bar % 32;
    const section = Math.floor(bar / 8) % 4;
    const intro = bar < 4;
    const build = cycle >= 6 && cycle < 8;
    const drop = cycle >= 8 && cycle < 16;
    const bridge = cycle >= 24 && cycle < 28;
    const intensity = intro ? 0.32 : bridge ? 0.62 : build ? 0.82 : drop ? 1.0 : 0.76;
    const chord = chords[bar % chords.length] ?? chords[0]!;

    // Warm harmonic bed: every generation gets a slightly different voicing and timbre.
    chord.forEach((n, idx) => {
      const det = (idx - 1) * (3 + Math.floor(rng() * 4));
      const wave = section === 1 ? "saw" : "tri";
      tone(t0, barLen * 0.97, noteToFreq(n), 0.045 * intensity, wave, det, 0.08, 0.3);
      if (textureStyle === "strings" || textureStyle === "choir") {
        tone(t0 + beat * 0.5, barLen * 0.88, noteToFreq(n) * 2, 0.018 * intensity, "sine", det, 0.3, 0.6);
      }
    });

    const root = noteToFreq(chord[0] ?? "C3") / 2;
    const bassSteps = bassStyle === "808" ? [0, 1.5, 2.5, 3.5] : [0, 1, 2, 3];
    bassSteps.forEach((b, idx) => {
      const movement = idx === 3 && rng() > 0.45 ? 2 ** (rng() > 0.5 ? 2 / 12 : -2 / 12) : 1;
      const gain = bassStyle === "808" ? 0.18 : bassStyle === "electric" ? 0.13 : 0.15;
      tone(t0 + b * beat, beat * (bassStyle === "808" ? 0.72 : 0.78), root * movement, gain * intensity, bassStyle === "808" ? "sine" : "square", 0, 0.008, 0.18);
    });

    if (!intro) playDrumPattern(t0, bar, intensity);

    // Melodic hook enters after the intro, with section-dependent density.
    if (melody.length && !intro && !bridge) {
      const loopOffset = (bar % melodyBars) * 4;
      const density = section === 2 ? 1 : 0.72;
      melody
        .filter((n) => n.start >= loopOffset && n.start < loopOffset + 4 && rng() < density)
        .forEach((n) => {
          const wave = leadStyle === "piano" || leadStyle === "bell" ? "sine" : leadStyle === "strings" ? "tri" : "saw";
          const leadGain = leadStyle === "bell" ? 0.105 : leadStyle === "piano" ? 0.11 : 0.09;
          tone(t0 + (n.start - loopOffset) * beat, Math.max(0.11, n.dur * beat * 0.82), noteToFreq(n.note), leadGain * intensity, wave, (rng() - 0.5) * 9, 0.008, 0.18);
        });
    }

    // Background sound layers keep the arrangement alive between vocal phrases.
    if (textureStyle === "arp" || textureStyle === "guitar") {
      const arpNotes = chord.slice(0, Math.min(3, chord.length));
      for (let a = 0; a < 8; a++) {
        const note = arpNotes[a % Math.max(1, arpNotes.length)] ?? chord[0] ?? "C3";
        tone(t0 + a * beat / 2, beat * 0.34, noteToFreq(note) * 2, 0.028 * intensity, "tri", (rng() - 0.5) * 12, 0.006, 0.08);
      }
    } else if (textureStyle === "ambience") {
      for (let a = 0; a < 3; a++) {
        tone(t0 + rng() * barLen, beat * (1.2 + rng()), noteToFreq(chord[Math.floor(rng() * chord.length)] ?? "C3") * 4, 0.006 * intensity, "sine", 0, 0.3, 0.8);
      }
    }

    // Transitional risers / impact hits every 8 bars.
    if (bar % 8 === 7) {
      for (let r = 0; r < 10; r++) {
        const tt = t0 + (r / 10) * barLen;
        tone(tt, beat * 0.16, 180 + r * 32, 0.009 * intensity * (r + 1) / 10, "sine", 0, 0.01, 0.08);
      }
    }

    if (bar % 8 === 7) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  // ---- vocals: lead performance plus occasional backing layers ----
  const sections = (spec.lyrics ?? []).filter((s) => s.lines?.length).slice(0, 9);
  if (sections.length) {
    const leadVoice = pickVoice(spec.voice || "Puck");
    const supportVoice = backingVoice(leadVoice);
    const vocalStyle = spec.vocalStyle || "cinematic";
    const leadClips = await Promise.all(
      sections.map((s) => fetchVocal(
        `Perform this song section as a professional ${vocalStyle} singer. Style: ${spec.style ?? "modern pop"}. ` +
        `Sing naturally with phrasing, dynamics, emotion, pitch movement and rhythmic timing. Do not speak the lyrics. ` +
        `Section: ${s.section}\n${s.lines.join("\n")}`,
        leadVoice,
      )),
    );

    const backingIndexes = sections
      .map((s, i) => ({ s, i }))
      .filter(({ s, i }) => /chorus|hook|drop|final/i.test(s.section) && i % 2 === 0)
      .slice(0, 3);
    const backingClips = await Promise.all(
      backingIndexes.map(({ s }) => fetchVocal(
        `Sing only a tasteful backing-vocal layer for this ${spec.style ?? "pop"} chorus. Use soft sustained harmonies,
        short responses and airy ad-libs; do not speak. Lyrics:\n${s.lines.join("\n")}`,
        supportVoice,
      )),
    );

    let cursor = Math.min(4 * barLen, duration * 0.18);
    for (let i = 0; i < leadClips.length; i++) {
      const clip = leadClips[i];
      if (!clip) continue;
      const start = Math.floor(cursor * sampleRate);
      const leadGain = /powerful|anthemic/i.test(vocalStyle) ? 0.92 : 0.86;
      for (let j = 0; j < clip.length; j++) {
        const idx = start + j;
        if (idx >= len) break;
        const duck = Math.sin(Math.min(1, j / Math.max(1, clip.length)) * Math.PI) * 0.08;
        buf[idx] = (buf[idx] ?? 0) * 0.72 + (clip[j] ?? 0) * (leadGain - duck);
      }
      cursor += clip.length / sampleRate + 0.65;
      if (cursor > duration - 5) cursor = 4 * barLen;
    }

    // Backing vocals are mixed lower so the lead remains the focal point.
    for (let b = 0; b < backingIndexes.length; b++) {
      const clip = backingClips[b];
      if (!clip) continue;
      const sectionIndex = backingIndexes[b]?.i ?? 0;
      const start = Math.floor((4 * barLen + sectionIndex * 2 * barLen) * sampleRate);
      for (let j = 0; j < clip.length; j++) {
        const idx = start + j;
        if (idx >= len) break;
        buf[idx] = (buf[idx] ?? 0) * 0.88 + (clip[j] ?? 0) * 0.25;
      }
    }
  }

  // Master: gentle saturation, safety limiting, high-frequency taming and fade-out.
  const fade = Math.min(4 * sampleRate, Math.floor(len * 0.08));
  let peak = 0;
  for (let i = 0; i < len; i++) {
    const v = Math.tanh((buf[i] ?? 0) * 1.22);
    peak = Math.max(peak, Math.abs(v));
    buf[i] = v;
  }
  const normalizer = peak > 0.92 ? 0.92 / peak : 0.92;
  for (let i = 0; i < len; i++) {
    let v = (buf[i] ?? 0) * normalizer;
    if (i > len - fade) v *= (len - i) / fade;
    buf[i] = v;
  }

  return encodeWav(buf, sampleRate);
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytes = samples.length * 2;
  const ab = new ArrayBuffer(44 + bytes);
  const view = new DataView(ab);
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, bytes, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([ab], { type: "audio/wav" });
}
