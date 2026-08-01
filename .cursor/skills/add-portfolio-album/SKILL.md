---
name: add-portfolio-album
description: Guides the user through adding a new photo album to the photography portfolio site. Use when the user wants to upload photos, create an album, add a new album to the site, or mentions Lightroom, Cloudflare R2, or wrangler in the context of their photography portfolio.
---

# Add Portfolio Album

Workflow for adding a new album to Raveen's photography portfolio. Always follow all steps in order.

## Key facts
- Public R2 bucket: `portfolio-images` — public album originals + their grid thumbnails (`grid/...`)
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
| `public` | Everyone (curated default; full album via toggle) | public | public (`grid/...`) | `/gallery/` |
| `family` | Family password | private | private (`grid/...`) | `/familyalbums/` |
| `client:<name>` | Client access code | private | private (`grid/...`) | album URL only |

**Always set `hidden: true` for family and client albums.**
Family albums use `audience: 'family'` — password hash is already in `PASSWORD_TIERS`.
City/travel albums use `audience: 'public'`. (Legacy `friends` tier removed Aug 2026.)

## Cloudflare rate limit behaviour
- R2 API rate-limits concurrent uploads — always auto-retry (see helper below)
- **Never interleave orig/grid per file** — run originals and grids as **separate parallel processes**
- **Check `IMPROVEMENTS.md` → Active album session** for in-flight uploads and the album queue before starting new work

### Sleep between originals (~26 MB Fujifilm JPGs)
| Gap | Result |
|---|---|
| 8s | Frequent `fetch failed` retries |
| **10s** | Practical default (1 sequential worker) |
| 14–15s | Very stable |
| 2–3s | OK when using **4–6 parallel workers** on the same folder |

### How many parallel workers?

| File type | Safe concurrency | Notes |
|---|---|---|
| **Grids** (~1–3 MB) | **5–10** concurrent | Rarely rate-limits; default `CONCURRENCY=5` |
| **Originals, one R2 sub-folder** | **4–6** workers | Split file list evenly; **2–3s sleep** inside each worker |
| **Originals, multiple sub-folders** | **Up to 10 jobs** | One job per sub-folder (e.g. Digital + each film roll); sequential inside each job |

**Rule of thumb:** ~6 concurrent large original PUTs is the sweet spot before retries spike. Ten jobs works when spread across **different R2 paths**, not 10 workers all hitting the same `Digital/` prefix.

### Recommended upload layout

**Single folder** (one R2 path): 2 processes — originals sequential (10s) + grids (5 concurrent).

**Multi-folder album** (Digital + film rolls — e.g. Holland Tulip, Venice): launch **all jobs in parallel**:
- One originals job per R2 sub-folder (`Digital/`, `Raveen-Ultramax/`, …)
- One grids job per matching sub-folder
- Example: 5 sub-folders → **10 parallel jobs** (5 orig + 5 grid)

**Finishing stragglers:** If a sequential job is slow or has failures, stop it and split the **remaining file list** across **4 parallel workers** (2s sleep, auto-retry). Re-verify manifest and retry any still missing.

### Parallel multi-folder launcher (template)

Save manifests to `/tmp/<album>-manifest/` (one filename per line, sorted). Then:

```bash
export PATH="/opt/homebrew/bin:$PATH"
BUCKET="portfolio-images-private"   # or portfolio-images
PREFIX="<R2-folder-name>"
BASE="/Volumes/PhotosSSD/Photos/..."
MANIFEST="/tmp/<album>-manifest"
LOGDIR="/tmp/<album>-logs"
mkdir -p "$LOGDIR"

# upload_with_retry() — copy from helper below

upload_orig_section() {
  local key="$1" local_dir="$2" r2_sub="$3" log="$4"
  { echo "=== START orig $r2_sub $(date) ==="
    fail=0
    while IFS= read -r fname; do
      [[ -z "$fname" ]] && continue
      upload_with_retry "$BUCKET/$PREFIX/$r2_sub/$fname" "$local_dir/$fname" "orig $r2_sub/$fname" || fail=$((fail+1))
      sleep 10
    done < "$MANIFEST/$key.txt"
    echo "=== DONE orig $r2_sub fail=$fail $(date) ==="; exit $fail
  } > "$log" 2>&1
}

upload_grid_section() {
  local grid_dir="$1" r2_sub="$2" log="$3"
  { echo "=== START grid $r2_sub $(date) ==="
    fail=0
    for f in "/tmp/grid_$PREFIX/$grid_dir"/*; do
      [[ -f "$f" ]] || continue
      fname=$(basename "$f")
      upload_with_retry "$BUCKET/grid/$PREFIX/$r2_sub/$fname" "$f" "grid $r2_sub/$fname" || fail=$((fail+1))
    done
    echo "=== DONE grid $r2_sub fail=$fail $(date) ==="; exit $fail
  } > "$log" 2>&1
}

# Launch all jobs in parallel (adjust keys/paths per album)
upload_orig_section digital "$BASE" Digital "$LOGDIR/01-orig-digital.log" &
upload_orig_section raveen-film "$BASE/Raveen-Ultramax" Raveen-Ultramax "$LOGDIR/02-orig-raveen.log" &
# ... one orig + one grid job per sub-folder ...
wait
```

Monitor: `grep -c '^✓' $LOGDIR/*.log` and `grep '^✗ FAILED' $LOGDIR/*.log`.

### Replacing or removing R2 objects
```bash
wrangler r2 object delete portfolio-images-private/<key> --remote
wrangler r2 object delete portfolio-images-private/grid/<key> --remote
```
Update `config.js` to point at the new filename, then upload original + grid for the replacement.

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
4. **Album structure** — Venice-style (one page: digital + `filmSections` tabs), flat album, or multi-city group (Italy)
5. **Album name** — suggest one from the folder name if not given

## Step 2 — Find starred photos (if filtering by rating)

Run in Cursor shell (`required_permissions: ["all"]`):
```bash
export PATH="/opt/homebrew/bin:$PATH"
FOLDER="<path>"
exiftool -Rating -filename -T "$FOLDER"/*.JPG 2>/dev/null | awk -F'\t' '$1 > 0 {print $2}' | sort
```

## Step 3 — Generate grid and view images locally

New albums should generate **two derived tiers** from the originals:

| Tier | Size | Quality | R2 prefix | Purpose |
|------|------|---------|-----------|---------|
| `grid/` | 900px | q75 | `grid/<R2-folder-name>/` | Album scroll thumbnails |
| `view/` | 2048px | q80 | `view/<R2-folder-name>/` | Lightbox display |

Upload destination depends on audience:
- **Public** → `portfolio-images/grid/` and `portfolio-images/view/`
- **Family / client** → `portfolio-images-private/grid/` and `portfolio-images-private/view/` (served via Worker token)

Generate both tiers locally before uploading (or use `./scripts/upload-album.sh`, which now generates and uploads originals + `grid/` + `view/` in one pass):

```bash
export PATH="/opt/homebrew/bin:$PATH"
setopt nullglob
FOLDER="<local path>"
R2_NAME="<R2-folder-name>"
GRID_DIR="/tmp/grid_${R2_NAME}"
VIEW_DIR="/tmp/view_${R2_NAME}"
mkdir -p "$GRID_DIR" "$VIEW_DIR"

for f in "$FOLDER"/*.jpg "$FOLDER"/*.JPG; do
  [ -f "$f" ] || continue
  b="$(basename "$f")"
  sips -Z 900 "$f" --out "$GRID_DIR/$b" --setProperty formatOptions 75 2>/dev/null \
    && echo "✓ grid $b" || echo "✗ FAILED grid: $b"
  sips -Z 2048 "$f" --out "$VIEW_DIR/$b" --setProperty formatOptions 80 2>/dev/null \
    && echo "✓ view $b" || echo "✗ FAILED view: $b"
done
echo "Done. grid=$(ls "$GRID_DIR" | wc -l | tr -d ' ')  view=$(ls "$VIEW_DIR" | wc -l | tr -d ' ')"
```

Preferred one-liner for public albums:
```bash
./scripts/upload-album.sh --folder "<local path>" --r2-prefix "<R2-folder-name>"
```

If originals are already in R2 (backfill scenario), use `scripts/backfill-image-tiers.sh` instead:
```bash
./scripts/backfill-image-tiers.sh --prefix "<R2-folder-name>"          # public
./scripts/backfill-image-tiers.sh --prefix "<R2-folder-name>" --private # private bucket
```

## Step 4 — Upload originals

- **Public albums** → `portfolio-images/<R2-folder-name>`
- **Family / client albums** → `portfolio-images-private/<R2-folder-name>`

**Single R2 folder:** run as **process 1** (backgrounded). Sequential, 10s sleep between files.
**Multiple R2 sub-folders:** use the **parallel multi-folder launcher** above — one background job per sub-folder, all at once.

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
- **Public** → `portfolio-images/grid/<R2-folder-name>/`
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

### Venice-style album (digital + film sections on one page)

Use for a single trip/event with digital + multiple film rolls — **one album page** with section nav tabs (Digital, each roll), like `italy-venice` or `holland-tulip-2026`. **Do not** split digital and each roll into separate sub-albums unless the user explicitly wants a group index.

- **Family:** flat album with `familySlug`, `photos` + `filmSections`, `hidden: true`
- **Public:** sub-album under a group with `parentId` + `slug`, same `photos` + `filmSections` shape
- R2: separate sub-folders per roll (`Digital/`, `Raveen-Ultramax/`, …) but **one config entry**
- `filmSections[].navLabel` — short tab label; `label` — heading above that roll's grid

See `holland-tulip-2026` (family) and `italy-venice` (public) in `config.js`.

### Multi-city group album (Italy pattern)

Use for trips with **multiple distinct locations** (Venice, Florence, Rome…). Each city is a sub-album with `parentId` + `slug`. Each city album can itself be Venice-style (digital + `filmSections`). See Italy 2026 in `config.js`.

### Flat album with digital + film sections (Maryland / Red Rock pattern)

Same `photos` + `filmSections` shape as Venice-style; use for family events without needing section nav labels:

```js
{
  id: '<slug>',
  title: '<Title>',
  description: '<Short description.>',
  location: '<City>',
  date: '<Month YYYY>',
  audience: 'public',                  // or family / client:<name>
  hidden: true,                        // always true for family albums
  protected: false,
  familySlug: 'short-descriptive-slug', // URL: /familyalbums/YYYY/short-descriptive-slug/
  digitalLabel: 'Fujifilm X-T5',
  coverImage: `${R2_BASE_URL}/<R2-folder-name>/<COVER.jpg>`,
  photos: [
    `${R2_BASE_URL}/<R2-folder-name>/Digital/<PHOTO1.jpg>`,
    // ...
  ],
  filmSections: [
    {
      label: '<Camera> — <Film Stock>',
      navLabel: '<Short tab label>',   // optional; shown in section nav
      photos: [
        `${R2_BASE_URL}/<R2-folder-name>/<Roll-folder>/<FRAME1.jpg>`,
        // ...
      ],
    },
  ],
},
```

### Public flat album

```js
{
  id: '<slug>',
  title: '<Title>',
  description: '<Short description.>',
  audience: 'public',
  protected: false,
  coverImage: `${R2_BASE_URL}/<R2-folder-name>/<FIRST.jpg>`,
  photos: [ `${R2_BASE_URL}/<R2-folder-name>/<PHOTO1.jpg>`, ... ],
  // curated: []  ← add via admin "Save as curated set" after photos are live
},
```

## Step 8 — Commit

```bash
git add js/config.js && git commit -m "Add <album name> album"
```

Push to `main` only when explicitly asked — Vercel auto-deploys in ~30 seconds.

## Step 9 — Share link (if hidden)

Family albums: direct the user to `/family/` after unlocking with their password.
Client albums: create an access code via `/admin/` → Access codes tab.
