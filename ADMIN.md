# Photography Portfolio — Admin Manual

A complete operational guide for site administrators. This document covers the day-to-day tasks
needed to manage albums, access codes, curation, and deployments.

> **Companion documents:**
> - `README.md` — architecture, R2 bucket setup, and the technical content workflow.
> - `IMPROVEMENTS.md` — runbook, ticket backlog, and git/dev conventions.

---

## Table of Contents

1. [Accessing the Admin Panel](#1-accessing-the-admin-panel)
2. [Managing Client Access Codes](#2-managing-client-access-codes)
3. [Curating Albums](#3-curating-albums)
4. [Adding a New Album (end-to-end)](#4-adding-a-new-album-end-to-end)
5. [Album Config Reference](#5-album-config-reference)
6. [Passwords & Secrets](#6-passwords--secrets)
7. [Deployment](#7-deployment)
8. [Backfilling Image Tiers](#8-backfilling-image-tiers)
9. [Common Tasks (quick reference)](#9-common-tasks-quick-reference)

---

## 1. Accessing the Admin Panel

### URL

```
https://raveenfernando.com/admin/
```

During local development:

```
http://localhost:8080/admin/
```

### How login works

The admin panel uses a **server-side session** — the password is never stored in the browser or
in any client-side file. Here's the full flow:

1. You visit `/admin/` and see a password prompt.
2. You enter the admin password (find it in 1Password under **"photography portfolio admin"**).
3. The browser POSTs to `/api/admin-login` with the raw password.
4. The server hashes your submission with SHA-256 and compares it against the
   `ADMIN_PASSWORD_HASH` environment variable (set in the Vercel dashboard).
5. On success, the server sets a signed, `httpOnly` session cookie valid for **24 hours**.
6. Subsequent requests carry this cookie automatically. You can click **Sign out** to clear it.

The password is **never** stored in `config.js` or any client-side file. There is no
`adminPasswordHash` field in config — authentication is entirely server-side.

### What's in the panel

The admin UI has two tabs:

| Tab | What it does |
|-----|-------------|
| **Albums** | Browse every album with photos. Click an album to open its photo grid, manage curation (gold star), mark photos for deletion, and view heart tallies from friends. |
| **Access codes** | Create new client access codes, view all active and revoked codes, and revoke codes that should no longer work. |

#### Albums tab

- Albums are grouped by section (**Family** / **Public · Friends**) and then by year.
- Clicking an album opens a **detail view** showing all photos in a justified grid.
- The detail header shows: total photos · how many are curated · how many are hearted.
- **Gold star badge** on a thumbnail = this photo is in the curated set. Click the star to toggle it.
- **Checkbox** (top-left of thumbnail, appears on hover) = mark for deletion. Click **Commit
  Deletions** in the toolbar to permanently remove from R2 and `config.js`.
- **Heart badge** (top-right, red) = number of times friends hearted this photo.
- The **lightbox** opens on photo click. Keyboard shortcuts: `←`/`→` navigate, `D` marks for
  deletion, `Esc` closes. The **Copy URL** button in the lightbox footer copies the full R2 URL
  — useful for adding a photo to the homepage featured set.

#### Access codes tab

- A **Create access code** form at the top (Label, Audience, plaintext code).
- A table below listing all codes with their label, audience, creation date, and status.
- Active codes show a **Revoke** button.

---

## 2. Managing Client Access Codes

Client albums are protected by a one-time access code. The plaintext code is **never stored** —
only its SHA-256 hash is saved in the Cloudflare D1 database.

### D1 table schema

The access codes live in a D1 database bound to the Cloudflare Worker. The table is:

```sql
CREATE TABLE access_codes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code_hash   TEXT NOT NULL UNIQUE,   -- SHA-256 hex of the plaintext code
  label       TEXT NOT NULL,          -- human label, e.g. "Smith Wedding"
  audience    TEXT NOT NULL,          -- e.g. "client:moksha-yoga"
  created_at  TEXT DEFAULT (datetime('now')),
  revoked     INTEGER NOT NULL DEFAULT 0  -- 0 = active, 1 = revoked
);
```

### How hashing works

When you create a code, the browser sends the **plaintext** to the API. The server
(Cloudflare Worker) computes `SHA-256(plaintext)` using the Web Crypto API and stores only
the hex digest. When a client enters their code at `/unlock/`, the same hash is computed
client-side and sent to the Worker for lookup. The plaintext is never persisted anywhere.

To manually compute a hash (e.g. to verify or look up a code in D1 directly):

```bash
python3 -c "import hashlib; print(hashlib.sha256(b'your-code-here').hexdigest())"
```

Or in the browser console:

```javascript
crypto.subtle.digest('SHA-256', new TextEncoder().encode('your-code-here'))
  .then(b => console.log(Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('')))
```

### Creating a new access code (step by step)

**Before creating a code, make sure:**
- Photos are already uploaded to R2.
- The album entry exists in `js/albums/clients.js` with `audience: 'client:<name>'` and `hidden: true`.

**Steps:**

1. Go to `/admin/` and log in.
2. Click the **Access codes** tab.
3. Fill in the **Create access code** form:
   - **Label** — a human-readable name, e.g. `Smith Wedding` or `Moksha Yoga Jul 2026`.
     This is only for your reference; clients never see it.
   - **Audience** — select `client:name — edit below` from the dropdown, then edit the
     value in the text field to match the album's `audience` exactly, e.g. `client:moksha-yoga`.
     The value must match the album's `audience` field character-for-character.
   - **Plaintext code** — type the code you want to give the client (min 8 characters).
     Use something memorable but hard to guess, e.g. `MokshaYoga2026!`.
4. Click **Create**.
5. ⚠️ **The code is shown exactly once** in the status line below the form. Copy it immediately
   and send it to the client. It will not be shown again — the system only stores the hash.

**Example:**

```
Label:    Moksha Yoga
Audience: client:moksha-yoga
Code:     MokshaYoga2026!
```

After clicking Create, you'll see:

```
✓ Created. Send this code — it won't be shown again: MokshaYoga2026!
```

Send `MokshaYoga2026!` to the client. They enter it at `https://raveenfernando.com/unlock/`.

### Revoking a code

1. Go to `/admin/` → **Access codes** tab.
2. Find the code row by its label.
3. Click **Revoke**.
4. Confirm the dialog. The code is immediately invalidated — any client using it will lose
   access on their next request.

Revoked codes remain visible in the table (greyed out) for audit purposes. They cannot be
re-activated through the UI; create a new code if needed.

### Changing / rotating a code

There is no "edit" operation. To rotate a code:

1. **Revoke** the old code (see above).
2. **Create a new code** with the same label and audience.
3. Send the new plaintext code to the client.

### Viewing codes via wrangler (advanced)

To inspect the D1 table directly:

```bash
cd workers/zip-download
npx wrangler d1 execute portfolio-db --command "SELECT id, label, audience, created_at, revoked FROM access_codes ORDER BY id DESC;"
```

To revoke by ID directly (e.g. if the admin panel is unavailable):

```bash
npx wrangler d1 execute portfolio-db --command "UPDATE access_codes SET revoked = 1 WHERE id = 5;"
```

---

## 3. Curating Albums

### What curated means

Every album can have an optional `curated[]` array in its config. This is a subset of photos
shown as the **public preview** of the album — the photos visible without unlocking.

| Album type | Without curated | With curated |
|------------|-----------------|--------------|
| `public`   | All photos shown | Curated by default; anyone can toggle to full album |
| `family` / `client:*` | Hidden — no public preview | Hidden — password/code required for everything |

City trip albums are `public` with a curated set of highlights; the full album is open via **"See full album"**.

### How to update the curated set via the admin panel

1. Go to `/admin/` → **Albums** tab.
2. Click the album you want to edit.
3. In the photo grid, photos with a **gold star** (bottom-right corner) are currently curated.
4. To **add** a photo to the curated set: hover over it — a faint star outline appears.
   Click it to stage the addition (the star turns gold, the thumbnail border turns gold).
5. To **remove** a photo from the curated set: click the solid gold star on a curated photo.
   The star fades and the border turns grey.
6. Use **Show curated only** (top-right filter button) to see just the current curated set while editing.
7. When done, click **Save curated changes** in the toolbar. The changes are written to
   `config.js` on the server and Vercel automatically redeploys within ~30 seconds.

Visual cues summary:

| State | Thumbnail border | Star |
|-------|-----------------|------|
| Not curated | None | Faint outline on hover |
| Pending add (staged) | Gold | Gold (faint add badge) |
| Currently curated | Gold | Solid gold star |
| Pending remove (staged) | Grey | Faded |

### Updating curated set by editing config.js directly

If you prefer to edit the config file directly (e.g. for batch changes):

1. Open `js/albums/<file>.js` for the relevant album.
2. Add or update the `curated` array with full R2 URLs from the `photos` array:

```javascript
{
  id: 'california-santa-cruz',
  title: 'Santa Cruz & Big Sur',
  audience: 'public',
  photos: [
    `${R2_BASE_URL}/California/Santa-Cruz-Big-Sur/California-009.jpg`,
    `${R2_BASE_URL}/California/Santa-Cruz-Big-Sur/California-011.jpg`,
    // ... many more
  ],
  curated: [
    `${R2_BASE_URL}/California/Santa-Cruz-Big-Sur/California-009.jpg`,
    `${R2_BASE_URL}/California/Santa-Cruz-Big-Sur/California-041.jpg`,
    `${R2_BASE_URL}/California/Santa-Cruz-Big-Sur/California-060.jpg`,
    // ... 20-40 selected photos
  ],
}
```

3. Commit and push to `main` to deploy.

---

## 4. Adding a New Album (end-to-end)

### Step 1 — Export photos from Lightroom

Export settings in Lightroom Classic:

| Setting | Value |
|---------|-------|
| Format | JPEG |
| Color Space | sRGB |
| Quality | 100% (originals — resizing happens separately) |
| File Naming | Descriptive, no spaces (use hyphens) |
| Resize | None — export full resolution |

Keep originals for archiving. You'll derive smaller tiers locally before uploading.

### Step 2 — Generate grid/ and view/ tiers locally

The site uses three image tiers:

| Tier | Purpose | Max dimension | Quality |
|------|---------|---------------|---------|
| `grid/` | Album thumbnails / grid layout | 900 px (longest edge) | 75 |
| `view/` | Lightbox display | 2048 px (longest edge) | 80 |
| *(original)* | Download only | Full resolution | 100 |

Generate both tiers using `sips` (built into macOS). Run these from the folder containing
your exported originals:

```bash
# Create output directories
mkdir -p grid view

# Generate grid/ thumbnails (900px, quality 75)
for f in *.jpg; do
  sips -Z 900 --setProperty formatOptions 75 "$f" --out "grid/$f"
done

# Generate view/ images (2048px, quality 80)
for f in *.jpg; do
  sips -Z 2048 --setProperty formatOptions 80 "$f" --out "view/$f"
done
```

Single file example:

```bash
sips -Z 900 --setProperty formatOptions 75 photo.jpg --out grid/photo.jpg
sips -Z 2048 --setProperty formatOptions 80 photo.jpg --out view/photo.jpg
```

Verify the output looks correct before uploading.

### Step 3 — Upload to R2

**Public albums** (audience: `public` or `friends`) → upload to `portfolio-images` bucket.

**Private albums** (audience: `family` or `client:*`) → upload to `portfolio-images-private` bucket.

Use `wrangler r2 object put` or the `scripts/upload-album.sh` helper. The R2 key structure should be:

```
<AlbumFolder>/photo-001.jpg          ← original
grid/<AlbumFolder>/photo-001.jpg     ← grid tier
view/<AlbumFolder>/photo-001.jpg     ← view tier
```

Example upload commands for a public album called "Amsterdam 2026":

```bash
# Upload originals
wrangler r2 object put portfolio-images/Amsterdam-2026/photo-001.jpg \
  --file ./originals/photo-001.jpg

# Upload grid tier
wrangler r2 object put portfolio-images/grid/Amsterdam-2026/photo-001.jpg \
  --file ./grid/photo-001.jpg

# Upload view tier
wrangler r2 object put portfolio-images/view/Amsterdam-2026/photo-001.jpg \
  --file ./view/photo-001.jpg
```

For batch uploads of many photos, use the `scripts/upload-album.sh` script (see `README.md`
for the full upload workflow with wrangler sync).

For **private albums**, add the `--remote portfolio-images-private` flag:

```bash
wrangler r2 object put portfolio-images-private/Client-Name/photo-001.jpg \
  --file ./originals/photo-001.jpg
```

### Step 4 — Add album entry to js/config

Albums live in `js/albums/` — one file per category. Edit the relevant file or create a new one.

**Public/friends album example** (e.g. `js/albums/misc-2026.js`):

```javascript
{
  id: 'amsterdam-2026',           // unique, URL-safe slug
  title: 'Amsterdam',             // display title
  description: 'Amsterdam, Netherlands — June 2026.',
  location: 'Amsterdam, Netherlands',
  date: 'June 2026',
  audience: 'public',            // public, family, or client:<name>
  protected: false,               // true if album has its own password gate
  coverImage: `${R2_BASE_URL}/Amsterdam-2026/photo-001.jpg`,
  photos: [
    `${R2_BASE_URL}/Amsterdam-2026/photo-001.jpg`,
    `${R2_BASE_URL}/Amsterdam-2026/photo-002.jpg`,
    // ... all photos
  ],
  curated: [
    // Optional: subset shown publicly before unlocking
    `${R2_BASE_URL}/Amsterdam-2026/photo-001.jpg`,
    `${R2_BASE_URL}/Amsterdam-2026/photo-005.jpg`,
  ],
}
```

**Client album example** (in `js/albums/clients.js`):

```javascript
{
  id: 'smith-wedding',            // must match the client: suffix below
  title: 'Smith Wedding',
  description: 'Smith Wedding — August 2026.',
  date: 'August 2026',
  audience: 'client:smith-wedding', // matches the access code's audience field
  hidden: true,                   // hides from /gallery/ listing
  protected: false,
  gridFavorites: false,
  coverImage: `${R2_BASE_URL}/Smith-Wedding/Smith-Wedding-01.jpg`,
  photos: [
    `${R2_BASE_URL}/Smith-Wedding/Smith-Wedding-01.jpg`,
    `${R2_BASE_URL}/Smith-Wedding/Smith-Wedding-02.jpg`,
    // ... all photos
  ],
}
```

> **Important for private albums:** Client and family photos are served from
> `portfolio-images-private` via signed Worker tokens. The `photos[]` array still uses
> `${R2_BASE_URL}` (the public base URL constant) — the Worker intercepts requests for private
> keys and gates them behind a valid token. Do not manually construct private-bucket URLs in
> the config.

If the album should appear under a parent group (e.g. Italy → Venice), add `parentId`:

```javascript
{
  id: 'amsterdam-2026',
  parentId: 'europe-2026',     // id of the parent group album
  // ...
}
```

And ensure the group album's `subAlbums` array lists the child id:

```javascript
{
  id: 'europe-2026',
  type: 'group',
  subAlbums: ['amsterdam-2026', 'paris-2026'],
  // ...
}
```

### Step 5 — For client albums, create the access code

After the album is in config, create the access code via the admin panel:

1. Go to `/admin/` → **Access codes** tab.
2. Fill in Label, Audience (`client:<id>`), and plaintext code.
3. Click Create and **copy the code immediately** — it is shown only once.
4. Send the code to the client. Direct them to `https://raveenfernando.com/unlock/`.

### Step 6 — Deploy

```bash
git add .
git commit -m "add Amsterdam 2026 album"
git push origin main
```

Vercel picks up the `main` branch push and auto-deploys within ~30–60 seconds. The site is live
once the Vercel build completes (you can monitor it in the Vercel dashboard).

> **Note:** Do not push to `main` without explicit sign-off. Use a feature branch and open a PR
> if you want a review before deploying.

---

## 5. Album Config Reference

### Full field reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier. Used in URLs and internal lookups. URL-safe, no spaces (use hyphens). |
| `title` | `string` | Yes | Display title shown in the gallery and admin panel. |
| `description` | `string` | No | Short description shown on the album page. |
| `location` | `string` | No | Location string shown in metadata. |
| `date` | `string` | No | Date string, e.g. `"July 2026"`. |
| `audience` | `string` | Yes | Access tier — see table below. |
| `hidden` | `boolean` | No | If `true`, album does not appear in `/gallery/` listing. Required for client/family albums. |
| `protected` | `boolean` | No | If `true`, the album page shows a password gate. Usually `false` — auth is handled by the tier system. |
| `type` | `string` | No | Set to `'group'` for a parent album that groups sub-albums. |
| `subAlbums` | `string[]` | No | For group albums: array of child album `id`s. |
| `parentId` | `string` | No | For child albums: the `id` of the parent group album. |
| `coverImage` | `string` | No | Full R2 URL of the cover image shown in gallery grid. |
| `photos` | `string[]` | No | Full R2 URLs of all photos in the album (originals). |
| `curated` | `string[]` | No | Subset of `photos[]` shown publicly. If omitted, all photos are shown (for public) or none (for protected albums). |
| `gridFavorites` | `boolean` | No | Enables the heart/favorite feature on the album grid. |
| `albumKind` | `string` | No | Internal classifier. `'film-roll'` hides from admin photo grid. |
| `prefix` | `string` | No | R2 key prefix used by some tooling to locate album photos. |

### Audience values

| Value | Who can see the album | Notes |
|-------|-----------------------|-------|
| `'public'` | Everyone | If `curated[]` is set, that is the default view; anyone can toggle to the full album. |
| `'family'` | Requires family password; photos in private R2 bucket | Hidden from public gallery. |
| `'client:<name>'` | Requires client-specific access code; photos in private R2 bucket | `<name>` must match the album `id` and the D1 access code's `audience` field exactly. |

> Legacy `'friends'` was removed Aug 2026 — use `'public'` for city/travel albums.

### How `hidden: true` works

When `hidden: true` is set on an album:
- The album does **not** appear in the `/gallery/` listings or any public index.
- The album **can** still be accessed directly by URL if the viewer has the correct token/code.
- The admin panel shows all albums regardless of `hidden`.
- Family and client albums should always have `hidden: true`.

---

## 6. Passwords & Secrets

### Golden rule

**Passwords and secrets are never stored in source code or config files.** All sensitive values
live in:

- **1Password** — for passwords you share with people.
- **Vercel environment variables** — for server-side secrets used by API routes.
- **Wrangler secrets** — for secrets used inside the Cloudflare Worker.

### Friends password — removed

Friends capability-link / password unlock was removed Aug 2026. Public albums need no password.
The old share key in 1Password is obsolete (safe to archive).

### Family password

- Stored as a SHA-256 hash in `PASSWORD_TIERS`, mapping to `['family']`.
- The plaintext is in 1Password under **"photography portfolio family password"**.
- To rotate: generate a new password, compute its hash, update the hash in `js/config.js`,
  and update the Worker `FAMILY_HASH` secret to match.

```python
# Generate a new hash:
python3 -c "import hashlib; print(hashlib.sha256(b'new-password'.encode()).hexdigest())"
```

### Admin password

- **Never** stored in config.js or any client-side file.
- Lives in 1Password under **"photography portfolio admin"**.
- Verified server-side: Vercel env var `ADMIN_PASSWORD_HASH` holds the SHA-256 hash.
- To rotate: generate a new password → compute hash → update `ADMIN_PASSWORD_HASH` in the
  Vercel dashboard → redeploy → update the 1Password entry.

### Client access codes

- Plaintext lives in 1Password (and is sent to the client once).
- Only the SHA-256 hash is stored in the Cloudflare D1 database (`access_codes` table).
- Rotating a code: revoke the old one, create a new one, send new code to client.

### Environment variables reference

**Vercel dashboard** (used by `/api/` routes):

| Variable | Purpose |
|----------|---------|
| `ADMIN_PASSWORD_HASH` | SHA-256 hex of the admin password |
| `SESSION_SECRET` | Random secret for signing admin session cookies |
| `WORKER_BASE_URL` | URL of the Cloudflare Worker (e.g. `https://portfolio-zip-download.raveenfernando.workers.dev`) |
| `WORKER_ADMIN_SECRET` | Shared secret for Vercel → Worker admin API calls |

**Wrangler secrets** (used by the Cloudflare Worker):

| Secret | Purpose |
|--------|---------|
| `ADMIN_SECRET` | Authorizes admin CRUD calls from Vercel API to the Worker |
| `UNLOCK_SECRET` | Signs HMAC tokens issued at `/unlock` (4h TTL) |
| `FRIENDS_HASH` | SHA-256 of friends password (Worker-side validation) |
| `FAMILY_HASH` | SHA-256 of family password (Worker-side validation) |

---

## 7. Deployment

### Vercel (main site)

The site auto-deploys from `main`:

```
git push origin main  →  Vercel builds and deploys in ~30–60 seconds
```

- Deployment status: [Vercel dashboard](https://vercel.com/dashboard)
- Environment variables: Vercel project → Settings → Environment Variables
- The build is static HTML/CSS/JS; there is no build step for the frontend.
- API routes under `api/` are deployed as Vercel serverless functions.

**Only push to `main` when explicitly approved.** Use feature branches for work-in-progress.

### Cloudflare Worker (zip downloads, unlock, private images, access codes)

The Worker must be deployed separately. It is not deployed by Vercel.

```bash
cd workers/zip-download
npx wrangler deploy
```

This deploys to `portfolio-zip-download.raveenfernando.workers.dev`.

**When to redeploy the Worker:**
- Adding or changing Worker logic (new routes, access control changes).
- Rotating `ADMIN_SECRET`, `UNLOCK_SECRET`, `FRIENDS_HASH`, or `FAMILY_HASH`.
- Changing D1 database schema.

**Updating Worker secrets:**

```bash
cd workers/zip-download
echo "new-secret-value" | npx wrangler secret put ADMIN_SECRET
echo "new-hash-value"   | npx wrangler secret put FRIENDS_HASH
```

**D1 database migrations** (if schema changes):

```bash
npx wrangler d1 execute portfolio-db --file=./migrations/0001_add_column.sql
```

### Checking what's deployed

```bash
# Show currently deployed Worker version
cd workers/zip-download
npx wrangler deployments list

# View Worker logs (live tail)
npx wrangler tail
```

---

## 8. Backfilling Image Tiers

### When you need this

The backfill scripts generate `grid/` (900px) and `view/` (2048px) tiers from originals
already uploaded to R2. You need to run a backfill when:

- Adding a new album whose originals are already in R2 but the tiers haven't been generated.
- Regenerating tiers after changing the resize settings.
- Completing a partial backfill that was interrupted.

### How it works

The script (`scripts/backfill-image-tiers.sh`):
1. Lists all R2 objects under the given `--prefix`.
2. For each original, checks whether `grid/<prefix>/...` and `view/<prefix>/...` already exist.
3. Skips keys that already exist (unless `--force-grid` is passed).
4. Downloads each original, resizes with `sips`, and uploads the derived tiers back to R2.

The master script (`scripts/run-full-backfill.sh`) runs the above across predefined batches
covering all albums.

### Running a backfill for a single album

```bash
cd /Users/raveenfernando/Documents/photography-portfolio

# Public album:
./scripts/backfill-image-tiers.sh --prefix Amsterdam-2026

# Private album (uses portfolio-images-private bucket):
./scripts/backfill-image-tiers.sh --prefix Smith-Wedding --private

# Dry run first (recommended before a real run):
./scripts/backfill-image-tiers.sh --prefix Amsterdam-2026 --dry-run

# Test with just 5 photos:
./scripts/backfill-image-tiers.sh --prefix Amsterdam-2026 --limit 5

# Regenerate grid/ tier even if it already exists:
./scripts/backfill-image-tiers.sh --prefix Amsterdam-2026 --force-grid
```

### Running the full backfill (all albums)

```bash
./scripts/run-full-backfill.sh
```

With options:

```bash
# Run only batch 1 (Italy digital):
./scripts/run-full-backfill.sh --batch 1

# Run batch 3, dry-run:
./scripts/run-full-backfill.sh --batch 3 --dry-run

# Resume from a specific prefix after a failure:
./scripts/run-full-backfill.sh --from Amsterdam-2026

# Skip rate-limit sleeps (faster, use after cooldown):
./scripts/run-full-backfill.sh --fast

# Only regenerate grid/ tier:
./scripts/run-full-backfill.sh --grid-only
```

**Batch map:**

| Batch | Covers |
|-------|--------|
| 1 | Italy digital (Venice, Florence, Rome, Pisa, Assisi) |
| 2 | Italy film rolls |
| 3 | California (Santa Cruz/Big Sur, Yosemite) |
| 4 | Red Rock Canyon + misc public |
| 5 | Events/visits (various family + friends albums) |
| 6 | Misc film rolls + client albums (private) |

Output is logged to `/tmp/backfill-<timestamp>.log`. The script continues even if individual
photos fail — failures are tallied and listed in the final summary.

### Verifying a backfill completed

To spot-check that `grid/` keys exist for an album:

```bash
npx wrangler r2 object list portfolio-images --prefix "grid/Amsterdam-2026" | head -20
```

For private albums:

```bash
npx wrangler r2 object list portfolio-images-private --prefix "grid/Smith-Wedding" | head -20
```

If the count matches the original count, the backfill is complete for that album.

---

## 9. Common Tasks (quick reference)

### Change a client's access code

1. Go to `/admin/` → **Access codes** tab.
2. Find the client's row → click **Revoke**.
3. Fill in the Create form with the same label and audience, a new plaintext code.
4. Click Create and **copy the new code immediately**.
5. Send the new code to the client. The old code is already invalid.

---

### Add a photo to a curated set

**Via admin panel (recommended):**

1. Go to `/admin/` → **Albums** tab → click the album.
2. Hover over the photo you want to add. A faint star outline appears bottom-right.
3. Click the star to stage the addition (border and star turn gold).
4. Click **Save curated changes** in the toolbar.

**Via config (alternative):**

1. Open `js/albums/<file>.js`.
2. Copy the photo's full R2 URL from the `photos[]` array.
3. Paste it into the `curated[]` array (order matters — preserves display order).
4. Commit and push to `main`.

---

### Remove a photo from a curated set

**Via admin panel:**

1. Go to `/admin/` → **Albums** tab → click the album.
2. Click the **gold star** on a curated photo. The star fades and border turns grey.
3. Click **Save curated changes**.

**Via config:**

1. Open `js/albums/<file>.js`.
2. Delete the photo's URL from the `curated[]` array.
3. Commit and push to `main`.

---

### Hide or unhide an album

To **hide** an album (remove from `/gallery/` listing but keep accessible by direct URL):

In `js/albums/<file>.js`, add or set:

```javascript
hidden: true,
```

To **unhide** (show in gallery):

```javascript
hidden: false,   // or remove the field entirely
```

Commit and push to `main` to deploy.

---

### Permanently delete photos from an album

> ⚠️ Deletion is **permanent and cannot be undone**. Double-check before committing.

1. Go to `/admin/` → **Albums** tab → click the album.
2. Hover over a photo and click the **checkbox** (top-left) to mark it for deletion.
   Repeat for any additional photos. The count in the toolbar updates.
3. You can also open a photo in the lightbox and click **Mark for deletion** there.
4. Click **Commit Deletions** in the toolbar.
5. Confirm the dialog.
6. The selected photos are removed from R2 and from `config.js`. Vercel redeploys automatically.

---

### Check if the backfill completed for an album

```bash
# List grid/ keys and count them
npx wrangler r2 object list portfolio-images --prefix "grid/Amsterdam-2026" | wc -l

# Compare to original count
npx wrangler r2 object list portfolio-images --prefix "Amsterdam-2026" | wc -l
```

The counts should be equal (plus one for the prefix itself in some list outputs). If `grid/`
count is lower, run the backfill for that prefix.

---

### Revoke client access immediately

1. Go to `/admin/` → **Access codes** tab.
2. Click **Revoke** next to the client's code.
3. Access is revoked immediately — any token they have will still work for up to 4 hours
   (the Worker token TTL), but they cannot generate new tokens.

To force-expire any cached tokens, you can rotate the `UNLOCK_SECRET` wrangler secret (this
invalidates **all** tokens for all users, so use carefully):

```bash
cd workers/zip-download
echo "new-random-secret-$(openssl rand -hex 16)" | npx wrangler secret put UNLOCK_SECRET
npx wrangler deploy
```

---

### Rotate the family password

1. Generate a new password and compute its SHA-256 hash:
   ```bash
   python3 -c "import hashlib; print(hashlib.sha256(b'new-password'.encode()).hexdigest())"
   ```
2. Open `js/config.js` and replace the old family hash in `PASSWORD_TIERS` with the new hash (`['family']`).
3. Update 1Password with the new plaintext password.
4. Commit and push to `main`.
5. Update the Worker `FAMILY_HASH` secret to match:
   ```bash
   cd workers/zip-download
   echo "new-hash-here" | npx wrangler secret put FAMILY_HASH
   npx wrangler deploy   # only with explicit approval
   ```

> Friends password / share-key rotation is obsolete (tier removed Aug 2026). `FRIENDS_HASH` Worker secret can be left unused or deleted later.