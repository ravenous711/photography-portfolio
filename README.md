# Raveen Fernando — Photography Portfolio

A minimalist static photography portfolio site built with HTML, Tailwind CSS, and vanilla JS. Images are served from Cloudflare R2.

## Stack
- HTML / Tailwind CSS (CDN) / Vanilla JS
- Cloudflare R2 for image hosting
- Vercel for deployment

---

## How access tiers work

The site has four audience tiers. Every album in `js/config.js` has an `audience` field:

| Audience | Who sees it | How |
|---|---|---|
| `public` | Everyone | Always visible; shows curated subset if `curated[]` is set |
| `friends` | Friends with password | Password unlocks full city albums; curated set is public default |
| `family` | Family with password | Hidden albums that appear in gallery after unlock |
| `client:<name>` | One client | Hidden album, only their password works |

### Passwords (keep in 1Password)

| Tier | Password | Hash |
|---|---|---|
| Friends | see 1Password | `a8b3ec8e...` |
| Family | see 1Password | `c403bc24...` |
| Admin panel | see 1Password | `7a65b8f6...` |

Passwords are stored in 1Password only — **never in the repo** (not even in comments). Only SHA-256 hashes live in `PASSWORD_TIERS` in `js/config.js`.

### Handing out access

- **Friends:** text/email them `raveenfernando.com/unlock/` + the friends password (see 1Password)
- **Family:** same with the family password; they'll see a Family section in the gallery
- **Clients:** create an access code in the admin panel (see "Full client gallery workflow" below) — no password hash editing needed

### Curated sets

Each public/friends album can have a `curated: [...]` array — the highlight photos shown to everyone by default. To pick curated photos:
1. Go to `/admin/` → expand an album → select your top photos
2. Click **Save as curated set** — writes to `config.js` via GitHub, triggers Vercel redeploy

Friends/family who unlock see a **"See all N photos"** button to expand to the full album.

Albums without a `curated[]` array show the full photo set to everyone (fallback).

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

Wrangler credentials live **on your Mac**, not in Cursor or this repo. Re-run setup if uploads fail with auth errors, you switch machines, or you use a new Cursor account on a clean install.

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

**New Mac?** Copy the whole Wrangler config folder, or just run `wrangler login` again on the new machine:
```bash
# optional backup from old Mac
cp -R ~/Library/Preferences/.wrangler ~/Desktop/wrangler-backup
```

**Important:** Always pass `--remote` on uploads. Without it, Wrangler writes to a local simulation and nothing appears in R2:
```bash
wrangler r2 object put "portfolio-images/test.txt" --file /tmp/test.txt --remote
```

**GitHub CLI** (for PRs / `gh` commands) is separate — re-run `gh auth login` if push or PR commands fail.

---

## Cursor agent skill

This repo includes a project skill at `.cursor/skills/add-portfolio-album/SKILL.md` that teaches the Cursor agent the full album workflow (two-phase upload, rate limits, grid generation, config update).

It loads automatically when you open this project in Cursor — no copy step needed if you clone from GitHub. The agent also uses `scripts/upload-album.sh` for the retry helper.

To ask the agent: **"upload Rome"**, **"add London album"**, etc.

---

## Adding a new album

There are three album types. All follow the same upload step, then differ only in what you add to `js/config.js`.

### Step 1 — Upload photos to R2

> **Run all upload commands in Terminal.app, not inside Cursor.** Cursor's sandboxed shell cuts off sustained network connections mid-loop. Terminal.app has no restrictions and will run the full upload reliably.

**All photos from a folder:**
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

> **Always include `--remote`** — without it Wrangler uploads to a local simulation and nothing appears on Cloudflare.

---

### Step 2 — Add the album to `js/config.js`

Every album needs an `audience` tag. Pick the template that matches:

#### Public city album (visible to everyone; curated set shown by default)
```js
{
  id: 'my-city-2026',
  title: 'My City 2026',
  description: 'A short description.',
  location: 'City Name',
  date: 'Month Year',
  audience: 'public',        // visible to all
  protected: false,
  coverImage: `${R2_BASE_URL}/My-City-2026/COVER.JPG`,
  photos: [
    `${R2_BASE_URL}/My-City-2026/PHOTO1.JPG`,
    // ...
  ],
  // curated: []  ← add via admin "Save as curated set" after uploading
},
```

#### Friends album (full album unlocked with friends password; curated set is public)
```js
{
  id: 'my-city-2026',
  title: 'My City 2026',
  audience: 'friends',       // curated set public; full album unlocked with friends password
  protected: false,
  coverImage: `${R2_BASE_URL}/My-City-2026/COVER.JPG`,
  photos: [ ... ],
  // curated: []  ← add after picking highlights in admin
},
```

#### Family album (hidden; appears in gallery only after family password unlock)

Family photos live in the **private R2 bucket** (`portfolio-images-private`). Use `portfolio-images-private` as the upload destination. The album page routes images through the Worker automatically.

```js
{
  id: 'my-family-event',
  title: 'Family Event 2026',
  audience: 'family',        // unlocked with family password (see 1Password); hidden from public gallery
  hidden: true,
  protected: false,
  coverImage: `${R2_BASE_URL}/Family-Event-2026/COVER.JPG`,
  photos: [ ... ],
},
```

#### Client album (hidden; only that client's access code unlocks it)

Client photos live in the **private R2 bucket** (`portfolio-images-private`) — they are never publicly accessible. Use `portfolio-images-private` as the upload destination instead of `portfolio-images`.

```js
{
  id: 'client-john-doe',
  title: 'John Doe — Session 2026',
  audience: 'client:john-doe',   // only client:john-doe access code works
  hidden: true,
  protected: false,
  coverImage: `${R2_BASE_URL}/Client-JohnDoe-2026/COVER.JPG`,
  photos: [
    // Use the same R2 key paths — the album page routes them through the Worker automatically
    `${R2_BASE_URL}/Client-JohnDoe-2026/PHOTO1.JPG`,
    // ...
  ],
},
```

> No `PASSWORD_TIERS` edit needed. The access code is created in the admin panel (see below).

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

2. **Add the album to `js/config.js`** with `audience: 'client:john-doe'` and `hidden: true` (template above).

3. **Commit and push** — Vercel deploys in ~30 seconds.

4. **Create an access code** in the admin panel:
   - Go to `/admin/` → **Access codes** tab
   - Label: `John Doe Session 2026` (your reference only)
   - Audience: `client:john-doe` (must match the album's `audience` field exactly)
   - Code: a strong passphrase (min 8 chars)
   - Click **Create** — **copy the code from the confirmation banner — it is shown once and never stored**

5. **Send the client** the unlock URL + their code:
   > "Your gallery is live! Go to `raveenfernando.com/unlock/` and enter: `<their-code>`"

6. **To revoke access**: Admin panel → Access codes → Revoke. Takes effect immediately.

> The client enters their code once per browser session. The album page handles silent token refresh — they are never interrupted.

---

### Step 3 — Commit and push

```bash
cd /Users/raveenfernando/Documents/photography-portfolio
git add js/config.js
git commit -m "Add My Album"
git push
```
Vercel auto-deploys within ~30 seconds.

---

---

## Admin Panel (`/admin.html`)

Password-protected panel for deleting photos from R2 and the live site.

### How it works
1. Go to `/admin.html` and log in with the admin password
2. Expand an album, click photos to mark them for deletion (they go red)
3. Hit **Commit Deletions** — this deletes from R2 and auto-updates the matching `js/albums/*.js` file via GitHub API, triggering a Vercel redeploy

### Required Vercel environment variables
| Variable | Description |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with R2 write access |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID (`723c27febd4a099c7884fdf00de2329f`) |
| `GITHUB_TOKEN` | GitHub personal access token with `repo` scope |
| `GITHUB_REPO` | e.g. `ravenous711/photography-portfolio` |
| `ADMIN_PASSWORD_HASH` | SHA-256 hash of your admin password |

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
- [x] **Grid tier** — album, admin, and curate use 1200px grid previews
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
