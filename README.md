# Raveen Fernando — Photography Portfolio

A minimalist static photography portfolio site built with HTML, Tailwind CSS, and vanilla JS. Images are served from Cloudflare R2.

## Stack
- HTML / Tailwind CSS (CDN) / Vanilla JS
- Cloudflare R2 for image hosting
- Vercel for deployment

## Passwords (temporary)

| Gate | Password |
|---|---|
| Site preview | `preview2026` |
| Italy Film group | `film-test` |

These are temporary. To change any password, generate a new SHA-256 hash and update `js/config.js`:
```bash
python3 -c "import hashlib; print(hashlib.sha256(b'yourpassword').hexdigest())"
```

## Uploading photos to R2 (Wrangler CLI)

**One-time setup** (run in Terminal.app):
```bash
# Add Homebrew to PATH (only needed once after install)
eval "$(/opt/homebrew/bin/brew shellenv zsh)"

npm install -g wrangler
wrangler login   # opens browser to authorize Cloudflare
```

**Upload a folder:**
```bash
FOLDER="/path/to/your/photos"
DEST="portfolio-images/FolderName"   # e.g. portfolio-images/Italy-Venice

for f in "$FOLDER"/*.JPG "$FOLDER"/*.jpg; do
  [ -f "$f" ] || continue
  wrangler r2 object put "$DEST/$(basename "$f")" --file "$f"
  echo "✓ $(basename "$f")"
done
```

**Get the file list to paste into Cursor:**
```bash
wrangler r2 object list portfolio-images --prefix FolderName/ --json | grep '"key"'
```
Paste that output into Cursor and say "add this as a new album called X" — it will update `config.js` automatically.

---

## Creating a hidden album from Lightroom-starred photos

This is the full self-serve workflow for turning a folder of photos into a hidden, password-protected album.

**Step 1 — Find your starred photos with exiftool:**
```bash
# Install exiftool if you don't have it
brew install exiftool

# Navigate to your photo folder (quote paths with spaces)
cd "/Volumes/PhotosSSD/Photos/2025/10 - October/Your-Folder"

# Print filenames where Lightroom star rating > 0
exiftool -Rating -filename -T *.JPG 2>/dev/null | awk -F'\t' '$1 > 0 {print $2}' | sort
```
Copy the list of filenames — those are your selects.

**Step 2 — Upload the starred photos to R2:**
```bash
FOLDER="/Volumes/PhotosSSD/Photos/2025/10 - October/Your-Folder"
DEST="portfolio-images/Your-Album-Name"   # e.g. portfolio-images/Joel-Bday-2025

exiftool -Rating -filename -T "$FOLDER"/*.JPG 2>/dev/null | awk -F'\t' '$1 > 0 {print $2}' | sort | while read fname; do
  wrangler r2 object put "$DEST/$fname" --file "$FOLDER/$fname" --remote
  echo "✓ $fname"
done
```
> **Important:** Always include `--remote` — without it, Wrangler uploads to a local simulation instead of real Cloudflare R2.

**Step 3 — Generate a password hash:**
```bash
python3 -c "import hashlib; print(hashlib.sha256(b'yourpassword').hexdigest())"
```

**Step 4 — Add the album to `js/config.js`:**
```js
{
  id: 'your-album-id',
  title: 'Your Album Title',
  description: 'Short description.',
  hidden: true,          // hides it from the gallery grid
  protected: true,
  passwordHash: 'paste-hash-here',
  coverImage: `${R2_BASE_URL}/Your-Album-Name/FIRST_PHOTO.JPG`,
  photos: [
    `${R2_BASE_URL}/Your-Album-Name/PHOTO1.JPG`,
    `${R2_BASE_URL}/Your-Album-Name/PHOTO2.JPG`,
    // ...
  ],
},
```
Paste the filenames from Step 1 into the `photos` array (or ask Cursor to do it).

**Step 5 — Share the link:**
```
https://photography-portfolio-pi-blush.vercel.app/album.html?id=your-album-id
```
The album won't appear anywhere on the site — only people with the direct link and password can access it.

---

**Hidden albums** (accessible by direct link + password only, not shown in gallery):
Add `hidden: true` to any album in `js/config.js`. Share the link:
`https://photography-portfolio-pi-blush.vercel.app/album.html?id=album-id`

## Adding albums
See `ADDING-ALBUMS.md` for step-by-step instructions.

## Notes
- The hero tagline **"Capturing light, emotion, and the quiet beauty of the world."** has been removed from the live site but is still stored in `SITE_CONFIG.tagline` in `js/config.js` in case you want to bring it back.
- About and Contact pages (`about.html`, `contact.html`) were removed. They still exist in the git history if needed.
