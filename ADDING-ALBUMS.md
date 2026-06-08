# Adding New Albums

## Quick steps

1. **Upload photos to R2** under a folder like `portfolio-images/Album-Name/`
2. **Add the album to `js/config.js`** (see template below)
3. Done — the site picks it up automatically

---

## Generating the photo list automatically

If your photos are already named consistently (e.g. `ultramax_01.jpg`), run this from the folder containing them:

```bash
ls | grep -iE '\.(jpg|jpeg|png|webp)$' | sort | python3 -c \
  "import sys, json; print(json.dumps([f.strip() for f in sys.stdin if f.strip()], indent=2))"
```

This prints a JSON array of filenames you can paste directly into the `photos: [...]` array in `config.js`.

Or to generate the full R2 URL list ready to paste:

```bash
R2_BASE="https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev"
FOLDER="portfolio-images/Album-Name"

ls | grep -iE '\.(jpg|jpeg|png|webp)$' | sort | while read f; do
  echo "  \`\${R2_BASE_URL}/${FOLDER}/${f}\`,"
done
```

---

## Album config template

Paste this into the `ALBUMS` array in `js/config.js`:

### Public album

```js
{
  id: 'my-album',                     // unique slug — used in the URL (?id=my-album)
  title: 'My Album',
  description: 'A short description.',
  protected: false,
  coverImage: `${R2_BASE_URL}/portfolio-images/My-Album/cover.jpg`,
  photos: [
    `${R2_BASE_URL}/portfolio-images/My-Album/photo_01.jpg`,
    `${R2_BASE_URL}/portfolio-images/My-Album/photo_02.jpg`,
    // ... paste generated list here
  ],
},
```

### Password-protected album

```js
{
  id: 'my-private-album',
  title: 'My Private Album',
  description: 'A short description.',
  protected: true,
  // Generate password hash — run in browser console:
  // hashPassword('your-password').then(h => console.log(h))
  passwordHash: 'PASTE_SHA256_HASH_HERE',
  coverImage: `${R2_BASE_URL}/portfolio-images/My-Private-Album/cover.jpg`,
  photos: [
    `${R2_BASE_URL}/portfolio-images/My-Private-Album/photo_01.jpg`,
    // ...
  ],
},
```

---

## Generating a password hash

Open any page of the site in your browser, open DevTools → Console, and run:

```js
hashPassword('your-password').then(h => console.log(h))
```

Copy the printed hash into `passwordHash` in `config.js`.

---

## R2 CORS (required for ZIP download + Film Test)

In the Cloudflare dashboard → R2 → your bucket → Settings → CORS, add:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET"],
    "AllowedHeaders": ["*"]
  }
]
```

Replace `"*"` with your actual domain once deployed.

---

## File structure in R2

```
portfolio-images/
├── Film-Test/
│   ├── ultramax_01.jpg
│   ├── ultramax_02.jpg
│   └── ...
├── My-Album/
│   ├── cover.jpg
│   ├── photo_01.jpg
│   └── ...
```
