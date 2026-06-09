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

**Hidden albums** (accessible by direct link + password only, not shown in gallery):
Add `hidden: true` to any album in `js/config.js`. Share the link:
`https://photography-portfolio-pi-blush.vercel.app/album.html?id=album-id`

## Adding albums
See `ADDING-ALBUMS.md` for step-by-step instructions.

## Notes
- The hero tagline **"Capturing light, emotion, and the quiet beauty of the world."** has been removed from the live site but is still stored in `SITE_CONFIG.tagline` in `js/config.js` in case you want to bring it back.
- About and Contact pages (`about.html`, `contact.html`) were removed. They still exist in the git history if needed.
