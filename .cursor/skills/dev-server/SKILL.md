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
SESSION_SECRET=<from .env.local> \
ADMIN_PASSWORD_HASH=<from .env.local> \
GITHUB_TOKEN=<from .env.local> \
GITHUB_REPO=ravenous711/photography-portfolio \
vercel dev --listen 8080
```

All four values live in `.env.local` at the repo root — copy them from there. Do not commit `.env.local` (it is in `.gitignore`).

> **Note — admin-curate writes to GitHub:** The `/api/admin-curate` endpoint always writes to the default branch of the linked `GITHUB_REPO`. When testing locally on a feature branch, the curated changes are committed to the wrong branch. After saving a curated set locally, run `git pull` to pull any new commits in, then cherry-pick or manually re-apply the curated change to your feature branch.

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
