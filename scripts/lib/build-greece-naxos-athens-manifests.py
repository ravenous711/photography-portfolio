#!/usr/bin/env python3
"""Build per-roll manifests and URL lists from Naxos / Athens Export XMP ratings."""
from __future__ import annotations

import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

R2_BASE = "https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev"

ISLANDS = [
    {
        "name": "naxos",
        "export": Path(
            "/Users/raveenfernando/Pictures/In Progress/Greece Film/Naxos Export"
        ),
        "out": Path("/tmp/greece-naxos-manifest"),
        "r2_location": "Greece/Naxos",
        "roll_map": [
            ("11_9_27_portra160", "11-Portra160"),
            ("12_9_28_portra_400", "12-Portra400"),
            ("13_9_28_Ektar100", "13-Ektar100"),
            ("14_9_28_cinestill800", "14-Cinestill800"),
            ("15_9_29_tmax100", "15-TMax100"),
            ("16_9_30_ultramax400", "16-Ultramax400"),
            ("17_10_1_TMAX400", "17-TMax400"),
            ("18_10_1_ektar100", "18-Ektar100"),
            ("19_10_2_portra400", "19-Portra400"),
            ("20_10_3_Portra_160", "20-Portra160"),
        ],
    },
    {
        "name": "athens",
        "export": Path(
            "/Users/raveenfernando/Pictures/In Progress/Greece Film/Athens Export"
        ),
        "out": Path("/tmp/greece-athens-manifest"),
        "r2_location": "Greece/Athens",
        "roll_map": [
            ("20_10_3_Portra_160", "20-Portra160"),
            ("21_10_3_portra1400", "21-Portra400"),
            ("22_10_3_portra400", "22-Portra400"),
        ],
    },
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


def build_island(cfg: dict) -> dict:
    export: Path = cfg["export"]
    out: Path = cfg["out"]
    out.mkdir(parents=True, exist_ok=True)
    entries: list[dict] = []
    rating_counts: Counter[int] = Counter()

    if not export.is_dir():
        print(f"ERROR: missing export folder {export}", file=sys.stderr)
        return {"error": True}

    for local_prefix, r2_roll in cfg["roll_map"]:
        files = sorted(
            p
            for p in export.glob("*.jpg")
            if p.name.startswith(local_prefix + "_")
        )
        (out / f"{r2_roll}.txt").write_text(
            "\n".join(p.name for p in files) + ("\n" if files else "")
        )
        for p in files:
            r = rating_for(p)
            rating_counts[r] += 1
            url = f"{R2_BASE}/{cfg['r2_location']}/{r2_roll}/{p.name}"
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

    (out / "all-photos.json").write_text(json.dumps(all_urls, indent=2))
    (out / "photos-ge2.json").write_text(json.dumps(ge2, indent=2))
    (out / "curated-ge3.json").write_text(json.dumps(ge3, indent=2))
    (out / "highlights-ge4.json").write_text(json.dumps(ge4, indent=2))
    (out / "entries.json").write_text(json.dumps(entries, indent=2))

    summary = {
        "island": cfg["name"],
        "total": len(entries),
        "ratingCounts": dict(sorted(rating_counts.items())),
        "ge2": len(ge2),
        "ge3": len(ge3),
        "ge4": len(ge4),
    }
    (out / "summary.json").write_text(json.dumps(summary, indent=2))
    return summary


def main() -> int:
    summaries = []
    for cfg in ISLANDS:
        s = build_island(cfg)
        if s.get("error"):
            return 1
        summaries.append(s)
        print(json.dumps(s, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
