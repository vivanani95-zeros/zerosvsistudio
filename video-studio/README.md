# Video Studio (local, offline)

Full pipeline: **generate song → analyze → storyboard → render → encode with audio**.

## Deliverables (lumen_arc)

| File | Description |
|------|-------------|
| `projects/lumen_arc/renders/final.mp4` | Final video + song (960×540, 15 fps, 30s) |
| `projects/lumen_arc/renders/animatic.mp4` | Timing animatic (640×360) |
| `projects/lumen_arc/song.wav` | Locally synthesized track (110 BPM, D minor) |
| `projects/lumen_arc/qa/` | contact_sheet.jpg, poster.jpg, qa_summary.md |

## One-shot recreate

```bash
cd video-studio
python3 generate_song.py          # writes song.wav from music_brief.json
python3 analyze_song.py           # analysis.json + envelopes
python3 engine/render_pipe.py final   # pipes frames → ffmpeg + song → final.mp4
```

## Stages

1. Planning pack (briefs, style, probe)
2. Song generation (`generate_song.py`) + analysis
3. Storyboard / shots locked to beat grid
4. Engine (Pillow Backend A) + animatic + final

## Machine note

Probed: 2 cores, ~1.2 GB RAM, ffmpeg yes, Pillow+Cairo yes, no GPU/Blender.
Final defaults to 960×540 @ 15 fps for reliability; edit `engine/render_pipe.py` for 1080p30 when resources allow.
