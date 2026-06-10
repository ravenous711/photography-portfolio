# Raveen Fernando — Photography Portfolio

A minimalist static photography portfolio site built with HTML, Tailwind CSS, and vanilla JS. Images are served from Cloudflare R2.

## Stack
- HTML / Tailwind CSS (CDN) / Vanilla JS
- Cloudflare R2 for image hosting
- Vercel for deployment

---

## Passwords (temporary)

| Gate | Password |
|---|---|
| Site preview | `preview2026` |
| Joel Birthday 2025 | `joeli-oli-ravioli` |

To change any password, generate a new SHA-256 hash and update `js/config.js`:
```bash
python3 -c "import hashlib; print(hashlib.sha256(b'yourpassword').hexdigest())"
```

---

## One-time CLI setup

Run these once in Terminal.app before using Wrangler:
```bash
eval "$(/opt/homebrew/bin/brew shellenv zsh)"   # add Homebrew to PATH
npm install -g wrangler
wrangler login                                   # opens browser to authorize Cloudflare
brew install exiftool                            # for reading Lightroom star ratings
```

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

Pick the template that matches your album type:

#### Public album (visible in gallery, no password)
```js
{
  id: 'my-album',                // used in the URL: ?id=my-album
  title: 'My Album',
  description: 'A short description.',
  protected: false,
  coverImage: `${R2_BASE_URL}/Your-Album-Name/COVER.JPG`,
  photos: [
    `${R2_BASE_URL}/Your-Album-Name/PHOTO1.JPG`,
    `${R2_BASE_URL}/Your-Album-Name/PHOTO2.JPG`,
    // ...
  ],
},
```

#### Password-protected album (visible in gallery, requires password to view)
```js
{
  id: 'my-private-album',
  title: 'My Private Album',
  description: 'A short description.',
  protected: true,
  passwordHash: 'PASTE_SHA256_HASH_HERE',   // see password section above
  coverImage: `${R2_BASE_URL}/Your-Album-Name/COVER.JPG`,
  photos: [
    `${R2_BASE_URL}/Your-Album-Name/PHOTO1.JPG`,
    // ...
  ],
},
```

#### Hidden album (not shown in gallery, accessible only via direct link + password)
```js
{
  id: 'my-hidden-album',
  title: 'My Hidden Album',
  description: 'A short description.',
  hidden: true,                             // removes it from the gallery grid
  protected: true,
  passwordHash: 'PASTE_SHA256_HASH_HERE',
  coverImage: `${R2_BASE_URL}/Your-Album-Name/COVER.JPG`,
  photos: [
    `${R2_BASE_URL}/Your-Album-Name/PHOTO1.JPG`,
    // ...
  ],
},
```
Share the direct link:
```
https://photography-portfolio-pi-blush.vercel.app/album.html?id=my-hidden-album
```

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
3. Hit **Commit Deletions** — this deletes from R2 and auto-updates `config.js` via GitHub API, triggering a Vercel redeploy

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
7. Test by deleting a photo from the **Delete Test** album and confirming `config.js` updates on GitHub

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
- [x] **Italy curate hub** — `curate-group.html?group=italy-2026` (password: `italy-curate`)
- [x] **Grid tier** — album, admin, and curate use 1200px grid previews
- [x] **GitHub token** — admin deletions auto-update `config.js`
- [x] **RF favicon** — tab icon on all pages
- [x] **Hero image** — `DSCF1566.jpg` (Italy) on home page

### 🟡 Next — Italy city albums (needs external drive)

Export starred picks to `Italy/Export/<City>/` in Lightroom, then say **"upload Assisi"** or **"upload Rome"**.

| Album | R2 path | Drive source | Status |
|---|---|---|---|
| **Assisi** | `Italy/Assisi/Digital/` | `04_Assisi/` (~56 JPGs) | not exported yet |
| **Rome** | `Italy/Rome/Digital/` | `05_Rome/` (~607 JPGs) | not exported yet — cull/edit first |

Italy group order on site: Venice → Pisa → Florence → Assisi → Rome → Film.

### 🟡 Grid backfill — originals already on R2

These albums work but load slow without grid images. Say **"backfill grid for Joel Birthday"** etc.

| Album | R2 folder | Photos |
|---|---|---|
| **Joel Birthday 2025** | `Joel-Bday-2025/` | 74 |
| **Film Roll 1** | `Film1/` | 37 |
| **Film Roll 2** | `Film2/` | 38 |
| **Film Roll 3** | `Film3/` | 38 |
| **Film Roll 4** | `Film4/` | 39 |

Do these one at a time when the external drive is connected.

### 🟢 Nice to have

_(none)_
