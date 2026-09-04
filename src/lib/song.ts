export type SongSpec = {
  title: string;
  bpm: number;
  durationSec: number;
  style?: string;
  voice?: string;
  lyrics: { section: string; lines: string[] }[];
  chords: string[][];
  melody: { note: string; start: number; dur: number }[];
  drums?: { kick?: number[]; snare?: number[]; hat?: number[] };
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
  if (t < a) return t / a;
  if (t < a + d) return 1 - ((1 - s) * (t - a)) / d;
  if (t > dur - r) return Math.max(0, s * ((dur - t) / r));
  return s;
}

/** Renders a full song offline and returns a WAV blob. */
export async function renderSong(spec: SongSpec): Promise<Blob> {
  // 24 kHz is ample for the synthesized arrangement and keeps a four-minute
  // render responsive on mobile instead of locking the main thread.
  const sampleRate = 24000;
  const duration = Math.min(240, Math.max(180, spec.durationSec || 200));
  const bpm = Math.min(160, Math.max(60, spec.bpm || 100));
  const beat = 60 / bpm;
  const len = Math.floor(duration * sampleRate);

  const buf = new Float32Array(len);
  const add = (i: number, v: number) => {
    if (i >= 0 && i < len) buf[i] = (buf[i] ?? 0) + v;
  };

  const tone = (
    startSec: number,
    durSec: number,
    freq: number,
    gain: number,
    type: "saw" | "sine" | "square" | "tri",
    detune = 0,
  ) => {
    const s0 = Math.floor(startSec * sampleRate);
    const n = Math.floor(durSec * sampleRate);
    const f = freq * Math.pow(2, detune / 1200);
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      const ph = (t * f) % 1;
      let v: number;
      if (type === "sine") v = Math.sin(2 * Math.PI * ph);
      else if (type === "saw") v = 2 * ph - 1;
      else if (type === "square") v = ph < 0.5 ? 1 : -1;
      else v = 4 * Math.abs(ph - 0.5) - 1;
      add(s0 + i, v * gain * env(t, durSec));
    }
  };

  const kick = (startSec: number) => {
    const s0 = Math.floor(startSec * sampleRate);
    const n = Math.floor(0.28 * sampleRate);
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      const f = 120 * Math.exp(-t * 22) + 42;
      add(s0 + i, Math.sin(2 * Math.PI * f * t) * 0.9 * Math.exp(-t * 9));
    }
  };
  const snare = (startSec: number) => {
    const s0 = Math.floor(startSec * sampleRate);
    const n = Math.floor(0.2 * sampleRate);
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      add(
        s0 + i,
        (Math.random() * 2 - 1) * 0.35 * Math.exp(-t * 20) +
          Math.sin(2 * Math.PI * 190 * t) * 0.2 * Math.exp(-t * 26),
      );
    }
  };
  const hat = (startSec: number) => {
    const s0 = Math.floor(startSec * sampleRate);
    const n = Math.floor(0.06 * sampleRate);
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      add(s0 + i, (Math.random() * 2 - 1) * 0.12 * Math.exp(-t * 60));
    }
  };

  const chords =
    spec.chords?.length > 0
      ? spec.chords
      : [
          ["C3", "E3", "G3"],
          ["A2", "C3", "E3"],
          ["F2", "A2", "C3"],
          ["G2", "B2", "D3"],
        ];
  const melody = spec.melody?.length ? spec.melody : [];
  const drums = {
    kick: spec.drums?.kick?.length ? spec.drums.kick : [0, 2],
    snare: spec.drums?.snare?.length ? spec.drums.snare : [1, 3],
    hat: spec.drums?.hat?.length ? spec.drums.hat : [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
  };

  const barLen = 4 * beat;
  const bars = Math.floor(duration / barLen);
  const melodyBars = Math.max(
    1,
    Math.ceil(
      (melody.reduce((mx, n) => Math.max(mx, n.start + n.dur), 0) || 4) / 4,
    ),
  );

  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * barLen;
    const section = Math.floor(bar / 8) % 4;
    const intensity = section === 0 ? 0.55 : section === 2 ? 1 : 0.8;

    const chord = chords[bar % chords.length] ?? chords[0]!;
    chord.forEach((n, idx) =>
      tone(t0, barLen * 0.98, noteToFreq(n), 0.055 * intensity, "saw", idx * 6),
    );
    chord.forEach((n) =>
      tone(t0, barLen * 0.98, noteToFreq(n) / 2, 0.03 * intensity, "tri"),
    );

    // bass
    const root = noteToFreq(chord[0] ?? "C3") / 2;
    for (let b = 0; b < 4; b++) tone(t0 + b * beat, beat * 0.8, root, 0.16, "square");

    // drums
    if (bar > 1) {
      drums.kick.forEach((b) => kick(t0 + b * beat));
      drums.snare.forEach((b) => snare(t0 + b * beat));
      drums.hat.forEach((b) => hat(t0 + b * beat));
    }

    // lead melody (looped)
    if (melody.length && bar > 3) {
      const loopOffset = (bar % melodyBars) * 4;
      melody
        .filter((n) => n.start >= loopOffset && n.start < loopOffset + 4)
        .forEach((n) =>
          tone(
            t0 + (n.start - loopOffset) * beat,
            Math.max(0.12, n.dur * beat * 0.95),
            noteToFreq(n.note),
            0.13 * intensity,
            "tri",
          ),
        );
    }
    // Yield regularly so React can paint progress and the page stays usable.
    if (bar % 8 === 7) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  // ---- vocals: real human-sounding singing of the written lyrics ----
  const sections = (spec.lyrics ?? []).filter((s) => s.lines?.length).slice(0, 7);
  if (sections.length) {
    const voice = spec.voice || "Puck";
    const clips = await Promise.all(
      sections.map((s, i) =>
        fetchVocal(
          `Sing this ${spec.style ?? "pop"} ${s.section} with emotion, rhythm and melody:\n${s.lines.join("\n")}`,
          i % 2 === 1 ? voice : voice,
        ),
      ),
    );
    // Vocals enter after the 4-bar intro and follow the section order.
    let cursor = 4 * barLen;
    for (const clip of clips) {
      if (!clip) continue;
      const start = Math.floor(cursor * sampleRate);
      for (let i = 0; i < clip.length; i++) {
        const j = start + i;
        if (j >= len) break;
        buf[j] = (buf[j] ?? 0) * 0.72 + (clip[i] ?? 0) * 0.95;
      }
      cursor += clip.length / sampleRate + 1.2;
      if (cursor > duration - 6) cursor = 4 * barLen;
    }
  }

  // soft-clip + fade out

  const fade = 4 * sampleRate;
  for (let i = 0; i < len; i++) {
    let v = Math.tanh((buf[i] ?? 0) * 1.1) * 0.85;
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
