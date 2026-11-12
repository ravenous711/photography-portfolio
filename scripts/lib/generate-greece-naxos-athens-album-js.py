#!/usr/bin/env python3
"""Patch Naxos/Athens in greece-2026.js and greece-2026-all.js from star manifests."""
from __future__ import annotations

import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ALL_JS = REPO / "js/albums/greece-2026-all.js"
PUBLIC_JS = REPO / "js/albums/greece-2026.js"
NAXOS_MANIFEST = Path("/tmp/greece-naxos-manifest")
ATHENS_MANIFEST = Path("/tmp/greece-athens-manifest")
R2_HOST = "pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev"


def js_urls(urls: list[str], indent: str = "      ") -> str:
    lines = [f"{indent}`{u}`," for u in urls]
    return "\n".join(lines)


def tmpl_list(urls: list[str]) -> list[str]:
    out = []
    for u in urls:
        path = u.split(f"{R2_HOST}/", 1)[1]
        out.append(f"${{R2_BASE_URL}}/{path}")
    return out


def patch_photos_block(src: str, album_id: str, next_album_id: str, urls: list[str]) -> str:
    pat = re.compile(
        rf"(id: '{re.escape(album_id)}'[\s\S]*?photos: \[)[\s\S]*?\n    \],(\n  \}},\n+  \{{\n    id: '{re.escape(next_album_id)}')",
    )
    block = "\n" + js_urls(tmpl_list(urls)) + "\n    ],"

    def repl(m: re.Match[str]) -> str:
        return m.group(1) + "\n" + block + m.group(2)

    out, n = pat.subn(repl, src, count=1)
    if n != 1:
        raise ValueError(f"could not find photos block for {album_id}")
    return out


NAXOS_COVER_PATH = "Greece/Naxos/13-Ektar100/13_9_28_Ektar100_06.jpg"
ATHENS_COVER_PATH = "Greece/Athens/22-Portra400/22_10_3_portra400_31.jpg"


def cover_from_manifest(manifest: Path, ge3: list[str], ge2: list[str], *, island: str) -> str:
    if island == "naxos":
        return f"`${{R2_BASE_URL}}/{NAXOS_COVER_PATH}`"
    if island == "athens":
        return f"`${{R2_BASE_URL}}/{ATHENS_COVER_PATH}`"
    pick = ge3[0] if ge3 else (ge2[0] if ge2 else "")
    if not pick:
        return f"`${{R2_BASE_URL}}/{NAXOS_COVER_PATH}`"
    path = pick.split(f"{R2_HOST}/", 1)[1]
    return f"`${{R2_BASE_URL}}/{path}`"


def patch_public_album(
    src: str,
    album_id: str,
    *,
    cover_js: str,
    cover_position: str,
    ge3t: list[str],
    ge2t: list[str],
) -> str:
    body = (
        f"    coverImage: {cover_js},\n"
        f"    coverPosition: '{cover_position}',\n"
        f"    curated: [\n{js_urls(ge3t)}\n    ],\n"
        f"    photos: [\n{js_urls(ge2t)}\n    ],"
    )
    pat = re.compile(
        rf"(  {{\n    id: '{re.escape(album_id)}',[\s\S]*?protected: false,\n)"
        rf"[\s\S]*?"
        rf"(\n  }},)",
    )

    def repl(m: re.Match[str]) -> str:
        return m.group(1) + body + m.group(2)

    out, n = pat.subn(repl, src, count=1)
    if n != 1:
        raise ValueError(f"could not patch public album {album_id}")
    return out


def main() -> None:
    nax_all = json.loads((NAXOS_MANIFEST / "all-photos.json").read_text())
    nax2 = json.loads((NAXOS_MANIFEST / "photos-ge2.json").read_text())
    nax3 = json.loads((NAXOS_MANIFEST / "curated-ge3.json").read_text())
    nax4 = json.loads((NAXOS_MANIFEST / "highlights-ge4.json").read_text())

    ath_all = json.loads((ATHENS_MANIFEST / "all-photos.json").read_text())
    ath2 = json.loads((ATHENS_MANIFEST / "photos-ge2.json").read_text())
    ath3 = json.loads((ATHENS_MANIFEST / "curated-ge3.json").read_text())
    ath4 = json.loads((ATHENS_MANIFEST / "highlights-ge4.json").read_text())

    nax2t, nax3t, nax4t = tmpl_list(nax2), tmpl_list(nax3), tmpl_list(nax4)
    ath2t, ath3t, ath4t = tmpl_list(ath2), tmpl_list(ath3), tmpl_list(ath4)

    nax_cover = cover_from_manifest(NAXOS_MANIFEST, nax3, nax2, island="naxos")
    ath_cover = cover_from_manifest(ATHENS_MANIFEST, ath3, ath2, island="athens")

    all_src = ALL_JS.read_text()
    all_src = patch_photos_block(
        all_src, "greece-naxos", "greece-athens", nax_all
    )
    all_src = patch_photos_block(
        all_src, "greece-athens", "greece-athena", ath_all
    )
    all_src = re.sub(
        r"(id: 'greece-naxos',[\s\S]*?coverImage: )`[^`]+`",
        rf"\1{nax_cover}",
        all_src,
        count=1,
    )
    all_src = re.sub(
        r"(id: 'greece-athens',[\s\S]*?coverImage: )`[^`]+`",
        rf"\1{ath_cover}",
        all_src,
        count=1,
    )
    ALL_JS.write_text(all_src)

    pub = PUBLIC_JS.read_text()
    pub = patch_public_album(
        pub,
        "greece-public-naxos",
        cover_js=nax_cover,
        cover_position="50% 42%",
        ge3t=nax3t,
        ge2t=nax2t,
    )
    pub = patch_public_album(
        pub,
        "greece-public-athens",
        cover_js=ath_cover,
        cover_position="50% 22%",
        ge3t=ath3t,
        ge2t=ath2t,
    )
    kalymnos_manifest = Path("/tmp/greece-kalymnos-manifest/highlights-ge4.json")
    if kalymnos_manifest.is_file():
        k4 = json.loads(kalymnos_manifest.read_text())
        merged_highlights = tmpl_list(k4) + nax4t + ath4t
    else:
        m = re.search(
            r"highlights: \[([\s\S]*?)\n    \],",
            pub,
        )
        existing: list[str] = []
        if m:
            for ln in m.group(1).splitlines():
                ln = ln.strip().rstrip(",")
                if ln.startswith("`") and ln.endswith("`"):
                    existing.append(ln)
        existing_set = set(existing)
        merged_highlights = existing + [
            u for u in nax4t + ath4t if u not in existing_set
        ]
    pub = re.sub(
        r"(id: 'greece-2026',[\s\S]*?highlights: \[)[\s\S]*?(\n    \],)",
        r"\1\n" + js_urls(merged_highlights) + r"\2",
        pub,
        count=1,
    )
    pub = re.sub(
        r"// Public Greece 2026 trip — Personal gallery\. Kalymnos live; Naxos/Athens TBD\.",
        "// Public Greece 2026 trip — Personal gallery. Kalymnos, Naxos, and Athens.",
        pub,
        count=1,
    )
    PUBLIC_JS.write_text(pub)

    print(f"Patched {ALL_JS} — naxos {len(nax_all)} photos, athens {len(ath_all)} photos")
    print(
        f"Patched {PUBLIC_JS} — public ge2 naxos {len(nax2t)} athens {len(ath2t)}; "
        f"added {len(nax4t) + len(ath4t)} highlight URLs"
    )


if __name__ == "__main__":
    main()
