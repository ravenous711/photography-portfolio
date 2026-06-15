#!/usr/bin/env python3
"""Aggregate Italy city film sections into full-roll photo lists."""

import json
import re
from pathlib import Path

CONFIG = Path(__file__).resolve().parents[1] / "js" / "config.js"
CITY_IDS = [
    "italy-venice",
    "italy-pisa",
    "italy-florence",
    "italy-assisi",
    "italy-rome",
]
ROLL_ORDER = [
    "Ultramax",
    "FP4",
    "TMAX",
    "Portra",
    "Athena-Ultramax-1",
    "Athena-Ultramax-2",
    "Athena-Ektar100",
]
def js_str(value):
    return value.replace("\\", "\\\\").replace("'", "\\'")


ROLL_META = {
    "Ultramax": {
        "id": "italy-roll-ultramax",
        "slug": "film-ultramax",
        "title": "Kodak Ultramax 400",
        "camera": "Minolta X-700",
        "filmStock": "Kodak Ultramax 400",
        "rollNumber": 1,
        "date": "May 2026",
        "cover": "ultramax_14.jpg",
    },
    "FP4": {
        "id": "italy-roll-fp4",
        "slug": "film-fp4",
        "title": "Ilford FP4 Plus 125",
        "camera": "Minolta X-700",
        "filmStock": "Ilford FP4 Plus 125",
        "rollNumber": 2,
        "date": "May–June 2026",
        "cover": "Fernando000799-R1-E017.jpg",
    },
    "Athena-Ultramax-1": {
        "id": "italy-roll-athena-ultramax-1",
        "slug": "film-athena-ultramax-1",
        "title": "Athena's Film Roll 1 — Kodak Ultramax 400",
        "camera": "Athena's Pentax 17",
        "filmStock": "Kodak Ultramax 400",
        "rollNumber": 1,
        "date": "May 2026",
        "cover": "athena_ultramax1_034.jpg",
    },
    "Athena-Ultramax-2": {
        "id": "italy-roll-athena-ultramax-2",
        "slug": "film-athena-ultramax-2",
        "title": "Athena's Film Roll 2 — Kodak Ultramax 400",
        "camera": "Athena's Pentax 17",
        "filmStock": "Kodak Ultramax 400",
        "rollNumber": 2,
        "date": "June 2026",
        "cover": "athena_ultramax2_030.jpg",
    },
    "TMAX": {
        "id": "italy-roll-tmax",
        "slug": "film-tmax",
        "title": "Kodak T-Max 400",
        "camera": "Minolta X-700",
        "filmStock": "Kodak T-Max 400",
        "rollNumber": 3,
        "date": "June 2026",
        "cover": "Fernando000800-R1-E014.jpg",
    },
    "Portra": {
        "id": "italy-roll-portra",
        "slug": "film-portra",
        "title": "Kodak Portra 160",
        "camera": "Minolta X-700",
        "filmStock": "Kodak Portra 160",
        "rollNumber": 4,
        "date": "June 2026",
        "cover": "Raveen_portra_16.jpg",
    },
    "Athena-Ektar100": {
        "id": "italy-roll-athena-ektar100",
        "slug": "film-athena-ektar100",
        "title": "Athena's Film Roll 3 — Kodak Ektar 100",
        "camera": "Athena's Pentax 17",
        "filmStock": "Kodak Ektar 100",
        "rollNumber": 3,
        "date": "June 2026",
        "cover": "athena_ektar100_024.jpg",
    },
}


def roll_key(url):
    match = re.search(r"/Italy/Film/([^/]+)/", url)
    return match.group(1) if match else None


def parse_config(text):
    rolls = {}

    for album_id in CITY_IDS:
        marker = f"id: '{album_id}'"
        start = text.find(marker)
        if start == -1:
            continue

        film_start = text.find("filmSections:", start)
        if film_start == -1:
            continue

        film_end = text.find("\n    ],", film_start)
        block = text[film_start:film_end]

        for section in re.finditer(
            r"\{\s*label: '((?:\\'|[^'])*)'[\s\S]*?photos: \[([\s\S]*?)\]\s*,?\s*\}",
            block,
        ):
            label, photos_block = section.groups()
            nav_match = re.search(r"navLabel: '((?:\\'|[^'])*)'", section.group(0))
            nav_label = nav_match.group(1).replace("\\'", "'") if nav_match else ""
            label = label.replace("\\'", "'")
            photos = re.findall(r"`([^`]+)`", photos_block)
            if not photos:
                continue

            key = roll_key(photos[0])
            if not key:
                continue

            entry = rolls.setdefault(
                key,
                {"label": label, "navLabel": nav_label, "photos": [], "seen": set()},
            )
            for photo in photos:
                if photo not in entry["seen"]:
                    entry["seen"].add(photo)
                    entry["photos"].append(photo)

    return rolls


def emit_albums(rolls):
    lines = ["  // ── ITALY FILM ROLLS (hidden — linked from Italy group page) ──"]
    for key in ROLL_ORDER:
        roll = rolls.get(key)
        meta = ROLL_META[key]
        if not roll:
            continue

        cover = next(
            (p for p in roll["photos"] if meta["cover"] in p),
            roll["photos"][0],
        )
        lines.extend(
            [
                "  {",
                f"    id: '{meta['id']}',",
                f"    slug: '{meta['slug']}',",
                "    parentId: 'italy-2026',",
                "    hidden: true,",
                "    albumKind: 'film-roll',",
                f"    title: '{js_str(meta['title'])}',",
                f"    camera: '{js_str(meta['camera'])}',",
                f"    filmStock: '{js_str(meta['filmStock'])}',",
                f"    rollNumber: {meta['rollNumber']},",
                f"    description: 'Full film roll — Italy 2026.',",
                "    location: 'Italy',",
                f"    date: '{meta['date']}',",
                "    protected: false,",
                f"    coverImage: `{cover}`,",
                "    photos: [",
            ]
        )
        for photo in roll["photos"]:
            lines.append(f"      `{photo}`,")
        lines.extend(["    ],", "  },", ""])
    lines.append("];")
    return "\n".join(lines)


def main():
    text = CONFIG.read_text(encoding="utf-8")
    rolls = parse_config(text)
    for key in ROLL_ORDER:
        if key in rolls:
            print(f"{key}: {len(rolls[key]['photos'])} photos")
    print()
    print(emit_albums(rolls))


if __name__ == "__main__":
    main()
