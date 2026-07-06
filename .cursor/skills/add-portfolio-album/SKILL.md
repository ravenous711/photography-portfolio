---
name: add-portfolio-album
description: Guides the user through adding a new photo album to the photography portfolio site. Use when the user wants to upload photos, create an album, add a new album to the site, or mentions Lightroom, Cloudflare R2, or wrangler in the context of their photography portfolio.
---

# Add Portfolio Album

Workflow for adding a new album to Raveen's photography portfolio. Always follow all steps in order.

## Key facts
- Public R2 bucket: `portfolio-images` — public albums + grid thumbnails for ALL albums
- Private R2 bucket: `portfolio-images-private` — family and client album originals
- Cloudflare account ID: `723c27febd4a099c7884fdf00de2329f`
- R2 base URL: `https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev`
- Live site: `https://photography-portfolio-pi-blush.vercel.app`
- Wrangler path: `/opt/homebrew/bin/wrangler` — always `export PATH="/opt/homebrew/bin:$PATH"` first
- Albums config: `js/config.js` (repo root)
- External drive: `/Volumes/PhotosSSD/Photos/`

## Audience tiers

| Audience | Who sees it | Bucket | Shows on |
|---|---|---|---|
| `public` | Everyone | public | `/gallery/` |
| `friends` | Friends password | public | `/gallery/` + `/fullalbums/` |
| `family` | Raveen master password | private | `/family/` (both groups) |
| `family:anger-ali` | Anger-Ali family password | private | `/family/` (Anger-Ali section) |
| `family:fernando` | Fernando family password | private | `/family/` (Fernando section) |
| `client:<name>` | Client access code | private | admin only |

**Always set `hidden: true` for family and client albums.**
No `PASSWORD_TIERS` edit needed for family sub-tiers — they are already configured.

## Cloudflare rate limit behaviour
- R2 API rate-limits sequential uploads — always auto-retry (see helper below)
- During an active session, use `sleep 15` between originals, `sleep 10` between grids
- **Never use `sleep 5`** — too fast, causes consistent failures
- **Never interleave orig/grid per file** — upload all originals first, then all grids

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

Grids always go to the **public** bucket (`portfolio-images/grid/...`), even for private family albums.
They power the album card thumbnails on `/gallery/` and `/family/`.

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

Run backgrounded (`block_until_ms: 0`, `required_permissions: ["all", "full_network"]`):

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
  sleep 15
done
echo "=== Done. Failures: $fail ==="
```

## Step 5 — Upload grid images

Always to the **public** bucket. Run after originals complete:

```bash
export PATH="/opt/homebrew/bin:$PATH"
setopt nullglob
GRID_DIR="/tmp/grid_<R2-folder-name>"
DEST="portfolio-images/grid/<R2-folder-name>"
gfail=0

for f in "$GRID_DIR"/*.jpg; do
  [ -f "$f" ] || continue
  upload_with_retry "$DEST/$(basename "$f")" "$f" "grid $(basename "$f")" || gfail=$((gfail+1))
  sleep 10
done
echo "=== Grid done. Failures: $gfail ==="
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
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/r2/buckets/portfolio-images/objects?prefix=grid/$FOLDER_NAME/&per_page=1000" \
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
  audience: 'family:anger-ali',   // or family:fernando / friends / public
  hidden: true,                    // always true for family albums
  protected: false,
  digitalLabel: 'Fujifilm X-T5',  // optional — label above digital grid
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
