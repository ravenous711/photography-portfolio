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

## Adding albums
See `ADDING-ALBUMS.md` for step-by-step instructions.

## Notes
- The hero tagline **"Capturing light, emotion, and the quiet beauty of the world."** has been removed from the live site but is still stored in `SITE_CONFIG.tagline` in `js/config.js` in case you want to bring it back.
- About and Contact pages (`about.html`, `contact.html`) were removed. They still exist in the git history if needed.
