---
name: dev-server
description: Start and manage the local development server for the photography portfolio. Use when the user wants to run the site locally, test changes, spin up a server, or preview a branch.
---

# Photography Portfolio — Local Dev Server

## Hosting

**Vercel** hosts this site (not Cloudflare Pages).  
Routing is defined in `vercel.json` — rewrites handle `/gallery/:id/`, `/album/:id/`, etc.  
There is also a `_redirects` file for Cloudflare Pages (legacy/parallel config) — ignore it for local dev.

## Starting the server

```bash
vercel dev --listen 8080
```

Run this from the project root. It reads `vercel.json` and handles all URL rewrites correctly.

- `vercel` must be installed globally: `npm install -g vercel`
- Port 8080 is the standard choice; swap if it's taken
- Run with `required_permissions: ["all"]` if the sandbox blocks Vercel's auth check

### Admin API env vars (local dev only)

`SESSION_SECRET` and `ADMIN_PASSWORD_HASH` are Sensitive vars in Vercel and cannot be added to the Development environment — so `vercel dev` won't pick them up from the linked project. Pass them inline:

```bash
SESSION_SECRET=0263cc197da6f1a9df526c07b23d9644329c31fe6fc88f98b3c0c3a557971852 \
ADMIN_PASSWORD_HASH=7a65b8f6d861c21a7bdaad7de3c2eca1d5d540096de8a6dc98bd3cadcc97f3ea \
vercel dev --listen 8080
```

These values are also in `.env.local` for reference (but `vercel dev` doesn't read that file when env vars already exist in the linked project for the development environment).

## Key URLs once running

| Page | URL |
|------|-----|
| Home | http://localhost:8080/ |
| Gallery | http://localhost:8080/gallery/ |
| Italy group | http://localhost:8080/gallery/italy-2026/ |
| Venice album | http://localhost:8080/gallery/italy-2026/venice/ |
| Any sub-album | http://localhost:8080/gallery/:groupId/:slug/ |

**Do not use `?id=` query params** — JS will redirect to the clean URL, which only works with a proper rewrite-aware server.

## Do NOT use

- `python3 -m http.server` — no rewrite support, all deep URLs 404
- `wrangler pages dev` — local binary date lag causes errors, and trailing-slash matching is unreliable

## Stopping the server

```bash
kill $(lsof -ti :8080)
```

## Branch workflow

- `main` → production on Vercel
- Feature branches → push to GitHub, Vercel auto-creates a preview URL
- Current EXIF feature branch: `feature/lightbox-exif`
