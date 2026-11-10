#!/usr/bin/env python3
"""Emit js/albums/greece-2026.js and patch greece-kalymnos in greece-2026-all.js."""
from __future__ import annotations

import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MANIFEST = Path("/tmp/greece-kalymnos-manifest")
ALL_JS = REPO / "js/albums/greece-2026-all.js"
PUBLIC_JS = REPO / "js/albums/greece-2026.js"


def js_urls(urls: list[str], indent: str = "      ") -> str:
    lines = [f'{indent}`{u}`,' for u in urls]
    return "\n".join(lines)


def main() -> None:
    all_photos = json.loads((MANIFEST / "all-photos.json").read_text())
    ge2 = json.loads((MANIFEST / "photos-ge2.json").read_text())
    ge3 = json.loads((MANIFEST / "curated-ge3.json").read_text())
    ge4 = json.loads((MANIFEST / "highlights-ge4.json").read_text())

    src = ALL_JS.read_text()
    roll10 = re.findall(
        r"`\$\{R2_BASE_URL\}/Greece/Kalymnos/10-Portra400/[^`]+`",
        src,
    )
    roll10_urls = [m.strip("`") for m in roll10]
    # Convert template to literal for json merge - they're still with ${R2_BASE_URL}
    roll10_lines = [ln.strip().strip(",") for ln in roll10]
    # Extract path suffix after R2_BASE_URL/
    roll10_paths = []
    for ln in roll10_lines:
        m = re.search(r"\$\{R2_BASE_URL\}/(.+)`", ln)
        if m:
            roll10_paths.append(m.group(1))

    def r2(path: str) -> str:
        return f"${{R2_BASE_URL}}/{path}"

    hidden_photos = all_photos + [r2(p) for p in roll10_paths]

    cover = ge4[0] if ge4 else all_photos[0]
    cover_expr = (
        "${R2_BASE_URL}/" + cover.split("/Greece/", 1)[1]
        if "/Greece/" in cover
        else cover
    )
    # Use template form
    cover_js = f"`${{R2_BASE_URL}}/{cover.split('/Greece/', 1)[1]}`"

    # Patch kalymnos photos array in greece-2026-all.js
    start = src.index("    photos: [", src.index("id: 'greece-kalymnos'"))
    end = src.index("    ],\n  },\n\n  {\n    id: 'greece-naxos'", start)
    new_block = "    photos: [\n" + js_urls([u.replace("https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/", "${R2_BASE_URL}/") if u.startswith("https://") else u for u in all_photos], indent="      ")
    # Fix URLs to use R2_BASE_URL template
    fixed_all = []
    for u in all_photos:
        path = u.split("pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/", 1)[1]
        fixed_all.append(f"${{R2_BASE_URL}}/{path}")
    new_block = "    photos: [\n" + js_urls(fixed_all)
    for p in roll10_paths:
        new_block += f"\n      `${{R2_BASE_URL}}/{p}`,"
    new_block += "\n    ],"
    updated = src[:start] + new_block + src[end + len("    ],") :]

    # Update covers (group + kalymnos)
    updated = re.sub(
        r"(id: 'greece-2026-all',[\s\S]*?coverImage: )`[^`]+`",
        rf"\1{cover_js}",
        updated,
        count=1,
    )
    updated = re.sub(
        r"(id: 'greece-kalymnos',[\s\S]*?coverImage: )`[^`]+`",
        rf"\1{cover_js}",
        updated,
        count=1,
    )
    ALL_JS.write_text(updated)

    def tmpl_list(urls: list[str]) -> list[str]:
        out = []
        for u in urls:
            path = u.split("pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/", 1)[1]
            out.append(f"${{R2_BASE_URL}}/{path}")
        return out

    ge4t, ge3t, ge2t = tmpl_list(ge4), tmpl_list(ge3), tmpl_list(ge2)

    naxos_cover = "`${R2_BASE_URL}/Greece/Naxos/13-Ektar100/000007330006_Ektar100.jpg`"
    athens_cover = "`${R2_BASE_URL}/Greece/Athens/22-Portra400/000007220031_Portra400.jpg`"

    public_js = f"""// ============================================================
// greece-2026.js
// ============================================================
// Public Greece 2026 trip — Personal gallery. Kalymnos live; Naxos/Athens TBD.
// ============================================================

// eslint-disable-next-line no-unused-vars
const ALBUMS_GREECE_2026 = [
  {{
    id: 'greece-2026',
    title: 'Greece 2026',
    description: 'Kalymnos, Naxos, and Athens.',
    location: 'Greece',
    date: 'September 2026',
    type: 'group',
    audience: 'public',
    protected: false,
    showFilmRolls: false,
    subAlbums: ['greece-public-kalymnos', 'greece-public-naxos', 'greece-public-athens'],
    coverImage: {cover_js},
    chaptersTitle: 'Albums',
    highlights: [
{js_urls(ge4t, indent="      ")}
    ],
  }},

  {{
    id: 'greece-public-kalymnos',
    slug: 'kalymnos',
    title: 'Kalymnos',
    parentId: 'greece-2026',
    location: 'Kalymnos',
    date: 'September 2026',
    dateline: false,
    audience: 'public',
    hidden: false,
    protected: false,
    coverImage: {cover_js},
    coverPosition: 'center top',
    curated: [
{js_urls(ge3t, indent="      ")}
    ],
    photos: [
{js_urls(ge2t, indent="      ")}
    ],
  }},

  {{
    id: 'greece-public-naxos',
    slug: 'naxos',
    title: 'Naxos',
    parentId: 'greece-2026',
    location: 'Naxos',
    date: 'September 2026',
    dateline: false,
    audience: 'public',
    hidden: false,
    protected: false,
    description: 'Coming soon.',
    coverImage: {naxos_cover},
    photos: [],
  }},

  {{
    id: 'greece-public-athens',
    slug: 'athens',
    title: 'Athens',
    parentId: 'greece-2026',
    location: 'Athens',
    date: 'September–October 2026',
    dateline: false,
    audience: 'public',
    hidden: false,
    protected: false,
    description: 'Coming soon.',
    coverImage: {athens_cover},
    photos: [],
  }},
];
"""
    PUBLIC_JS.write_text(public_js)
    print(f"Wrote {PUBLIC_JS}")
    print(f"Patched {ALL_JS} — hidden kalymnos photos: {len(fixed_all) + len(roll10_paths)}")


if __name__ == "__main__":
    main()
