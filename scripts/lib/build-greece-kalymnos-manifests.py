#!/usr/bin/env python3
"""Build per-roll manifests and URL lists from Kalymnos Export XMP ratings."""
from __future__ import annotations

import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

EXPORT = Path(
    "/Users/raveenfernando/Pictures/In Progress/Greece Film/Kalymnos Export"
)
OUT = Path("/tmp/greece-kalymnos-manifest")
R2_BASE = "https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev"

# Local folder prefix -> R2 roll folder (shoot order 1-9)
ROLL_MAP = [
    ("1_9_20_ultamax400", "01-Ultramax400"),
    ("2_9_21_ektar100", "02-Ektar100"),
    ("3_9_22_Portra400", "03-Portra400"),
    ("4_9_22_FP4+_125", "04-FP4Plus125"),
    ("5_9_22_gold200", "05-Gold200"),
    ("6_9_23_portra160", "06-Portra160"),
    ("7_9_24_HP5400", "07-HP5400"),
    ("8_9_24_tmax400", "08-TMax400"),
    ("9_9_25_ektar100", "09-Ektar100"),
    ("10_9_25_portra_400", "10-Portra400"),
]


def rating_for(path: Path) -> int:
    out = subprocess.run(
        ["exiftool", "-s3", "-Rating", str(path)],
        capture_output=True,
        text=True,
        check=False,
    )
    raw = (out.stdout or "").strip()
    try:
        return int(raw) if raw else 0
    except ValueError:
        return 0


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    entries: list[dict] = []
    rating_counts: Counter[int] = Counter()

    for local_prefix, r2_roll in ROLL_MAP:
        roll_dir = EXPORT
        files = sorted(
            p
            for p in roll_dir.glob("*.jpg")
            if p.name.startswith(local_prefix + "_")
        )
        manifest_path = OUT / f"{r2_roll}.txt"
        manifest_path.write_text("\n".join(p.name for p in files) + "\n")
        for p in files:
            r = rating_for(p)
            rating_counts[r] += 1
            url = f"{R2_BASE}/Greece/Kalymnos/{r2_roll}/{p.name}"
            entries.append(
                {
                    "filename": p.name,
                    "localPrefix": local_prefix,
                    "r2Roll": r2_roll,
                    "rating": r,
                    "url": url,
                }
            )

    entries.sort(key=lambda e: (e["r2Roll"], e["filename"]))
    all_urls = [e["url"] for e in entries]
    ge2 = [e["url"] for e in entries if e["rating"] >= 2]
    ge3 = [e["url"] for e in entries if e["rating"] >= 3]
    ge4 = [e["url"] for e in entries if e["rating"] >= 4]

    (OUT / "all-photos.json").write_text(json.dumps(all_urls, indent=2))
    (OUT / "photos-ge2.json").write_text(json.dumps(ge2, indent=2))
    (OUT / "curated-ge3.json").write_text(json.dumps(ge3, indent=2))
    (OUT / "highlights-ge4.json").write_text(json.dumps(ge4, indent=2))
    (OUT / "entries.json").write_text(json.dumps(entries, indent=2))

    summary = {
        "total": len(entries),
        "ratingCounts": dict(sorted(rating_counts.items())),
        "ge2": len(ge2),
        "ge3": len(ge3),
        "ge4": len(ge4),
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))
    if len(entries) != 300:
        print(f"ERROR: expected 300 files in export, got {len(entries)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
