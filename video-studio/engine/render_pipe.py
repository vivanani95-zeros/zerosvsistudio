#!/usr/bin/env python3
"""Pipe frames straight into ffmpeg — no PNG cache."""
from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from engine.render_project import PROJECT, active_shot, load_env, load_json, paint_frame


def render_pipe(stage: str = "final"):
    shots_data = load_json(PROJECT / "shots.json")
    shots = shots_data["shots"]
    duration = float(shots_data["duration_sec"])
    if stage == "animatic":
        w, h, fps = 640, 360, 15
    else:
        w, h, fps = 960, 540, 15
    rms, low, high = load_env("rms"), load_env("low"), load_env("high")
    n_frames = int(duration * fps)
    song = PROJECT / "song.wav"
    out = PROJECT / "renders" / f"{stage}.mp4"
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y", "-f", "rawvideo", "-vcodec", "rawvideo", "-pix_fmt", "rgb24",
        "-s", f"{w}x{h}", "-r", str(fps), "-i", "pipe:0", "-i", str(song),
        "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "320k", "-shortest", "-movflags", "+faststart", str(out),
    ]
    print(" ".join(cmd), flush=True)
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    assert proc.stdin is not None
    t0 = time.time()
    try:
        for i in range(n_frames):
            t = i / fps
            img = paint_frame(w, h, t, duration, active_shot(shots, t), rms, low, high, fps)
            proc.stdin.write(img.tobytes())
            if i % 30 == 0 or i == n_frames - 1:
                rate = (i + 1) / max(0.001, time.time() - t0)
                print(f"[{stage}] frame {i+1}/{n_frames}  {rate:.1f} fps", flush=True)
        proc.stdin.close()
        err = proc.stderr.read().decode("utf-8", errors="replace") if proc.stderr else ""
        rc = proc.wait()
        if rc != 0:
            raise RuntimeError(err[-2000:] if err else f"ffmpeg {rc}")
    except Exception:
        proc.kill()
        raise
    print(f"Wrote {out} ({out.stat().st_size} bytes)", flush=True)
    return out


if __name__ == "__main__":
    render_pipe(sys.argv[1] if len(sys.argv) > 1 else "final")
