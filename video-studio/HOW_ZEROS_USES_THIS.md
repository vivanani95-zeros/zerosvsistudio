# How Zeros Video mode uses this pipeline

The **browser** Video mode (`src/lib/zeros.ts` + `src/lib/render-video.ts`) follows the **same creative process** as this offline studio:

1. **Brief** — one hero motif that transforms
2. **Beat structure** — intro → build → drop → outro
3. **Audio-first** — mood + bpm + voiceover lines on section starts
4. **Motif returns** — at least 3 times (thin / denser / lock / hold)
5. **Forbidden AI-slop** — no purposeless orbs, no particle spam, no bare crossfades

## Browser path (production site)
User prompt → Zeros emits VideoSpec JSON → Canvas 2D + Web Audio → MP4/WebM download.

## Local path (this folder)
```bash
cd video-studio
python3 generate_song.py
python3 analyze_song.py
python3 engine/render_pipe.py final
```
Produces `projects/lumen_arc/renders/final.mp4` with generated song muxed.

Both paths share the same storyboard language and quality bar.
