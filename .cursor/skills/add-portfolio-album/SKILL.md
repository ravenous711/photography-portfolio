---
name: add-portfolio-album
description: Guides the user through adding a new photo album to the photography portfolio site. Use when the user wants to upload photos, create an album, add a new album to the site, or mentions Lightroom, Cloudflare R2, or wrangler in the context of their photography portfolio.
---

# Add Portfolio Album

Workflow for adding a new album to Raveen's photography portfolio. Always follow all steps in order.

## Key facts
- Public R2 bucket: `portfolio-images` — public/friends album originals + their grid thumbnails (`grid/...`)
- Private R2 bucket: `portfolio-images-private` — family/client album originals **and** their grid thumbnails (`grid/...`)
- Family/client grids are never in the public bucket — the Worker serves `grid/<key>` from the private bucket behind a token
- Cloudflare account ID: `723c27febd4a099c7884fdf00de2329f`
- R2 base URL: `https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev`
- Live site: `https://photography-portfolio-pi-blush.vercel.app`
- Wrangler path: `/opt/homebrew/bin/wrangler` — always `export PATH="/opt/homebrew/bin:$PATH"` first
- Albums config: `js/config.js` (repo root)
- External drive: `/Volumes/PhotosSSD/Photos/`

## Audience tiers

| Audience | Who sees it | Originals bucket | Grid bucket | Shows on |
|---|---|---|---|---|
| `public` | Everyone | public | public (`grid/...`) | `/gallery/` |
| `friends` | Friends password (legacy tier) | public | public (`grid/...`) | `/gallery/` (full album via in-page toggle) |
| `family` | Family password | private | private (`grid/...`) | `/family/` |
| `client:<name>` | Client access code | private | private (`grid/...`) | admin only |

**Always set `hidden: true` for family and client albums.**
Family albums use `audience: 'family'` — password hash is already in `PASSWORD_TIERS`.

## Cloudflare rate limit behaviour
- R2 API rate-limits sequential uploads — always auto-retry (see helper below)
- During an active session, use **`sleep 10` between originals** (~26MB JPGs), `sleep 10` between grids
- Jul 2026 tuning: 8s between originals caused frequent `fetch failed` retries; 14–15s was very stable; **10s is the practical default** (retries still handle transient blips)
- Avoid `sleep 5` between large originals unless you accept more retries
- **Never interleave orig/grid per file** — run as **two parallel processes**: originals sequential in one, grids parallel in the other
- **Check `IMPROVEMENTS.md` → Active album session** for in-flight uploads and the album queue before starting new work

## Path gotchas (macOS + zsh)

**Spaces in paths**: Never build file lists with `ls | xargs basename`. Use a bash loop:
```bash
FILES=()
for f in "$FOLDER"/*.jpg "$FOLDER"/*.JPG; do
  [ -f "$f" ] || continue
  FILES+=("$(basename "$f")")
done
IFS=$'\n' FILES=($(printf '%s\n' "${FILES[@]}" | sort))
unset IFS
```

**zsh nullglob**: In zsh, unmatched globs (`*.JPG` when no JPGs exist) throw errors. Add at the top of every upload script:
```bash
setopt nullglob
```

## Upload helper — use in every upload loop

```bash
upload_with_retry() {
  local dest="$1" file="$2" label="$3"
  local wait
  for attempt in 1 2 3 4; do
    if wrangler r2 object put "$dest" --file "$file" --remote; then
      echo "✓ $label"
      return 0
    fi
    if [ "$attempt" -lt 4 ]; then
      case $attempt in 1) wait=15;; 2) wait=30;; 3) wait=60;; esac
      echo "↻ retry $attempt/3 for $label (sleep ${wait}s)..."
      sleep "$wait"
    fi
  done
  echo "✗ FAILED: $label"
  return 1
}
```

## Step 1 — Gather info (ask the user)

1. **Photo folder path** — where are the photos locally?
2. **All photos or starred only?** — all JPGs, or only Lightroom star rating > 0?
3. **Audience** — see tier table above
4. **Album structure** — flat album (digital + optional filmSections) or multi-city group?
5. **Album name** — suggest one from the folder name if not given

## Step 2 — Find starred photos (if filtering by rating)

Run in Cursor shell (`required_permissions: ["all"]`):
```bash
export PATH="/opt/homebrew/bin:$PATH"
FOLDER="<path>"
exiftool -Rating -filename -T "$FOLDER"/*.JPG 2>/dev/null | awk -F'\t' '$1 > 0 {print $2}' | sort
```

## Step 3 — Generate grid images locally (1200px)

Generate 1200px grids locally for every album. Upload destination depends on audience:
- **Public / friends** → `portfolio-images/grid/<R2-folder-name>/`
- **Family / client** → `portfolio-images-private/grid/<R2-folder-name>/` (served via Worker token)

```bash
export PATH="/opt/homebrew/bin:$PATH"
setopt nullglob
FOLDER="<local path>"
GRID_DIR="/tmp/grid_<R2-folder-name>"
mkdir -p "$GRID_DIR"

for f in "$FOLDER"/*.jpg "$FOLDER"/*.JPG; do
  [ -f "$f" ] || continue
  sips -Z 1200 "$f" --out "$GRID_DIR/$(basename "$f")" --setProperty formatOptions 80 2>/dev/null \
    && echo "✓ grid $(basename "$f")" || echo "✗ FAILED grid: $(basename "$f")"
done
echo "Done. $(ls "$GRID_DIR" | wc -l | tr -d ' ') grid images"
```

## Step 4 — Upload originals

- **Public / friends albums** → `portfolio-images/<R2-folder-name>`
- **Family / client albums** → `portfolio-images-private/<R2-folder-name>`

Run as **process 1** (backgrounded, `block_until_ms: 0`). Sequential, one file at a time.
Start **Step 5 grids in parallel** — do not wait for originals to finish.

```bash
export PATH="/opt/homebrew/bin:$PATH"
setopt nullglob
FOLDER="<local path>"
DEST="portfolio-images/<R2-folder-name>"   # or portfolio-images-private/...
fail=0

FILES=()
for f in "$FOLDER"/*.jpg "$FOLDER"/*.JPG; do
  [ -f "$f" ] || continue
  FILES+=("$f")
done
IFS=$'\n' FILES=($(printf '%s\n' "${FILES[@]}" | sort)); unset IFS

for f in "${FILES[@]}"; do
  upload_with_retry "$DEST/$(basename "$f")" "$f" "$(basename "$f")" || fail=$((fail+1))
  sleep 10
done
echo "=== Done. Failures: $fail ==="
```

## Step 5 — Upload grid images

Run as **process 2** at the same time as Step 4 (also backgrounded). Match the audience bucket:
- **Public / friends** → `portfolio-images/grid/<R2-folder-name>/`
- **Family / client** → `portfolio-images-private/grid/<R2-folder-name>/`

Grids are small (~1–3 MB) — upload **5 concurrent** within this process. Originals stay sequential in process 1.

```bash
export PATH="/opt/homebrew/bin:$PATH"
setopt nullglob
GRID_DIR="/tmp/grid_<R2-folder-name>"
DEST="portfolio-images/grid/<R2-folder-name>"   # or portfolio-images-private/grid/...
CONCURRENCY=5
gfail=0

for f in "$GRID_DIR"/*.jpg; do
  [ -f "$f" ] || continue
  while (( $(jobs | wc -l | tr -d ' ') >= CONCURRENCY )); do sleep 2; done
  (
    upload_with_retry "$DEST/$(basename "$f")" "$f" "grid $(basename "$f")" || exit 1
  ) &
done
wait || gfail=1
echo "=== Grid done. Check output above for failures ==="
```

## Step 6 — Verify via manifest

After both upload loops finish, run automatically:

```bash
export PATH="/opt/homebrew/bin:$PATH"
TOKEN=$(grep 'oauth_token' ~/Library/Preferences/.wrangler/config/default.toml | awk -F'"' '{print $2}')
ACCOUNT_ID="723c27febd4a099c7884fdf00de2329f"
BUCKET="portfolio-images"   # or portfolio-images-private for family/client
FOLDER_NAME="<R2-folder-name>"

echo "=== Originals ==="
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/r2/buckets/$BUCKET/objects?prefix=$FOLDER_NAME/&per_page=1000" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import json, sys
data = json.load(sys.stdin)
uploaded = sorted(o['key'].split('/')[-1] for o in data['result'])
print(f'Found {len(uploaded)} files')
"

echo "=== Grid ==="
GRID_BUCKET="$BUCKET"   # same bucket as originals (public or private)
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/r2/buckets/$GRID_BUCKET/objects?prefix=grid/$FOLDER_NAME/&per_page=1000" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(f'Found {len(data[\"result\"])} grid images')
"
```

Retry any missing files before moving on.

## Step 7 — Add album to config.js

Read `js/config.js` first. Use `${R2_BASE_URL}/<R2-folder-name>/` for all photo URLs regardless of bucket — the album page rewrites family/client URLs to Worker tokens at runtime via `toImageUrl()`.

### Flat album with digital + film sections (Maryland / Red Rock pattern)

Use this for a single event with mixed digital and film:

```js
{
  id: '<slug>',
  title: '<Title>',
  description: '<Short description.>',
  location: '<City>',
  date: '<Month YYYY>',
  audience: 'family',                  // or friends / public / client:<name>
  hidden: true,                        // always true for family albums
  protected: false,
  familySlug: 'short-descriptive-slug', // gives URL /familyalbums/YYYY/short-descriptive-slug/
  digitalLabel: 'Fujifilm X-T5',       // optional — label above digital grid
  coverImage: `${R2_BASE_URL}/<R2-folder-name>/<COVER.jpg>`,
  photos: [
    `${R2_BASE_URL}/<R2-folder-name>/<PHOTO1.jpg>`,
    // ...
  ],
  filmSections: [
    {
      label: '<Camera> — <Film Stock>',
      navLabel: '<Short label>',   // shown in jump nav
      camera: '<Camera>',
      filmStock: '<Film Stock>',
      photos: [
        `${R2_BASE_URL}/<film-R2-folder>/<FRAME1.jpg>`,
        // ...
      ],
    },
    // add more sections for additional rolls
  ],
},
```

### Public/friends flat album

```js
{
  id: '<slug>',
  title: '<Title>',
  description: '<Short description.>',
  audience: 'friends',
  protected: false,
  coverImage: `${R2_BASE_URL}/<R2-folder-name>/<FIRST.jpg>`,
  photos: [ `${R2_BASE_URL}/<R2-folder-name>/<PHOTO1.jpg>`, ... ],
  // curated: []  ← add via admin "Save as curated set" after photos are live
},
```

### Multi-city group album (Italy pattern)

Use for trips with multiple distinct locations. Each city is a sub-album with `parentId` + `slug`. Separate hidden film-roll albums can be linked from the group page. See existing Italy 2026 albums in config for the full pattern.

## Step 8 — Commit

```bash
git add js/config.js && git commit -m "Add <album name> album"
```

Push to `main` only when explicitly asked — Vercel auto-deploys in ~30 seconds.

## Step 9 — Share link (if hidden)

Family albums: direct the user to `/family/` after unlocking with their password.
Client albums: create an access code via `/admin/` → Access codes tab.
