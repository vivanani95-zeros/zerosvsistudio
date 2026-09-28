#!/usr/bin/env python3
"""Stage runner. Delivery 1: planning only. Later stages land in Delivery 3+."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def main() -> None:
    ap = argparse.ArgumentParser(description="Video Studio stage runner")
    ap.add_argument("--project", required=True)
    ap.add_argument("--stage", choices=["probe", "music", "animatic", "final", "qa"], default="probe")
    ap.add_argument("--workers", type=int, default=1)
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--only", default="", help="comma-separated shot ids")
    args = ap.parse_args()

    project_dir = ROOT / "projects" / args.project
    if not project_dir.is_dir():
        print(f"Unknown project: {args.project}", file=sys.stderr)
        sys.exit(1)

    if args.stage == "probe":
        import probe
        probe.main()
        return

    if args.stage == "music":
        from music_adapter import load_config, resolve_song
        import json
        cfg = load_config(ROOT / "config.yaml")
        try:
            result = resolve_song(cfg, project_dir)
        except FileNotFoundError as e:
            print(f"AWAITING SONG: {e}")
            sys.exit(2)
        meta = {
            "wav": str(result["wav"]),
            "lyrics": str(result["lyrics"]) if result["lyrics"] else None,
            "stems": [str(s) for s in result["stems"]],
        }
        (project_dir / "song_meta.json").write_text(json.dumps(meta, indent=2))
        print(json.dumps(meta, indent=2))
        return

    print(
        f"Stage '{args.stage}' not built yet. "
        "Complete Delivery 2 (song analysis + storyboard) then Delivery 3 (engine)."
    )
    sys.exit(1)


if __name__ == "__main__":
    main()
