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
  arrangement?: { seed?: number; drumStyle?: string; bassStyle?: string; leadStyle?: string; textureStyle?: string; swing?: number };
};

/** Fetches a real generated vocal as 24kHz mono PCM. Never waits forever. */
async function fetchVocal(text: string, voice: string): Promise<Float32Array | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 22000);
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

const NOTES: Record<string, number> = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
export function noteToFreq(note: string): number {
  const m = note.trim().match(/^([A-Ga-g][#b]?)(-?\d)$/);
  if (!m) return 440;
  const pc = NOTES[(m[1] ?? "A").charAt(0).toUpperCase() + (m[1] ?? "").slice(1)];
  const oct = parseInt(m[2] ?? "4", 10);
  return 440 * Math.pow(2, (((pc ?? 9) + (oct + 1) * 12) - 69) / 12);
}
function env(t: number, dur: number, a = 0.01, d = 0.15, s = 0.6, r = 0.15) {
  if (t < a) return t / Math.max(a, 0.0001);
  if (t < a + d) return 1 - ((1 - s) * (t - a)) / Math.max(d, 0.0001);
  if (t > dur - r) return Math.max(0, s * ((dur - t) / Math.max(r, 0.0001)));
  return s;
}
function makeRng(seed: number) { let x = (seed >>> 0) || 0x9e3779b9; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; }
function pickVoice(primary: string): string { return ["Puck", "Kore", "Charon", "Aoede"].includes(primary) ? primary : "Puck"; }
function backingVoice(primary: string): string { return ["Puck", "Kore", "Charon", "Aoede"].find((v) => v !== primary) ?? "Kore"; }

/** Renders a layered song offline. Real generated vocals are added when available; failures never block rendering. */
export async function renderSong(spec: SongSpec): Promise<Blob> {
  const sampleRate = 24000;
  const duration = Math.min(240, Math.max(30, spec.durationSec || 200));
  const bpm = Math.min(170, Math.max(70, spec.bpm || 100));
  const beat = 60 / bpm;
  const len = Math.floor(duration * sampleRate);
  const buf = new Float32Array(len);
  const add = (i: number, v: number) => { if (i >= 0 && i < len) buf[i] = (buf[i] ?? 0) + v; };
  const seed = ((spec.arrangement?.seed ?? 0) ^ Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  const rng = makeRng(seed);
  const swing = Math.min(0.35, Math.max(0, spec.arrangement?.swing ?? rng() * 0.16));
  const drumStyle = spec.arrangement?.drumStyle ?? ["four-on-floor", "breakbeat", "pop-rock", "trap", "half-time"][Math.floor(rng() * 5)];
  const bassStyle = spec.arrangement?.bassStyle ?? ["sub", "synth", "electric", "picked", "808"][Math.floor(rng() * 5)];
  const leadStyle = spec.arrangement?.leadStyle ?? ["piano", "pluck", "synth", "guitar", "strings", "bell"][Math.floor(rng() * 6)];
  const textureStyle = spec.arrangement?.textureStyle ?? ["pads", "strings", "choir", "ambience", "arp", "guitar"][Math.floor(rng() * 6)];
  const tone = (startSec: number, durSec: number, freq: number, gain: number, type: "saw" | "sine" | "square" | "tri", detune = 0, attack = 0.01, release = 0.15) => {
    const s0 = Math.floor(startSec * sampleRate), n = Math.floor(Math.max(0.02, durSec) * sampleRate), f = freq * Math.pow(2, detune / 1200);
    for (let i = 0; i < n; i++) { const t = i / sampleRate, ph = (t * f) % 1; let v = type === "sine" ? Math.sin(2 * Math.PI * ph) : type === "saw" ? 2 * ph - 1 : type === "square" ? (ph < 0.5 ? 1 : -1) : 4 * Math.abs(ph - 0.5) - 1; add(s0 + i, v * gain * env(t, durSec, attack, Math.min(0.3, durSec * 0.22), 0.72, Math.min(release, durSec * 0.35))); }
  };
  const kick = (startSec: number, power = 0.9) => { const s0 = Math.floor(startSec * sampleRate); for (let i = 0; i < Math.floor(0.3 * sampleRate); i++) { const t = i / sampleRate; add(s0 + i, Math.sin(2 * Math.PI * (135 * Math.exp(-t * 20) + 42) * t) * power * Math.exp(-t * 9)); } };
  const snare = (startSec: number, power = 0.34) => { const s0 = Math.floor(startSec * sampleRate); for (let i = 0; i < Math.floor(0.22 * sampleRate); i++) { const t = i / sampleRate; add(s0 + i, (rng() * 2 - 1) * power * Math.exp(-t * 18) + Math.sin(2 * Math.PI * 185 * t) * 0.2 * Math.exp(-t * 24)); } };
  const hat = (startSec: number, power = 0.1) => { const s0 = Math.floor(startSec * sampleRate); for (let i = 0; i < Math.floor(0.065 * sampleRate); i++) { const t = i / sampleRate; add(s0 + i, (rng() * 2 - 1) * power * Math.exp(-t * 65)); } };
  const clap = (startSec: number) => { for (let k = 0; k < 3; k++) snare(startSec + k * 0.011, 0.11); };
  const chords = spec.chords?.length ? spec.chords : [["C3", "E3", "G3"], ["A2", "C3", "E3"], ["F2", "A2", "C3"], ["G2", "B2", "D3"]];
  const melody = spec.melody?.length ? spec.melody : [];
  const drums = { kick: spec.drums?.kick?.length ? spec.drums.kick : [0, 2], snare: spec.drums?.snare?.length ? spec.drums.snare : [1, 3], hat: spec.drums?.hat?.length ? spec.drums.hat : [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] };
  const barLen = 4 * beat, bars = Math.floor(duration / barLen), melodyBars = Math.max(1, Math.ceil((melody.reduce((mx, n) => Math.max(mx, n.start + n.dur), 0) || 4) / 4));
  const playDrumPattern = (barStart: number, bar: number, intensity: number) => {
    const shift = swing * beat * 0.35;
    if (drumStyle === "four-on-floor") { [0, 1, 2, 3].forEach((b) => kick(barStart + b * beat + (b % 2 ? shift : 0), 0.82 * intensity)); [1, 3].forEach((b) => clap(barStart + b * beat)); for (let b = 0; b < 8; b++) hat(barStart + b * beat / 2 + (b % 2 ? shift : 0), 0.09 * intensity); }
    else if (drumStyle === "breakbeat" || drumStyle === "boom-bap") { drums.kick.forEach((b) => kick(barStart + b * beat, 0.82 * intensity)); drums.snare.forEach((b) => snare(barStart + b * beat, 0.38 * intensity)); drums.hat.forEach((b) => hat(barStart + b * beat + (b % 2 ? shift : 0), 0.095 * intensity)); if (bar % 4 === 3) kick(barStart + 3.5 * beat, 0.55 * intensity); }
    else if (drumStyle === "trap") { [0, 1.5, 2.75].forEach((b) => kick(barStart + b * beat, 0.92 * intensity)); [1, 3].forEach((b) => snare(barStart + b * beat, 0.35 * intensity)); for (let b = 0; b < 16; b++) hat(barStart + b * beat / 4, 0.065 * intensity); }
    else { drums.kick.forEach((b) => kick(barStart + b * beat, 0.8 * intensity)); drums.snare.forEach((b) => snare(barStart + b * beat, 0.36 * intensity)); drums.hat.forEach((b) => hat(barStart + b * beat, 0.09 * intensity)); }
  };
  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * barLen, cycle = bar % 32, intro = bar < 4, build = cycle >= 6 && cycle < 8, drop = cycle >= 8 && cycle < 16, bridge = cycle >= 24 && cycle < 28, intensity = intro ? 0.32 : bridge ? 0.62 : build ? 0.82 : drop ? 1 : 0.76, chord = chords[bar % chords.length] ?? chords[0]!;
    chord.forEach((n, idx) => { const det = (idx - 1) * (3 + Math.floor(rng() * 4)); tone(t0, barLen * 0.97, noteToFreq(n), 0.045 * intensity, "tri", det, 0.08, 0.3); if (textureStyle === "strings" || textureStyle === "choir") tone(t0 + beat * 0.5, barLen * 0.88, noteToFreq(n) * 2, 0.018 * intensity, "sine", det, 0.3, 0.6); });
    const root = noteToFreq(chord[0] ?? "C3") / 2;
    [0, 1, 2, 3].forEach((b, idx) => tone(t0 + b * beat, beat * (bassStyle === "808" ? 0.72 : 0.78), root * (idx === 3 && rng() > 0.45 ? 2 ** ((rng() > 0.5 ? 2 : -2) / 12) : 1), (bassStyle === "808" ? 0.18 : 0.14) * intensity, bassStyle === "808" ? "sine" : "square", 0, 0.008, 0.18));
    if (!intro) playDrumPattern(t0, bar, intensity);
    if (melody.length && !intro && !bridge) { const loopOffset = (bar % melodyBars) * 4; melody.filter((n) => n.start >= loopOffset && n.start < loopOffset + 4 && rng() < (drop ? 1 : 0.72)).forEach((n) => tone(t0 + (n.start - loopOffset) * beat, Math.max(0.11, n.dur * beat * 0.82), noteToFreq(n.note), 0.095 * intensity, leadStyle === "piano" || leadStyle === "bell" ? "sine" : leadStyle === "strings" ? "tri" : "saw", (rng() - 0.5) * 9, 0.008, 0.18)); }
    if (textureStyle === "arp" || textureStyle === "guitar") { const arpNotes = chord.slice(0, 3); for (let a = 0; a < 8; a++) tone(t0 + a * beat / 2, beat * 0.34, noteToFreq(arpNotes[a % Math.max(1, arpNotes.length)] ?? chord[0] ?? "C3") * 2, 0.028 * intensity, "tri", (rng() - 0.5) * 12, 0.006, 0.08); }
    if (bar % 8 === 7) for (let r = 0; r < 10; r++) tone(t0 + (r / 10) * barLen, beat * 0.16, 180 + r * 32, 0.009 * intensity * (r + 1) / 10, "sine", 0, 0.01, 0.08);
    if (bar % 8 === 7) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  const sections = (spec.lyrics ?? []).filter((s) => s.lines?.length).slice(0, 9);
  if (sections.length) {
    const leadVoice = pickVoice(spec.voice || "Puck"), supportVoice = backingVoice(leadVoice), vocalStyle = spec.vocalStyle || "cinematic";
    const leadClips: (Float32Array | null)[] = [];
    // Limit concurrency so one slow provider/key cannot leave a huge pile of open requests.
    for (let i = 0; i < sections.length; i += 3) {
      const batch = sections.slice(i, i + 3);
      const clips = await Promise.all(batch.map((s) => fetchVocal(`Perform this song section as a professional ${vocalStyle} singer. Style: ${spec.style ?? "modern pop"}. Sing naturally with phrasing, dynamics, emotion, pitch movement and rhythmic timing. Do not speak the lyrics. Section: ${s.section}\n${s.lines.join("\n")}`, leadVoice)));
      leadClips.push(...clips);
    }
    const backingIndexes = sections.map((s, i) => ({ s, i })).filter(({ s, i }) => /chorus|hook|drop|final/i.test(s.section) && i % 2 === 0).slice(0, 3);
    const backingClips = await Promise.all(backingIndexes.map(({ s }) => fetchVocal(`Sing only a tasteful backing-vocal layer for this ${spec.style ?? "pop"} chorus. Use soft sustained harmonies, short responses and airy ad-libs; do not speak. Lyrics:\n${s.lines.join("\n")}`, supportVoice)));
    let cursor = Math.min(4 * barLen, duration * 0.18);
    for (let i = 0; i < leadClips.length; i++) { const clip = leadClips[i]; if (!clip) continue; const start = Math.floor(cursor * sampleRate); for (let j = 0; j < clip.length; j++) { const idx = start + j; if (idx >= len) break; buf[idx] = (buf[idx] ?? 0) * 0.72 + (clip[j] ?? 0) * 0.86; } cursor += clip.length / sampleRate + 0.65; if (cursor > duration - 5) cursor = 4 * barLen; }
    for (let b = 0; b < backingIndexes.length; b++) { const clip = backingClips[b]; if (!clip) continue; const sectionIndex = backingIndexes[b]?.i ?? 0; const start = Math.floor((4 * barLen + sectionIndex * 2 * barLen) * sampleRate); for (let j = 0; j < clip.length; j++) { const idx = start + j; if (idx >= len) break; buf[idx] = (buf[idx] ?? 0) * 0.88 + (clip[j] ?? 0) * 0.25; } }
  }
  const fade = Math.min(4 * sampleRate, Math.floor(len * 0.08)); let peak = 0;
  for (let i = 0; i < len; i++) { const v = Math.tanh((buf[i] ?? 0) * 1.22); peak = Math.max(peak, Math.abs(v)); buf[i] = v; }
  const normalizer = peak > 0.92 ? 0.92 / peak : 0.92;
  for (let i = 0; i < len; i++) { let v = (buf[i] ?? 0) * normalizer; if (i > len - fade) v *= (len - i) / fade; buf[i] = v; }
  const wav = new ArrayBuffer(44 + len * 2), view = new DataView(wav);
  const write = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  write(0, "RIFF"); view.setUint32(4, 36 + len * 2, true); write(8, "WAVE"); write(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, len * 2, true);
  for (let i = 0; i < len; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, buf[i] ?? 0)) * 32767, true);
  return new Blob([wav], { type: "audio/wav" });
}
