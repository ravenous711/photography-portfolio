# Raveen Fernando — Photography Portfolio

A minimalist static photography portfolio site built with HTML, Tailwind CSS, and vanilla JS.
Images are served from Cloudflare R2, with a Cloudflare Worker handling ZIP downloads,
private image proxying, and access-code auth.

---

## Site Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER / CLIENT                                │
└────────────┬───────────────────────────────────────────┬─────────────────────┘
             │  HTTPS (pages, JS, CSS)                   │  HTTPS (API, admin)
             ▼                                           ▼
┌────────────────────────┐                ┌──────────────────────────────────────┐
│      VERCEL            │                │     VERCEL SERVERLESS FUNCTIONS      │
│  (static hosting)      │                │  /api/admin-login  (session cookie)  │
│                        │                │  /api/admin-delete (R2 + GitHub API) │
│  index.html            │                │  /api/admin-curate (writes config.js)│
│  gallery/index.html    │                │  /api/admin-access-codes (proxy)     │
│  album/index.html      │                │  /api/download     (R2 proxy)        │
│  group/index.html      │                │  /api/exif         (EXIF metadata)   │
│  unlock/index.html     │                └──────────────────────────────────────┘
│  admin/index.html      │
│  js/config.js          │                ┌──────────────────────────────────────┐
│  js/main.js            │                │       CLOUDFLARE WORKER              │
│  css/style.css  etc.   │                │  portfolio-zip-download              │
└────────────────────────┘                │  .raveenfernando.workers.dev         │
                                          │                                      │
             ┌────────────────────────────┤  POST /unlock  → HMAC token (4h)    │
             │  image URLs                │  GET  /image   → private R2 proxy   │
             ▼                            │  GET/POST /zip → streaming ZIP       │
┌────────────────────────┐                │  POST /favorites/toggle (D1)         │
│  R2 PUBLIC BUCKET      │                │  GET  /favorites (D1)                │
│  portfolio-images      │◄───────────────│  POST /access-codes (admin CRUD)     │
│  (photos.r2.dev CDN)   │                └──────────────┬───────────────────────┘
│                        │                               │
│  grid/<key>  ~95 KB    │                ┌──────────────▼───────────────────────┐
│  view/<key>  ~1.5 MB   │                │  R2 PRIVATE BUCKET                   │
│  <key>       15–40 MB  │                │  portfolio-images-private             │
└────────────────────────┘                │  (no public access)                  │
                                          │                                      │
                                          │  grid/<key>  ~95 KB                  │
                                          │  view/<key>  ~1.5 MB                 │
                                          │  <key>       15–40 MB                │
                                          └──────────────┬───────────────────────┘
                                                         │
                                          ┌──────────────▼───────────────────────┐
                                          │  CLOUDFLARE D1 DATABASE              │
                                          │  (bound to Worker)                   │
                                          │                                      │
                                          │  favorites     — heart votes         │
                                          │  access_codes  — hashed client codes │
                                          └──────────────────────────────────────┘
```

**Key design principles:**

- The site is a fully static build — no server-side rendering. All album metadata lives in
  `js/config.js` and is deployed by Vercel on every `main` push.
- "Private" means the Cloudflare Worker enforces access, not the browser. Public R2 URLs for
  `friends` albums are in `config.js`, but photo files themselves are in the public bucket
  and the `friends` lock is soft (client-side hashing). Family and client photos live in the
  **private bucket** — the Worker refuses to proxy them without a valid HMAC token.
- Admin auth is fully server-side: the admin password is never shipped to the browser. The
  Vercel function checks the hash, sets an HttpOnly cookie, and all admin API calls verify that
  cookie before acting.

---

## Stack

| Layer | Technology |
|---|---|
| Static hosting | Vercel (auto-deploy from `main`) |
| Frontend | HTML · Tailwind CSS (CDN) · Vanilla JS |
| Public image CDN | Cloudflare R2 — `portfolio-images` bucket |
| Private image store | Cloudflare R2 — `portfolio-images-private` bucket |
| Auth, ZIP, proxy | Cloudflare Worker — `portfolio-zip-download` |
| Access code store | Cloudflare D1 (bound to Worker) |
| Admin API | Vercel Serverless Functions (`/api/*`) |
| Photo metadata | `js/config.js` + `js/albums/*.js` (written via GitHub API) |

---

## R2 Key Structure

Every photo is stored under **three R2 keys** (or two, for private albums where originals
aren't pre-generated):

```
<album-prefix>/<filename>.jpg           ← original full-res  (15–40 MB)
grid/<album-prefix>/<filename>.jpg      ← thumbnail 900px q75 (~95 KB)
view/<album-prefix>/<filename>.jpg      ← lightbox 2048px q80 (~1.5 MB)
```

**Example — Venice:**
```
Italy/Venice/Digital/venice_098.jpg          ← original
grid/Italy/Venice/Digital/venice_098.jpg     ← grid thumbnail
view/Italy/Venice/Digital/venice_098.jpg     ← lightbox target
```

**Public bucket** (`portfolio-images`): public, friends, and most family-group albums.
**Private bucket** (`portfolio-images-private`): family-tier and all client albums.
Both buckets use the identical key structure; the Worker selects the right bucket based on
the `tier` in the HMAC token.

---

## Image Tier Architecture

```
  ┌─────────────────────────────────────────────────────────────────┐
  │                     SCROLLING THE ALBUM GRID                    │
  │                                                                  │
  │  <img src="grid/<key>">        900px  q75  ~95 KB               │
  └────────────────────────┬────────────────────────────────────────┘
                           │  user clicks photo
                           ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │                         LIGHTBOX                                 │
  │                                                                  │
  │  <img src="view/<key>">        2048px  q80  ~1.5 MB             │
  │      ↓ 404 fallback (album not yet backfilled)                  │
  │  <img src="<key>">             original  15–40 MB               │
  └────────────────────────┬────────────────────────────────────────┘
                           │  user clicks Download
                           ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │                     DOWNLOAD SIZE CHOOSER                        │
  │                                                                  │
  │  [ Low  ~95 KB  ]  ← grid/<key>   (grid thumbnail)             │
  │  [ Med  ~1.5 MB ]  ← view/<key>   (lightbox size)              │
  │  [ Full 15–40 MB]  ← <key>        (original)                   │
  └─────────────────────────────────────────────────────────────────┘
```

The `grid/` and `view/` keys are derived from originals by
`scripts/backfill-image-tiers.sh` (using macOS `sips`). The frontend
(`album/index.html`, `js/main.js`) computes tier URLs with:

```js
// Thumbnail for grid scroll
function gridUrl(url)  { return url.replace(R2_BASE_URL, R2_BASE_URL + '/grid'); }
// Lightbox target (with 404 → original fallback for un-backfilled albums)
function viewUrl(url)  { return url.replace(R2_BASE_URL, R2_BASE_URL + '/view'); }
```

---

## Album Types & Access Tiers

### Audience tiers

| `audience` | Visible to | Storage | Image delivery |
|---|---|---|---|
| `public` | Everyone | Public R2 | Direct CDN URL |
| `family` | Family (password) | **Private R2** | Worker-signed proxy |
| `client:<name>` | That client only (access code) | **Private R2** | Worker-signed proxy |

> Legacy `friends` tier removed Aug 2026. City albums are `public`: curated is the default view; anyone can toggle to the full album.

### Curated sets

A `curated: [...]` array on an album controls what visitors see **by default**:

```
  ┌─────────────────────────────────────────────────────────────────┐
  │  ANY VISITOR                                                     │
  │                                                                  │
  │  album without curated[]  → sees all photos                      │
  │  album with    curated[]  → sees curated subset by default       │
  │                              + "See full album" toggle (public)  │
  └─────────────────────────────────────────────────────────────────┘
```

To pick curated photos: `/admin/` → expand album → select top photos
→ **Save as curated set** — writes `curated[]` to the album shard via GitHub API
and triggers a Vercel redeploy.

### How `hidden` works

Albums with `hidden: true` do not appear in the public gallery at all.
They only become visible once the correct tier is unlocked in the current
session. Family and client albums are always `hidden: true`.

### `config.js` album templates

**Public:**
```js
{
  id: 'my-city-2026',
  title: 'My City 2026',
  description: 'A short description.',
  location: 'City Name',
  date: 'Month Year',
  audience: 'public',
  protected: false,
  coverImage: `${R2_BASE_URL}/My-City-2026/COVER.JPG`,
  photos: [ `${R2_BASE_URL}/My-City-2026/PHOTO1.JPG`, /* … */ ],
  // curated: []  ← add via admin "Save as curated set" after uploading
},
```

**Public** (optional curated highlights; full album open to everyone via toggle):
```js
{
  id: 'my-city-2026',
  title: 'My City 2026',
  audience: 'public',
  protected: false,
  coverImage: `${R2_BASE_URL}/My-City-2026/COVER.JPG`,
  photos: [ /* … */ ],
  // curated: []  ← add after picking highlights in admin
},
```

**Family** (hidden; private R2 bucket; Worker-proxied):
```js
{
  id: 'my-family-event',
  title: 'Family Event 2026',
  audience: 'family',
  hidden: true,
  protected: false,
  coverImage: `${R2_BASE_URL}/Family-Event-2026/COVER.JPG`,
  photos: [ /* … */ ],
},
```

**Client** (hidden; private R2 bucket; D1-backed access code):
```js
{
  id: 'client-john-doe',
  title: 'John Doe — Session 2026',
  audience: 'client:john-doe',
  hidden: true,
  protected: false,
  coverImage: `${R2_BASE_URL}/Client-JohnDoe-2026/COVER.JPG`,
  photos: [
    `${R2_BASE_URL}/Client-JohnDoe-2026/PHOTO1.JPG`,
    // photo URLs point at the public bucket base URL but are rewritten by
    // the album page to Worker proxy URLs when a private token is present
  ],
},
```

> **No `PASSWORD_TIERS` edit needed for new clients.** The access code is created in the admin panel (see Full client gallery workflow below).

### Passwords (keep in 1Password)

| Tier | Password | Notes |
|---|---|---|
| Family | see 1Password | Unlocks family gallery (`audience: 'family'`) |
| Admin | see 1Password | Server-side only; hash in Vercel env `ADMIN_PASSWORD_HASH` |

Passwords are never stored in the repo — only SHA-256 hashes in `PASSWORD_TIERS` in
`js/config.js`. The admin password hash is a Vercel env var, not in the config file at all.
Client codes are created in `/admin/` → Access codes (D1), not in `PASSWORD_TIERS`.

---

## Auth Flow

### Friends unlock — removed

Friends capability-link unlock (`?k=` / `/fullalbums/`) was removed Aug 2026.
Public city albums need no unlock: curated is the default; **"See full album"** is open to everyone.

### Family (password tier → Worker token)

```
  Browser                    Worker (/unlock)              Private R2
     │                            │                            │
     │  Enter family password     │                            │
     │  sha256(pw) = FAMILY_HASH  │                            │
     │                            │                            │
     │  POST /unlock { hash }     │                            │
     │ ─────────────────────────► │                            │
     │                            │  compare hash to           │
     │                            │  env.FAMILY_HASH (constant-time)
     │                            │  issue HMAC token          │
     │  { token, tier:'family',   │  exp = now + 4h            │
     │    expiresAt }             │                            │
     │ ◄───────────────────────── │                            │
     │                            │                            │
     │  album page rewrites       │                            │
     │  photo URLs →              │                            │
     │  /image?key=<k>&token=<t> │                            │
     │                            │                            │
     │  GET /image?key=…&token=… │                            │
     │ ─────────────────────────► │                            │
     │                            │  verifyToken()             │
     │                            │  tier = 'family'           │
     │                            │  → allow any private key   │
     │                            │  PRIVATE_BUCKET.get(key)   │
     │                            │ ──────────────────────────►│
     │  image bytes               │  object body               │
     │ ◄───────────────────────── │ ◄──────────────────────────│
```

Token TTL is 4 hours. The album page silently refreshes tokens using the
stored hash so users are never interrupted mid-session.

### Client (access code → Worker token)

```
  Browser                    Worker (/unlock)           D1 (access_codes)
     │                            │                            │
     │  Enter access code         │                            │
     │  sha256(code) = code_hash  │                            │
     │                            │                            │
     │  POST /unlock { hash }     │                            │
     │ ─────────────────────────► │                            │
     │                            │  env HASHES didn't match   │
     │                            │  SELECT audience FROM      │
     │                            │  access_codes WHERE        │
     │                            │  code_hash=? AND revoked=0 │
     │                            │ ──────────────────────────►│
     │                            │  { audience:'client:X' }   │
     │                            │ ◄──────────────────────────│
     │                            │  issue token tier=client:X │
     │  { token, tier:'client:X'} │                            │
     │ ◄───────────────────────── │                            │
     │                            │                            │
     │  GET /image?key=X/…&token │                            │
     │ ─────────────────────────► │                            │
     │                            │  tier = 'client:x'         │
     │                            │  key must start with 'x/'  │
     │                            │  or 'grid/x/'              │
     │                            │  → streams from PRIVATE_BUCKET
```

**Revocation:** Admin panel → Access codes → Revoke sets `revoked=1` in D1.
The next `/unlock` attempt for that code returns 401. Existing tokens
already in the browser remain valid until their 4-hour TTL expires.

### Admin panel auth

```
  Browser                    Vercel /api/admin-login
     │                            │
     │  POST { password }         │
     │ ─────────────────────────► │
     │                            │  sha256(password) vs ADMIN_PASSWORD_HASH (env)
     │                            │  if match: createSessionToken(SESSION_SECRET)
     │  Set-Cookie: rf_admin=…    │
     │  (HttpOnly, Secure, 24h)   │
     │ ◄───────────────────────── │
     │                            │
     │  POST /api/admin-delete    │
     │  Cookie: rf_admin=…        │
     │ ─────────────────────────► │
     │                            │  verifySessionToken(cookie, SESSION_SECRET)
     │                            │  → proceed or 401
```

---

## URL & Routing Structure

All routing is defined in `vercel.json`. The site uses clean trailing-slash URLs.

### Pages

| URL | Template served | Notes |
|---|---|---|
| `/` | `index.html` | Yosemite hero (photo only) + Personal / Professional work banners |
| `/personal-work/` | `personal-work/index.html` | Personal projects index (Italy, California, Red Rock, Film) |
| `/professional-work/` | `professional-work/index.html` | Public professional highlights (`portfolio: true` albums) |
| `/gallery/` | → `/personal-work/` | Redirect alias |
| `/gallery/<group>/` | `group/index.html` | Trip/group page (e.g. Italy highlights + cities) |
| `/gallery/<group>/<slug>/` | `album/index.html` | Individual album |
| `/album/<slug>/` | `album/index.html` | Legacy direct-album URLs (still works) |
| `/unlock/` | `unlock/index.html` | Access code / password entry; `?next=` redirect |
| `/admin/` | `admin/index.html` | Admin panel (session-cookie gated) |
| `/familyalbums/` | `family/index.html` | Family albums landing (family tier only) |
| `/familyalbums/<year>/<slug>/` | `album/index.html` | Family album page |

### API (Vercel Serverless Functions)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/admin-login` | POST / DELETE | Login / logout (sets/clears HttpOnly cookie) |
| `/api/admin-delete` | POST | Delete photos from R2 + update `config.js` via GitHub |
| `/api/admin-curate` | POST | Write `curated[]` to `config.js` via GitHub |
| `/api/admin-access-codes` | GET / POST / DELETE | Proxy to Worker `/access-codes` |
| `/api/admin-favorites` | GET | Proxy to Worker `/favorites/tally` |
| `/api/download` | GET | R2 download proxy |
| `/api/exif` | GET | Read EXIF metadata from R2 object |

### Worker (Cloudflare)

Base URL: `https://portfolio-zip-download.raveenfernando.workers.dev`

| Endpoint | Method | Purpose |
|---|---|---|
| `/unlock` | POST | Exchange password/access-code hash for a 4h HMAC token |
| `/image` | GET | Token-gated private R2 image proxy |
| `/` (default) | GET / POST | Streaming ZIP download from public R2 |
| `/favorites/toggle` | POST | Heart / un-heart a photo (D1) |
| `/favorites` | GET | Fetch session's hearted photos (D1) |
| `/favorites/tally` | GET | Admin: heart counts per photo (requires `ADMIN_SECRET`) |
| `/access-codes` | GET / POST / DELETE | Admin CRUD for D1 access codes (requires `ADMIN_SECRET`) |

### Legacy redirects

`vercel.json` contains permanent redirects for all old URL patterns
(`/album.html?id=X`, `/gallery.html`, `/curate.html`, `/fullalbums/*`, etc.)
so old bookmarks and shared links continue to work.

---

## How access tiers work

Every album in `js/albums/*.js` has an `audience` field:

| Audience | Who sees it | How |
|---|---|---|
| `public` | Everyone | Always visible; curated subset by default if `curated[]` is set; anyone can toggle to full album |
| `family` | Family with password | Hidden albums; photos served via Worker |
| `client:<name>` | One client | Hidden album; access code; photos served via Worker |

### Passwords (keep in 1Password)

| Tier | Password | Hash |
|---|---|---|
| Family | see 1Password | `c403bc24…` in `PASSWORD_TIERS` |
| Admin panel | see 1Password | Vercel env `ADMIN_PASSWORD_HASH` only |

Passwords are stored in 1Password only — **never in the repo**. Only SHA-256 hashes live in
`PASSWORD_TIERS` in `js/config.js`. Client codes are D1-backed via the admin panel.

### Handing out access

- **Public albums:** just share the album URL — curated + full are open
- **Family:** text/email `raveenfernando.com/unlock/` + the family password (1Password)
- **Clients:** create an access code in the admin panel — no password hash editing needed

### Curated sets

Each public album can have a `curated: [...]` array — the highlight photos shown by default.
To pick curated photos:
1. Go to `/admin/` → expand an album → select your top photos
2. Click **Save as curated set** — writes to the album shard via GitHub, triggers Vercel redeploy

Anyone can use **"See full album"** / **"See favorites"** to toggle between curated and full.
Albums without a `curated[]` array show the full photo set to everyone.

---

## One-time CLI setup

Run these once in Terminal.app before using Wrangler:
```bash
eval "$(/opt/homebrew/bin/brew shellenv zsh)"   # add Homebrew to PATH
npm install -g wrangler
wrangler login                                   # opens browser to authorize Cloudflare
brew install exiftool                            # for reading Lightroom star ratings
```

### Wrangler auth — when you need to redo it

Wrangler credentials live **on your Mac**, not in Cursor or this repo. Re-run setup if uploads
fail with auth errors, you switch machines, or you use a new Cursor account on a clean install.

**Token location:** `~/Library/Preferences/.wrangler/config/default.toml`

**Redo auth (most common fix):**
```bash
export PATH="/opt/homebrew/bin:$PATH"
wrangler login
wrangler whoami          # should show your Cloudflare account
```

**Verify R2 access:**
```bash
wrangler r2 bucket list --remote
# should include: portfolio-images
```

**Test a read against the public bucket:**
```bash
curl -s -o /dev/null -w "%{http_code}\n" -r 0-0 \
  "https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Italy/Venice/Digital/venice_098.jpg"
# expect: 206 or 200
```

**New Mac?** Copy the whole Wrangler config folder, or just run `wrangler login` again on the
new machine:
```bash
# optional backup from old Mac
cp -R ~/Library/Preferences/.wrangler ~/Desktop/wrangler-backup
```

**Important:** Always pass `--remote` on uploads. Without it, Wrangler writes to a local
simulation and nothing appears in R2:
```bash
wrangler r2 object put "portfolio-images/test.txt" --file /tmp/test.txt --remote
```

**GitHub CLI** (for PRs / `gh` commands) is separate — re-run `gh auth login` if push or PR
commands fail.

---

## Cursor agent skill

This repo includes a project skill at `.cursor/skills/add-portfolio-album/SKILL.md` that
teaches the Cursor agent the full album workflow (two-phase upload, rate limits, grid
generation, config update).

It loads automatically when you open this project in Cursor — no copy step needed if you
clone from GitHub. The agent also uses `scripts/upload-album.sh` for the retry helper.

To ask the agent: **"upload Rome"**, **"add London album"**, etc.

---

## Adding a new album

There are three album types. All follow the same upload steps, then differ only in what you
add to `js/config.js`.

### Step 1 — Export from Lightroom

Export your picks as full-resolution JPEGs to a local folder. For starred-only picks you can
use the `exiftool` command in Step 2b.

### Step 2 — Generate grid/ and view/ tiers locally (optional pre-upload)

You can generate thumbnails on your Mac before uploading, or use the backfill script
afterwards (see **Backfill Script** section).

**Generate grid (900px) and view (2048px) for all JPEGs in a folder:**
```bash
export PATH="/opt/homebrew/bin:$PATH"
FOLDER="/path/to/your/photos"
GRID_DIR="$FOLDER/_grid"
VIEW_DIR="$FOLDER/_view"
mkdir -p "$GRID_DIR" "$VIEW_DIR"

for f in "$FOLDER"/*.JPG "$FOLDER"/*.jpg; do
  [ -f "$f" ] || continue
  name="$(basename "$f")"
  sips -Z 900  --setProperty formatOptions 75 "$f" --out "$GRID_DIR/$name" > /dev/null
  sips -Z 2048 --setProperty formatOptions 80 "$f" --out "$VIEW_DIR/$name" > /dev/null
  echo "✓ $name"
done
```

### Step 3 — Upload photos to R2

> **Run all upload commands in Terminal.app, not inside Cursor.** Cursor's sandboxed shell
> cuts off sustained network connections mid-loop. Terminal.app has no restrictions and will
> run the full upload reliably.

**All photos from a folder (public or friends albums):**
```bash
export PATH="/opt/homebrew/bin:$PATH"
FOLDER="/path/to/your/photos"
DEST="portfolio-images/Your-Album-Name"

for f in "$FOLDER"/*.JPG "$FOLDER"/*.jpg; do
  [ -f "$f" ] || continue
  wrangler r2 object put "$DEST/$(basename "$f")" --file "$f" --remote \
    && echo "✓ $(basename "$f")" || echo "✗ FAILED: $(basename "$f")"
done
```

**Upload grid/ and view/ tiers (run after the above):**
```bash
GRID_DIR="$FOLDER/_grid"
VIEW_DIR="$FOLDER/_view"

for f in "$GRID_DIR"/*.JPG "$GRID_DIR"/*.jpg; do
  [ -f "$f" ] || continue
  wrangler r2 object put "portfolio-images/grid/Your-Album-Name/$(basename "$f")" \
    --file "$f" --remote && echo "✓ grid/$(basename "$f")"
done

for f in "$VIEW_DIR"/*.JPG "$VIEW_DIR"/*.jpg; do
  [ -f "$f" ] || continue
  wrangler r2 object put "portfolio-images/view/Your-Album-Name/$(basename "$f")" \
    --file "$f" --remote && echo "✓ view/$(basename "$f")"
done
```

**Only Lightroom-starred photos (Rating > 0):**
```bash
export PATH="/opt/homebrew/bin:$PATH"
FOLDER="/path/to/your/photos"
DEST="portfolio-images/Your-Album-Name"

exiftool -Rating -filename -T "$FOLDER"/*.JPG 2>/dev/null \
  | awk -F'\t' '$1 > 0 {print $2}' | sort \
  | while read fname; do
      wrangler r2 object put "$DEST/$fname" --file "$FOLDER/$fname" --remote \
        && echo "✓ $fname" || echo "✗ FAILED: $fname"
    done
```

> **Always include `--remote`** — without it Wrangler uploads to a local simulation and
> nothing appears on Cloudflare.

---

### Step 4 — Add the album to `js/config.js`

Albums are split into per-category files under `js/albums/`:

```
js/albums/
  california-2025.js   ← California albums
  clients.js           ← client:<name> albums
  family-2025.js       ← family 2025 albums
  family-2026.js       ← family 2026 albums
  italy-2026.js        ← Italy 2026 group
  misc-2026.js         ← misc public albums
```

Add your album object to the right file. Every album needs an `audience` tag — use the
templates in the [Album Types & Access Tiers](#album-types--access-tiers) section.

---

### Full client gallery workflow

1. **Upload photos to the private bucket** (Terminal.app):
   ```bash
   export PATH="/opt/homebrew/bin:$PATH"
   FOLDER="/path/to/exported/photos"
   DEST="portfolio-images-private/Client-JohnDoe-2026"

   for f in "$FOLDER"/*.JPG; do
     [ -f "$f" ] || continue
     wrangler r2 object put "$DEST/$(basename "$f")" --file "$f" \
       --content-type image/jpeg --remote \
       && echo "✓ $(basename "$f")" || echo "✗ FAILED: $(basename "$f")"
   done
   ```

2. **Add the album to `js/albums/clients.js`** with `audience: 'client:john-doe'` and `hidden: true`.

3. **Commit and push** — Vercel deploys in ~30 seconds.

4. **Create an access code** in the admin panel:
   - Go to `/admin/` → **Access codes** tab
   - Label: `John Doe Session 2026` (your reference only)
   - Audience: `client:john-doe` (must match the album's `audience` field exactly)
   - Code: a strong passphrase (min 8 chars)
   - Click **Create** — **copy the code from the confirmation banner — it is shown once and never stored**

5. **Send the client** the unlock URL + their code:
   > "Your gallery is live! Go to `raveenfernando.com/unlock/` and enter: `<their-code>`"

6. **To revoke access**: Admin panel → Access codes → Revoke. Takes effect immediately
   (next unlock attempt is rejected). Existing 4h tokens in the client's browser remain
   valid until they expire.

> The client enters their code once per browser session. The album page handles silent token
> refresh — they are never interrupted mid-session.

---

### Step 5 — Commit and push

```bash
cd /Users/raveenfernando/Documents/photography-portfolio
git add js/config.js js/albums/
git commit -m "Add My Album"
git push
```
Vercel auto-deploys within ~30 seconds.

---

## Backfill Script

Two scripts live in `scripts/` to regenerate `grid/` and `view/` tiers from originals
already on R2. Run these in Terminal.app (not Cursor).

### `scripts/backfill-image-tiers.sh` — single album

Processes one R2 prefix: downloads each original, runs `sips` to resize, uploads
`grid/<key>` (900px q75) and `view/<key>` (2048px q80). Fully resumable — reruns skip
keys that already exist.

```bash
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/raveenfernando/Documents/photography-portfolio

# Public bucket album
./scripts/backfill-image-tiers.sh --prefix Italy/Venice/Digital

# Private bucket album
./scripts/backfill-image-tiers.sh --prefix Moksha-Yoga --private

# Dry run (no uploads)
./scripts/backfill-image-tiers.sh --prefix Italy/Venice/Digital --dry-run

# Only regenerate view/ (skip grid/)
./scripts/backfill-image-tiers.sh --prefix Italy/Venice/Digital --view-only

# Limit to first 5 photos (trial run)
./scripts/backfill-image-tiers.sh --prefix Italy/Venice/Digital --limit 5
```

### `scripts/run-full-backfill.sh` — all albums

Master runner that drives `backfill-image-tiers.sh` across all albums in batches,
logs to `/tmp/backfill-<timestamp>.log`, and spot-checks completeness after each batch.

**Batches:**
| # | Contents |
|---|---|
| 1 | Italy digital (Venice, Florence, Rome, Pisa, Assisi) |
| 2 | Italy film (all Italy/Film/* sub-rolls) |
| 3 | California (Santa Cruz / Big Sur, Yosemite) |
| 4 | Red Rock Canyon + misc public |
| 5 | Events / visits (private bucket) |
| 6 | Misc film + clients (private bucket) |

```bash
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/raveenfernando/Documents/photography-portfolio

# Run all batches
./scripts/run-full-backfill.sh

# Run only batch 1
./scripts/run-full-backfill.sh --batch 1

# Dry run of batch 3
./scripts/run-full-backfill.sh --batch 3 --dry-run

# Resume from a specific prefix after a failure
./scripts/run-full-backfill.sh --from Italy/Florence/Digital

# Skip rate-limit sleeps (faster, use after a cooldown)
./scripts/run-full-backfill.sh --batch 1 --fast
```

Non-zero exits from individual prefixes are logged and counted but do **not** abort the
run — the final summary lists all failed prefixes.

---

## Admin Panel (`/admin/`)

Password-protected panel for managing photos, curated sets, and access codes.

### How it works
1. Go to `/admin/` and log in with the admin password (see 1Password)
2. The login call hits `/api/admin-login`, which verifies the password server-side and
   sets an **HttpOnly session cookie** (24h lifetime — never exposed to JS)
3. All subsequent admin API calls attach the cookie automatically

### Tabs

| Tab | What it does |
|---|---|
| Albums | Expand an album → click photos to mark for deletion → **Commit Deletions** (deletes from R2 + updates `config.js` via GitHub) |
| Curated | Select photos as the curated highlight set → **Save as curated set** |
| Favorites tally | Shows heart counts per photo for any album |
| Access codes | Create / view / revoke D1-backed client access codes |

### Required Vercel environment variables

| Variable | Description |
|---|---|
| `SESSION_SECRET` | Random secret for signing admin session tokens |
| `ADMIN_PASSWORD_HASH` | SHA-256 hash of your admin password |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with R2 write access |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID (`723c27fe…`) |
| `GITHUB_TOKEN` | GitHub personal access token with `repo` scope |
| `GITHUB_REPO` | e.g. `ravenous711/photography-portfolio` |
| `WORKER_ADMIN_SECRET` | Matches the Worker's `ADMIN_SECRET` env var (for access-codes proxy) |

### ⚠️ Fixing a broken GitHub token (config.js stops updating after deletions)

GitHub personal access tokens expire. If deletions stop updating `config.js` automatically:

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens) → **Generate new token (classic)**
2. Give it `repo` scope and set expiry to at least 1 year
3. Copy the new token
4. Go to your [Vercel project](https://vercel.com) → **Settings → Environment Variables**
5. Update the `GITHUB_TOKEN` value with the new token
6. Trigger a redeploy (any new push to `main` will do)
7. Test by deleting a photo from any album and confirming `config.js` updates on GitHub

---

## Notes

- The hero tagline **"Capturing light, emotion, and the quiet beauty of the world."** has been removed from the live site but is still stored in `SITE_CONFIG.tagline` in `js/config.js` in case you want to bring it back.
- About and Contact pages (`about.html`, `contact.html`) were removed. They still exist in the git history if needed.
- `scripts/dev-server.py` is an orphaned local server (defaults to port 4000). The documented dev workflow uses `vercel dev --listen 8080` (via the **dev-server** skill).
- `scripts/test-header-scroll.mjs` is a Puppeteer probe (debug only; Puppeteer is not in `package.json`).
- `scripts/build-italy-film-rolls.py` is a one-off script for building Italy film roll config.

---

## TODO

### ✅ Done recently

- [x] **Venice** — 95 photos + grid at `Italy/Venice/Digital/`
- [x] **Pisa** — 23 photos + grid at `Italy/Pisa/Digital/`
- [x] **Florence** — 55 photos + grid at `Italy/Florence/Digital/`
- [x] **Assisi** — 11 photos + grid at `Italy/Assisi/Digital/` (from `Export/Assisi/`)
- [x] **California 2025** — 111 photos + grid (`California/Santa-Cruz-Big-Sur/`, `California/Yosemite/`)
- [x] **On Film** — 4 rolls, 150 photos + grid at `Italy/Film/Ultramax/`, `FP4/`, `TMAX/`, `Portra/`
- [x] **Italy curate hub** — `curate-group.html?group=italy-2026` (password: `italy-curate`)
- [x] **Image tiers** — three R2 key tiers per photo:
  - `grid/<key>` — 900px q75 thumbnails for album scroll (replaces 1200px originals after backfill)
  - `view/<key>` — ~2048px q80 for the lightbox (NEW; derived by `scripts/backfill-image-tiers.sh`)
  - `<key>` — original full-res, pulled only on explicit download
  Album, admin, and curate grids use `grid/`; lightbox targets `view/` with 404 fallback to original.
- [x] **GitHub token** — admin deletions auto-update `config.js`
- [x] **RF favicon** — tab icon on all pages
- [x] **Hero image** — `DSCF1569.jpg` (Italy) on home page
- [x] **Editorial album cards** — full-bleed grid, datelines, `(TBD)` placeholders
- [x] **London 2025 placeholder** — TBD album card on gallery (no photos yet)

### 🟡 Next — albums needing photos (external drive)

Export starred picks to `Italy/Export/<City>/` in Lightroom (or equivalent), then say **"upload Rome"** or **"upload London"**.

| Album | R2 path | Drive source | Status |
|---|---|---|---|
| **Rome** | `Italy/Rome/Digital/` | `05_Rome/` (~607 JPGs) | not exported yet — cull/edit first |
| **London 2025** | `London/2025/` (TBD) | not on drive yet | placeholder on site |

Italy group order on site: Venice → Pisa → Florence → Assisi → Rome → On Film.

Gallery order: California 2025 → London 2025 → Italy 2026.

### 🟡 Grid backfill — originals already on R2

These albums work but load slow without grid images. Say **"backfill grid for Joel Birthday"** etc.

| Album | R2 folder | Photos |
|---|---|---|
| **Joel Birthday 2025** | `Joel-Bday-2025/` | 74 |

Do one at a time when the external drive is connected.

### 🟢 Nice to have

> **Engineering / code tasks live in the runbook, not here** — see `IMPROVEMENTS.md`.
> (The admin drag-and-drop photo reorder idea moved there as **ADMIN-1**.)
