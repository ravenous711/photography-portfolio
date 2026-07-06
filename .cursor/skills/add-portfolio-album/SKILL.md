---
name: add-portfolio-album
description: Guides the user through adding a new photo album to the photography portfolio site. Use when the user wants to upload photos, create an album, add a new album to the site, or mentions Lightroom, Cloudflare R2, or wrangler in the context of their photography portfolio.
---

# Add Portfolio Album

Workflow for adding a new album to Raveen's photography portfolio. Always follow all steps in order.

## Key facts
- R2 bucket: `portfolio-images`
- Cloudflare account ID: `723c27febd4a099c7884fdf00de2329f`
- Wrangler OAuth token location: `~/Library/Preferences/.wrangler/config/default.toml`
- Albums config: `js/config.js` (repo root)
- R2 base URL: `https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev`
- Live site: `https://photography-portfolio-pi-blush.vercel.app`
- Wrangler path: `/opt/homebrew/bin/wrangler` — always `export PATH="/opt/homebrew/bin:$PATH"` first
- Upload helper template: `scripts/upload-album.sh` (retry + two-phase pattern)
- Grid: every upload must generate + upload a 1200px-wide JPEG to `grid/<R2-folder-name>/` for album/admin/curate display (lightbox uses full-res)
- External drive: `/Volumes/PhotosSSD/Photos/` (Italy exports, California starred, etc.)

## Cloudflare rate limit behaviour (learned from experience)
- R2 API rate-limits sequential uploads — rapid back-to-back calls fail with `fetch failed`
- Transient 503 / auth errors also happen mid-batch — **always auto-retry** (see helper below)
- After a cooldown of a few minutes, you can upload with **no sleep** and it works fine
- During an active session, use `sleep 15` between originals, `sleep 10` between grids
- If failures persist, double to 30s then 60s
- **Never use `sleep 5`** — too fast, causes consistent failures
- **Never interleave orig/grid per file** — generate all grids locally, upload all originals, then all grids

## Path gotcha (macOS)
Photo folders often contain spaces (e.g. `06 June`). **Never** build file lists with `ls | xargs basename` — it splits on spaces and produces bogus filenames.

Use a bash loop instead:
```bash
FILES=()
for f in "$FOLDER"/*.jpg "$FOLDER"/*.JPG; do
  [ -f "$f" ] || continue
  FILES+=("$(basename "$f")")
done
IFS=$'\n' FILES=($(printf '%s\n' "${FILES[@]}" | sort))
unset IFS
```

## Upload helper — use in every upload loop

Always define this once at the top of upload scripts (also in `scripts/upload-album.sh`). Retries 3 times with 15s / 30s / 60s backoff before marking failed:

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

Ask these if not already provided:
1. **Photo folder path** — where are the photos locally?
2. **All photos or starred only?** — all JPGs, or only Lightroom star rating > 0?
3. **Audience** — `public` (city album with curated set), `friends` (city album, full album unlocked for friends), `family` (hidden, unlocked with family password), or `client:<name>` (hidden, unique client password)?
4. **Album name** — suggest one based on the folder name or event if not given
5. **Password** — only if `client:<name>`; friends/family passwords are shared site-wide

## Step 2 — Find starred photos (if filtering by rating)

Run in Cursor shell (`required_permissions: ["all"]`):
```bash
export PATH="/opt/homebrew/bin:$PATH"
FOLDER="<path>"
exiftool -Rating -filename -T "$FOLDER"/*.JPG 2>/dev/null | awk -F'\t' '$1 > 0 {print $2}' | sort
```

Show the user the count and confirm before uploading.

## Step 3 — Generate grid images locally (1200px)

Use macOS `sips` to resize to **1200px** wide. Used on the album page, admin, and curate. Lightbox still uses full-res originals.
Run in Cursor shell (`required_permissions: ["all"]`):

**All photos:**
```bash
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

**Starred photos only:** same loop but filter via exiftool first (see Step 2).

Grid images are typically 150–400KB vs 5–20MB for originals.

## Step 4 — Upload originals

Run yourself via Shell tool with `required_permissions: ["all", "full_network"]`, backgrounded (`block_until_ms: 0`).

**All photos:**
```bash
export PATH="/opt/homebrew/bin:$PATH"
FOLDER="<local path>"
DEST="portfolio-images/<R2-folder-name>"

for f in "$FOLDER"/*.JPG "$FOLDER"/*.jpg; do
  [ -f "$f" ] || continue
  upload_with_retry "$DEST/$(basename "$f")" "$f" "$(basename "$f")" || fail=$((fail+1))
  sleep 15
done
```

**Starred photos only:**
```bash
export PATH="/opt/homebrew/bin:$PATH"
FOLDER="<local path>"
DEST="portfolio-images/<R2-folder-name>"

exiftool -Rating -filename -T "$FOLDER"/*.JPG 2>/dev/null \
  | awk -F'\t' '$1 > 0 {print $2}' | sort \
  | while read fname; do
      upload_with_retry "$DEST/$fname" "$FOLDER/$fname" "$fname" || fail=$((fail+1))
      sleep 15
    done
```

## Step 5 — Upload grid images

Run after originals complete. Grid images go to `grid/<R2-folder-name>/`. Use `sleep 10` between files.

```bash
export PATH="/opt/homebrew/bin:$PATH"
GRID_DIR="/tmp/grid_<R2-folder-name>"
DEST="portfolio-images/grid/<R2-folder-name>"

for f in "$GRID_DIR"/*.jpg; do
  [ -f "$f" ] || continue
  upload_with_retry "$DEST/$(basename "$f")" "$f" "grid $(basename "$f")" || gfail=$((gfail+1))
  sleep 10
done
```

## Step 6 — Verify via manifest (always do this automatically)

After both upload loops finish, **run this yourself** — do not wait for the user to ask. Check both folders:

```bash
export PATH="/opt/homebrew/bin:$PATH"
TOKEN=$(grep 'oauth_token' ~/Library/Preferences/.wrangler/config/default.toml | awk -F'"' '{print $2}')
ACCOUNT_ID="723c27febd4a099c7884fdf00de2329f"
FOLDER_NAME="<R2-folder-name>"

echo "=== Originals ==="
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/r2/buckets/portfolio-images/objects?prefix=$FOLDER_NAME/&per_page=1000" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import json, sys
data = json.load(sys.stdin)
uploaded = sorted(o['key'].split('/')[-1] for o in data['result'])
print(f'Found {len(uploaded)} files')
for f in uploaded: print(f'  {f}')
"

echo "=== Grid ==="
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/r2/buckets/portfolio-images/objects?prefix=grid/$FOLDER_NAME/&per_page=1000" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import json, sys
data = json.load(sys.stdin)
uploaded = sorted(o['key'].split('/')[-1] for o in data['result'])
print(f'Found {len(uploaded)} grid images')
"
```

Counts should match for originals and grid. Any missing files go to Step 7.

## Step 7 — Auto-retry missing files (always do this automatically)

**Run this yourself** after Step 6 if anything is missing. Loop until manifest is complete or 3 rounds exhausted:

```bash
export PATH="/opt/homebrew/bin:$PATH"
FOLDER="<local path>"
GRID_DIR="/tmp/grid_<R2-folder-name>"
DEST="portfolio-images/<R2-folder-name>"
GRID_DEST="portfolio-images/grid/<R2-folder-name>"
# MISSING_ORIGINALS and MISSING_GRID = filenames from Step 6 diff

for fname in $MISSING_ORIGINALS; do
  upload_with_retry "$DEST/$fname" "$FOLDER/$fname" "$fname"
done
for fname in $MISSING_GRID; do
  upload_with_retry "$GRID_DEST/$fname" "$GRID_DIR/$fname" "grid $fname"
done
```

Re-run Step 6 after each retry round. Tell the user only if files remain missing after 3 rounds.
When a background upload task finishes, check the log for `✗ FAILED` lines and retry those immediately — do not leave single-file failures for the user.

## Step 8 — Generate password hash (if protected)

```bash
python3 -c "import hashlib; print(hashlib.sha256(b'<password>').hexdigest())"
```

## Step 9 — Add album to config.js

Read `js/config.js` first, then add to the `ALBUMS` array.

- Use originals (`${R2_BASE_URL}/<R2-folder-name>/`) for `coverImage` and `photos` arrays (these are used for the full-res gallery and lightbox)
- The site automatically builds grid URLs (`grid/...`) for album, admin, and curate previews
- **Always set `audience`** — this controls who can access the album

**Public city album** (`audience: 'public'` — curated set shown to all, full album is fallback):
```js
{
  id: '<slug>',
  title: '<Title>',
  description: '<Short description.>',
  audience: 'public',
  protected: false,
  coverImage: `${R2_BASE_URL}/<R2-folder-name>/<FIRST.JPG>`,
  photos: [ `${R2_BASE_URL}/<R2-folder-name>/<PHOTO1.JPG>`, ... ],
  // curated: []  ← add via admin "Save as curated set" after photos are live
},
```

**Friends city album** (`audience: 'friends'` — curated set public, full album unlocked with `rf-pix-2026`):
```js
{
  id: '<slug>',
  title: '<Title>',
  description: '<Short description.>',
  audience: 'friends',
  protected: false,
  coverImage: `${R2_BASE_URL}/<R2-folder-name>/<FIRST.JPG>`,
  photos: [ ... ],
  // curated: []  ← add via admin "Save as curated set"
},
```

**Family album** (hidden, unlocked with `rf-family-pw`):
```js
{
  id: '<slug>',
  title: '<Title>',
  description: '<Short description.>',
  audience: 'family',
  hidden: true,
  protected: false,
  coverImage: `${R2_BASE_URL}/<R2-folder-name>/<FIRST.JPG>`,
  photos: [ ... ],
},
```

**Client album** (hidden, unique client password — also add hash to `PASSWORD_TIERS`):
```js
{
  id: 'client-<name>',
  title: '<Title>',
  description: '<Short description.>',
  audience: 'client:<name>',
  hidden: true,
  protected: false,
  coverImage: `${R2_BASE_URL}/<R2-folder-name>/<FIRST.JPG>`,
  photos: [ ... ],
},
```
For client albums, also add to `PASSWORD_TIERS` in `js/config.js`:
```js
'<sha256 of client password>': ['client:<name>'],
```

## Step 10 — Commit and push

```bash
git add js/config.js && git commit -m "Add <album name> album" && git push
```

Vercel auto-deploys in ~30 seconds.

## Step 11 — Share link (if hidden)

```
https://photography-portfolio-pi-blush.vercel.app/album.html?id=<slug>
```

---

## Grid backfill — Joel Birthday only

| Album | R2 folder | Photos |
|---|---|---|
| **Joel Birthday 2025** | `Joel-Bday-2025/` | 74 |

Run Step 3 (generate grids) and Step 5 (upload grids) only — no need to re-upload originals.
