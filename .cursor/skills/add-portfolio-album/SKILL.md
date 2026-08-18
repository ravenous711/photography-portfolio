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
**Always prefer maximum safe parallelism (fastest total wall-clock).**

- R2 API rate-limits concurrent uploads — always auto-retry (see helper below)
- **Never interleave orig/grid/view per file** — run originals, grids, and views as **separate parallel processes**
- **Check `IMPROVEMENTS.md` → Active album session** for in-flight uploads and the album queue before starting new work

### Sleep between originals (~26 MB Fujifilm JPGs)
| Gap | Result |
|---|---|
| 8s | Frequent `fetch failed` retries (single sequential worker) |
| 10s / 14–15s | **Fallback only** when rate limits are severe (1 sequential worker) |
| **2–3s** | **Default** — OK with **4–6 parallel workers** on the same folder |

### How many parallel workers? (default = fastest safe)

| File type | Safe concurrency | Notes |
|---|---|---|
| **Grids / views** (~1–3 MB / ~few MB) | **5–10** concurrent | Rarely rate-limits; default `CONCURRENCY=5`–`10` |
| **Originals, one R2 sub-folder** | **4–6** workers | Split file list evenly; **2–3s sleep** inside each worker + `upload_with_retry` |
| **Originals, multiple sub-folders** | **All sub-folders in parallel**, each with **4–6 workers** | Maximize wall-clock: N folders × (orig workers + grid job + view job) |

**Rule of thumb:** ~6 concurrent large original PUTs **per R2 prefix** is the sweet spot before retries spike. Spread load across different R2 paths when the album has multiple sub-folders — do **not** run one slow sequential job per folder.

### Recommended upload layout (default)

**Single folder** (one R2 path): launch **3 process groups in parallel** —
- Originals: **4–6 parallel workers**, **2–3s sleep** inside each, with `upload_with_retry`
- Grids: **5–10** concurrent
- Views: **5–10** concurrent

**Multi-folder album** (Digital + film rolls — e.g. Holland Tulip, Venice): launch **everything in parallel**:
- Per R2 sub-folder (`Digital/`, `Raveen-Ultramax/`, …): split originals across **4–6 workers** (not one sequential job)
- Per matching sub-folder: one grids job + one views job (~5–10 concurrent each)
- Example: 5 sub-folders → many parallel jobs (5 × orig-worker-pool + 5 grid + 5 view)

**Fallback (severe rate limits only):** drop to 1 sequential worker with 10–15s sleep. Prefer staying parallel and letting `upload_with_retry` absorb transient failures.

**Finishing stragglers:** If any worker has failures or a leftover list, split the **remaining file list** across **4 parallel workers** (2s sleep, auto-retry). Re-verify manifest and retry any still missing.

### Parallel multi-folder launcher (template)

Save manifests to `/tmp/<album>-manifest/` (one filename per line, sorted). Split each manifest across workers, then launch **all** orig/grid/view jobs together:

```bash
export PATH="/opt/homebrew/bin:$PATH"
BUCKET="portfolio-images-private"   # or portfolio-images
PREFIX="<R2-folder-name>"
BASE="/Volumes/PhotosSSD/Photos/..."
MANIFEST="/tmp/<album>-manifest"
LOGDIR="/tmp/<album>-logs"
WORKERS=5          # 4–6 for originals per sub-folder
GRID_CONCURRENCY=5 # 5–10 for grid/view
mkdir -p "$LOGDIR"

# upload_with_retry() — copy from helper below

# Split a manifest into $WORKERS chunk files: $MANIFEST/$key.w0.txt … 
split_manifest() {
  local key="$1" n="$WORKERS" total i
  total=$(grep -c . "$MANIFEST/$key.txt" 2>/dev/null || echo 0)
  for ((i=0; i<n; i++)); do : > "$MANIFEST/$key.w$i.txt"; done
  i=0
  while IFS= read -r fname; do
    [[ -z "$fname" ]] && continue
    echo "$fname" >> "$MANIFEST/$key.w$((i % n)).txt"
    i=$((i+1))
  done < "$MANIFEST/$key.txt"
}

upload_orig_worker() {
  local key="$1" local_dir="$2" r2_sub="$3" w="$4" log="$5"
  { echo "=== START orig $r2_sub worker$w $(date) ==="
    fail=0
    while IFS= read -r fname; do
      [[ -z "$fname" ]] && continue
      upload_with_retry "$BUCKET/$PREFIX/$r2_sub/$fname" "$local_dir/$fname" "orig $r2_sub/$fname" || fail=$((fail+1))
      sleep 2
    done < "$MANIFEST/$key.w$w.txt"
    echo "=== DONE orig $r2_sub worker$w fail=$fail $(date) ==="; exit $fail
  } > "$log" 2>&1
}

upload_grid_section() {
  local grid_dir="$1" r2_sub="$2" log="$3"
  { echo "=== START grid $r2_sub $(date) ==="
    fail=0
    for f in "/tmp/grid_$PREFIX/$grid_dir"/*; do
      [[ -f "$f" ]] || continue
      while (( $(jobs -r | wc -l | tr -d ' ') >= GRID_CONCURRENCY )); do sleep 1; done
      fname=$(basename "$f")
      ( upload_with_retry "$BUCKET/grid/$PREFIX/$r2_sub/$fname" "$f" "grid $r2_sub/$fname" || exit 1 ) &
    done
    wait || fail=1
    echo "=== DONE grid $r2_sub fail=$fail $(date) ==="; exit $fail
  } > "$log" 2>&1
}

upload_view_section() {
  local view_dir="$1" r2_sub="$2" log="$3"
  { echo "=== START view $r2_sub $(date) ==="
    fail=0
    for f in "/tmp/view_$PREFIX/$view_dir"/*; do
      [[ -f "$f" ]] || continue
      while (( $(jobs -r | wc -l | tr -d ' ') >= GRID_CONCURRENCY )); do sleep 1; done
      fname=$(basename "$f")
      ( upload_with_retry "$BUCKET/view/$PREFIX/$r2_sub/$fname" "$f" "view $r2_sub/$fname" || exit 1 ) &
    done
    wait || fail=1
    echo "=== DONE view $r2_sub fail=$fail $(date) ==="; exit $fail
  } > "$log" 2>&1
}

# Per sub-folder: split → launch all orig workers + grid + view in parallel
launch_section() {
  local key="$1" local_dir="$2" r2_sub="$3" grid_dir="$4" view_dir="$5"
  split_manifest "$key"
  local w
  for ((w=0; w<WORKERS; w++)); do
    upload_orig_worker "$key" "$local_dir" "$r2_sub" "$w" "$LOGDIR/orig-${key}-w$w.log" &
  done
  upload_grid_section "$grid_dir" "$r2_sub" "$LOGDIR/grid-${key}.log" &
  upload_view_section "$view_dir" "$r2_sub" "$LOGDIR/view-${key}.log" &
}

# Launch ALL sub-folders at once (adjust keys/paths per album)
launch_section digital "$BASE" Digital Digital Digital &
launch_section raveen-film "$BASE/Raveen-Ultramax" Raveen-Ultramax Raveen-Ultramax Raveen-Ultramax &
# ... one launch_section per sub-folder ...
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

**Always prefer maximum safe parallelism (fastest total wall-clock).**

- **Public albums** → `portfolio-images/<R2-folder-name>`
- **Family / client albums** → `portfolio-images-private/<R2-folder-name>`

**Single R2 folder:** split the file list across **4–6 parallel workers**, **2–3s sleep** inside each, with `upload_with_retry`. (Sequential 10s is a **fallback** only when rate limits are severe.)
**Multiple R2 sub-folders:** use the **parallel multi-folder launcher** above — all sub-folders at once, each with the 4–6 worker split (not one slow sequential job per folder).

Start **Step 5 grids and views in parallel** — never wait for originals to finish first.

```bash
export PATH="/opt/homebrew/bin:$PATH"
setopt nullglob
FOLDER="<local path>"
DEST="portfolio-images/<R2-folder-name>"   # or portfolio-images-private/...
WORKERS=5
LOGDIR="/tmp/orig-upload-logs"
mkdir -p "$LOGDIR"

FILES=()
for f in "$FOLDER"/*.jpg "$FOLDER"/*.JPG; do
  [ -f "$f" ] || continue
  FILES+=("$(basename "$f")")
done
IFS=$'\n' FILES=($(printf '%s\n' "${FILES[@]}" | sort)); unset IFS

# Split evenly across workers
for ((w=0; w<WORKERS; w++)); do : > "$LOGDIR/manifest.w$w.txt"; done
i=0
for fname in "${FILES[@]}"; do
  echo "$fname" >> "$LOGDIR/manifest.w$((i % WORKERS)).txt"
  i=$((i+1))
done

upload_worker() {
  local w="$1" fail=0
  while IFS= read -r fname; do
    [[ -z "$fname" ]] && continue
    upload_with_retry "$DEST/$fname" "$FOLDER/$fname" "$fname" || fail=$((fail+1))
    sleep 2
  done < "$LOGDIR/manifest.w$w.txt"
  echo "=== worker$w done fail=$fail ==="
  exit $fail
}

for ((w=0; w<WORKERS; w++)); do
  upload_worker "$w" > "$LOGDIR/worker$w.log" 2>&1 &
done
wait
echo "=== Originals done. Check $LOGDIR for failures ==="
```

## Step 5 — Upload grid + view images

Run **grid and view uploads in parallel with Step 4** (never wait for originals). Match the audience bucket:
- **Public** → `portfolio-images/grid/<R2-folder-name>/` and `portfolio-images/view/<R2-folder-name>/`
- **Family / client** → `portfolio-images-private/grid/...` and `portfolio-images-private/view/...`

Use **~5–10 concurrent** within each process (grids and views are small).

```bash
export PATH="/opt/homebrew/bin:$PATH"
setopt nullglob
GRID_DIR="/tmp/grid_<R2-folder-name>"
VIEW_DIR="/tmp/view_<R2-folder-name>"
GRID_DEST="portfolio-images/grid/<R2-folder-name>"   # or portfolio-images-private/grid/...
VIEW_DEST="portfolio-images/view/<R2-folder-name>"   # or portfolio-images-private/view/...
CONCURRENCY=5

upload_tier() {
  local src="$1" dest="$2" label="$3"
  local fail=0
  for f in "$src"/*.jpg; do
    [ -f "$f" ] || continue
    while (( $(jobs -r | wc -l | tr -d ' ') >= CONCURRENCY )); do sleep 1; done
    (
      upload_with_retry "$dest/$(basename "$f")" "$f" "$label $(basename "$f")" || exit 1
    ) &
  done
  wait || fail=1
  echo "=== $label done. Check output above for failures ==="
  exit $fail
}

upload_tier "$GRID_DIR" "$GRID_DEST" grid &
upload_tier "$VIEW_DIR" "$VIEW_DEST" view &
wait
```

## Step 6 — Verify via manifest

After all upload loops finish (originals + grid + view), run automatically:

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
if not data.get('success'):
    errs = data.get('errors') or data
    print(f'R2 list API error (originals): {errs}', file=sys.stderr)
    sys.exit(1)
result = data.get('result')
if result is None:
    print('R2 list API returned result: null (originals)', file=sys.stderr)
    sys.exit(1)
uploaded = sorted(o['key'].split('/')[-1] for o in result)
print(f'Found {len(uploaded)} files')
"

echo "=== Grid ==="
GRID_BUCKET="$BUCKET"   # same bucket as originals (public or private)
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/r2/buckets/$GRID_BUCKET/objects?prefix=grid/$FOLDER_NAME/&per_page=1000" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if not data.get('success'):
    errs = data.get('errors') or data
    print(f'R2 list API error (grid): {errs}', file=sys.stderr)
    sys.exit(1)
result = data.get('result')
if result is None:
    print('R2 list API returned result: null (grid)', file=sys.stderr)
    sys.exit(1)
print(f'Found {len(result)} grid images')
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
