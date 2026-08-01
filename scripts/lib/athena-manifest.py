#!/usr/bin/env python3
"""Build Athena half-frame film manifests for R2 uploads and config.js."""

import json
import os
import re
import subprocess
import sys

ITALY = "/Volumes/PhotosSSD/Photos/2026/06 June/Italy"
F1 = f"{ITALY}/Athena 1 - Ultramax"
F2 = f"{ITALY}/Athena 2 Ultramax"
F3 = f"{ITALY}/Athena 3 - Ektar100"


def read_ratings(folder):
    r = subprocess.run(
        ["bash", "-lc", f'exiftool -Rating -filename -T "{folder}"/*.jpg 2>/dev/null'],
        capture_output=True,
        text=True,
        check=False,
    )
    out = {}
    for line in r.stdout.strip().split("\n"):
        if not line.strip():
            continue
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        rating_s, fname = parts[0], parts[1].strip()
        try:
            rating = int(rating_s)
        except ValueError:
            rating = 0
        out[fname] = rating
    return out


def frame_from(fname, prefix):
    m = re.search(rf"{re.escape(prefix)}_(\d+)", fname)
    return int(m.group(1)) if m else None


def bucket(frame):
    if frame <= 13:
        return "pisa"
    if frame <= 42:
        return "florence"
    if frame <= 57:
        return "assisi"
    return "rome"


def build_manifest():
    ratings1 = read_ratings(F1)
    roll1 = sorted(
        (f for f, r in ratings1.items() if r >= 2),
        key=lambda f: frame_from(f, "athena_ultramax1") or 0,
    )

    ratings2 = read_ratings(F2)
    roll2_all = sorted(
        (f for f, r in ratings2.items() if r >= 1),
        key=lambda f: frame_from(f, "athena_ultramax2") or 0,
    )
    roll2_by_city = {"pisa": [], "florence": [], "assisi": [], "rome": []}
    for f in roll2_all:
        fr = frame_from(f, "athena_ultramax2")
        if fr is not None:
            roll2_by_city[bucket(fr)].append(f)

    ratings3 = read_ratings(F3)
    roll3 = sorted(
        (
            f for f, r in ratings3.items()
            if r >= 1 and (frame_from(f, "athena_ektar100") or 999) <= 55
        ),
        key=lambda f: frame_from(f, "athena_ektar100") or 0,
    )

    return {
        "upload_batches": {
            "Italy/Film/Athena-Ultramax-1": {
                "folder": F1,
                "min_rating": 2,
                "files": roll1,
            },
            "Italy/Film/Athena-Ultramax-2": {
                "folder": F2,
                "min_rating": 1,
                "files": roll2_all,
            },
            "Italy/Film/Athena-Ektar100": {
                "folder": F3,
                "min_rating": 1,
                "max_frame": 55,
                "files": roll3,
            },
        },
        "film_sections": {
            "italy-venice": [{
                "label": "Half Frame Kodak Ultramax 400",
                "navLabel": "Athena's Film Roll 1",
                "r2_prefix": "Italy/Film/Athena-Ultramax-1",
                "files": roll1,
            }],
            "italy-pisa": [{
                "label": "Half Frame Kodak Ultramax 400",
                "navLabel": "Athena's Film Roll 2",
                "r2_prefix": "Italy/Film/Athena-Ultramax-2",
                "files": roll2_by_city["pisa"],
            }],
            "italy-florence": [{
                "label": "Half Frame Kodak Ultramax 400",
                "navLabel": "Athena's Film Roll 2",
                "r2_prefix": "Italy/Film/Athena-Ultramax-2",
                "files": roll2_by_city["florence"],
            }],
            "italy-assisi": [{
                "label": "Half Frame Kodak Ultramax 400",
                "navLabel": "Athena's Film Roll 2",
                "r2_prefix": "Italy/Film/Athena-Ultramax-2",
                "files": roll2_by_city["assisi"],
            }],
            "italy-rome": [
                {
                    "label": "Half Frame Kodak Ultramax 400",
                    "navLabel": "Athena's Film Roll 2",
                    "r2_prefix": "Italy/Film/Athena-Ultramax-2",
                    "files": roll2_by_city["rome"],
                },
                {
                    "label": "Half Frame Kodak Ektar 100",
                    "navLabel": "Athena's Film Roll 3",
                    "r2_prefix": "Italy/Film/Athena-Ektar100",
                    "files": roll3,
                },
            ],
        },
    }


def js_str(value):
    return value.replace("\\", "\\\\").replace("'", "\\'")


def emit_section(section):
    prefix = section["r2_prefix"]
    label = js_str(section["label"])
    nav = js_str(section["navLabel"])
    lines = [
        "      {",
        f"        label: '{label}',",
        f"        navLabel: '{nav}',",
        "        photos: [",
    ]
    for fname in section["files"]:
        lines.append(f"          `${{R2_BASE_URL}}/{prefix}/{fname}`,")
    lines.append("        ],")
    lines.append("      },")
    return "\n".join(lines)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "summary"
    manifest = build_manifest()

    if mode == "summary":
        print("Upload batches:")
        for prefix, batch in manifest["upload_batches"].items():
            print(f"  {prefix}: {len(batch['files'])} files")
        print("\nFilm sections:")
        for album, sections in manifest["film_sections"].items():
            for s in sections:
                print(f"  {album} — {s['navLabel']}: {len(s['files'])} photos")
        return

    if mode == "json":
        print(json.dumps(manifest, indent=2))
        return

    if mode == "upload-lists":
        for prefix, batch in manifest["upload_batches"].items():
            safe = prefix.replace("/", "_")
            path = f"/tmp/athena_upload_{safe}.txt"
            with open(path, "w", encoding="utf-8") as fh:
                fh.write("\n".join(batch["files"]))
                fh.write("\n")
            print(f"{path} ({len(batch['files'])} files)")
        return

    if mode == "config":
        for album, sections in manifest["film_sections"].items():
            print(f"// --- {album} ---")
            for section in sections:
                print(emit_section(section))
                print()
        return

    if mode == "patch-config":
        config_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "js",
            "config.js",
        )
        with open(config_path, encoding="utf-8") as fh:
            content = fh.read()

        for album_id, sections in manifest["film_sections"].items():
            marker = f"id: '{album_id}'"
            idx = content.find(marker)
            if idx == -1:
                print(f"Warning: album not found: {album_id}", file=sys.stderr)
                continue

            film_idx = content.find("filmSections:", idx)
            if film_idx == -1:
                print(f"Warning: no filmSections for {album_id}", file=sys.stderr)
                continue

            close_idx = content.find("\n    ],", film_idx)
            if close_idx == -1:
                print(f"Warning: could not find filmSections end for {album_id}", file=sys.stderr)
                continue

            insert = "\n".join(emit_section(section) for section in sections) + "\n"
            content = content[:close_idx] + "\n" + insert + content[close_idx:]
            print(f"Patched {album_id} (+{len(sections)} section(s))")

        with open(config_path, "w", encoding="utf-8") as fh:
            fh.write(content)
        return

    print(f"Unknown mode: {mode}", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
