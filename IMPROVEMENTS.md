# Improvements Backlog

A pick-a-ticket list from the June 2026 site audit. Each ticket is self-contained: grab any one, hand it to the agent ("do ticket QW-3"), and it has the context to act.

**Legend**
- **Effort:** S (minutes) · M (an hour-ish) · L (half-day+)
- **Risk:** Low (isolated) · Med (touches shared code) · High (broad refactor)
- **Status:** `TODO` · `IN PROGRESS` · `DONE` · `WON'T DO`

---

## Tier 1 — Quick Wins (safe deletions & fixes)

### QW-1 — Delete dead `_redirects` file
- **Effort:** S · **Risk:** Low · **Status:** DONE
- **Why:** Vercel only reads `vercel.json`. `_redirects` is Cloudflare Pages/Netlify format and is fully ignored in production. It duplicates every rule in `vercel.json` → two sources of truth that will silently drift.
- **Files:** `_redirects` (delete)
- **Done when:** File removed; confirm `vercel.json` still covers all redirects/rewrites.

### QW-2 — Delete orphaned image-proxy worker
- **Effort:** S · **Risk:** Low · **Status:** DONE (kept the active `zip-download` worker — it's the live ZIP backend)
- **Why:** Nothing references it (`workers.dev`, `/cdn-cgi/image`, `?key=&w=` → zero hits). Replaced by R2 `grid/` previews via `gridUrl()`.
- **Files:** `workers/image-proxy/` (delete whole dir)
- **Done when:** Directory removed; site still loads grid thumbnails.

### QW-3 — Delete vestigial login page
- **Effort:** S · **Risk:** Low · **Status:** DONE
- **Why:** `login/index.html` immediately runs `window.location.replace(Routes.home)`. The "Preview Access" form is unreachable dead markup.
- **Files:** `login/index.html` (delete), `js/main.js` (remove `SiteAuth` no-op), `js/routes.js` (remove unused `login()` helper), `vercel.json` (remove `/login.html` redirect)
- **Done when:** Page + helpers gone; no references to `/login` or `Routes.login` remain.

### QW-4 — Fix duplicated `featuredPhotos` in config
- **Effort:** S · **Risk:** Low · **Status:** DONE
- **Why:** `featuredPhotos` is defined inside `SITE_CONFIG` (~lines 22–40) then **overwritten** at ~lines 55–66. The first list is dead and misleading.
- **Files:** `js/config.js`
- **Done when:** Only the live (second) list remains; homepage "some favorites" unchanged.

### QW-5 — Add `<meta charset="UTF-8">` to main pages
- **Effort:** S · **Risk:** Low · **Status:** DONE
- **Why:** `index.html`, `gallery/`, `album/`, `group/` lack it. Without it browsers guess encoding — risky with `·`, `—`, `©` used in datelines.
- **Files:** `index.html`, `gallery/index.html`, `album/index.html`, `group/index.html` (add as first `<head>` line)
- **Done when:** All four have `<meta charset="UTF-8" />` before viewport.

### QW-6 — Remove unused exifr CDN script on album page
- **Effort:** S · **Risk:** Low · **Status:** DONE
- **Why:** `album/index.html` loads exifr (~lines 18–19) but never calls it — EXIF comes from `/api/exif/`. It's a render-blocking download for nothing.
- **Files:** `album/index.html`
- **Done when:** Script tag removed; lightbox EXIF still displays (via API).

### QW-7 — Remove unused Tailwind `gold` color config
- **Effort:** S · **Risk:** Low · **Status:** DONE
- **Why:** The `extend.colors.gold` Tailwind config is repeated on 6 pages but `text-gold`/`bg-gold` are never used.
- **Files:** `index.html`, `gallery/index.html`, `album/index.html`, `group/index.html`, `about/index.html`, `admin/index.html`
- **Done when:** Config blocks removed (or whole Tailwind config removed if it ends up empty). Skip if doing STY-1.

---

## Tier 2 — Styling (biggest performance lever)

### STY-1 — Stop shipping Tailwind via dev CDN
- **Effort:** M–L · **Risk:** Med · **Status:** DONE (precompiled `css/base.css` = Preflight + used utilities, linked after `style.css`; CDN removed from all 6 pages; curate untouched. Verified pixel-identical via before/after headless-Chrome computed-style + screenshot diff — 0 pixel differences.)
- **Why:** `cdn.tailwindcss.com` loads on 7 pages. It's a runtime JIT compiler Tailwind explicitly says is **not for production** (large JS + flash-of-unstyled-content every visit). The real design system is `css/style.css` + inline styles; `curate/` pages already render fine without Tailwind.
- **Pick an approach:**
  - **A (recommended): Drop Tailwind entirely.** Replace the handful of utility classes (spacing/typography/flex) with equivalents in `style.css`. No build step.
  - **B: Add a real build step.** Install Tailwind, emit one minified static CSS at build, drop the CDN `<script>`.
- **Files:** all 7 HTML pages, `css/style.css`, maybe `package.json`
- **Done when:** No `cdn.tailwindcss.com` script in production; pages look identical; no FOUC.

### STY-2 — Purge dead CSS in `style.css`
- **Effort:** S–M · **Risk:** Low · **Status:** TODO
- **Why:** ~50–80 lines confirmed dead, mostly from removed Contact/About variants.
- **Known-dead selectors:** `.contact-success` (+`.show`), `.about-photo-wrap` (+`::after`), `.skeleton` (+`@keyframes shimmer`), `.text-gold`, `.sr-only`, `textarea.form-field`; stale "contact" comment ~line 1788.
- **Files:** `css/style.css`
- **Done when:** Dead selectors removed; visual diff shows no change.

### STY-3 — Consolidate inline CSS into stylesheets
- **Effort:** L · **Risk:** Med · **Status:** TODO
- **Why:** ~1,170 lines of inline `<style>` across pages (224 at the **bottom** of `album/index.html`, 303 in `admin/`). `admin`/`album` redefine `.photo-grid`/`.photo-thumb` instead of reusing shared classes. Hard to find/change styles.
- **Files:** `album/index.html`, `admin/index.html`, `curate/*`, `about/index.html` → `css/style.css` or per-page CSS files
- **Done when:** Page-specific CSS lives in stylesheets; shared classes reused, not redefined.

---

## Tier 3 — Maintainability (reduce duplication)

### MNT-1 — Extract shared password gate
- **Effort:** M · **Risk:** Med · **Status:** TODO
- **Why:** Password gating is implemented 4× (album, group, curate, curate/group). Album vs group are near-identical (~55 lines): hash → unlock → shake → error.
- **Files:** new `js/password-gate.js`; `album/index.html`, `group/index.html` (consume it)
- **Done when:** Both pages use one module; unlocking still works + shake animation on wrong password.

### MNT-2 — Drop curate's re-implemented utilities
- **Effort:** S–M · **Risk:** Med · **Status:** TODO
- **Why:** `curate/index.html` and `curate/group/index.html` redefine `hashPassword`, `gridUrl`, and a partial `ImagePreload` that already exist in `js/main.js` (~73 lines duplicated).
- **Files:** `curate/index.html`, `curate/group/index.html` (load `main.js` or a slim shared module instead)
- **Done when:** No duplicate definitions; curate voting + lightbox still work.

### MNT-3 — Extract shared lightbox core
- **Effort:** L · **Risk:** Med · **Status:** TODO
- **Why:** Lightbox double-buffer/open/close/nav logic is duplicated between album and curate (~100–130 lines). Album also lacks a generation-token guard in curate's version (stale-frame risk).
- **Files:** new `js/lightbox.js`; `album/index.html`, `curate/index.html` extend it
- **Done when:** Shared core powers both; album keeps EXIF/ZIP/scroll-lock extras; no stale-frame flashes.

### MNT-4 — Split the 2,192-line `album/index.html`
- **Effort:** L · **Risk:** High · **Status:** TODO
- **Why:** ~1,678 lines of inline JS in one file (lightbox, ZIP, selection mode, sticky toolbar, section nav, justified layout, EXIF). Hardest file to change safely. Depends on / overlaps MNT-1, MNT-3.
- **Files:** `album/index.html` → `js/album-page.js` (+ sub-modules)
- **Done when:** Album logic in external modules; album page behaves identically. Do MNT-1/2/3 first.

### MNT-5 — Tame the 1,447-line hand-edited `config.js`
- **Effort:** L · **Risk:** Med · **Status:** TODO
- **Why:** Grows painful as albums are added; easy to introduce syntax errors by hand.
- **Options:** generate `config.js` from small per-album manifests, or split into per-album files imported together.
- **Files:** `js/config.js`, possibly new `scripts/`
- **Done when:** Adding an album doesn't require editing one giant file by hand.

---

## Tier 4 — Correctness / Robustness

### BUG-1 — Curate "album not found" doesn't stop execution
- **Effort:** S · **Risk:** Low · **Status:** TODO
- **Why:** In `curate/index.html` (~lines 432–439) the no-album / not-found branches set error HTML but don't `return`. `init()` keeps running and `tryUnlock` hits `album.protected` on `null` → TypeError.
- **Files:** `curate/index.html`
- **Done when:** Both branches early-return; visiting `/curate/` with a bad id shows the error cleanly, no console error.

### BUG-2 — Group page unguarded `subAlbums` access
- **Effort:** S · **Risk:** Low · **Status:** TODO
- **Why:** Uses `group.subAlbums?.length` in one spot but unguarded `group.subAlbums.map(...)` at ~line 193 → throws for a group with no subAlbums.
- **Files:** `group/index.html`
- **Done when:** Access is null-safe; a group without subAlbums renders without throwing.

### BUG-3 — `athena-manifest.py --upload-lists` only writes last batch
- **Effort:** S · **Risk:** Low · **Status:** TODO
- **Why:** Indentation bug (~lines 182–190): the `with open(...)` write sits outside the `for prefix, batch` loop, so only the final batch is written.
- **Files:** `scripts/lib/athena-manifest.py`
- **Done when:** Every batch file is written; verify by running the mode.

### A11Y-1 — Lightbox focus management & ARIA
- **Effort:** M · **Risk:** Low–Med · **Status:** TODO
- **Why:** No focus trap or focus-restore on close (Tab reaches content behind overlay). Curate lightbox lacks `role="dialog"`/`aria-modal` and an `aria-label` on the `✕` close button.
- **Files:** `album/index.html`, `curate/index.html`, `js/main.js` (mobile menu also lacks focus trap)
- **Done when:** Lightbox traps focus, restores focus on close, has proper dialog roles/labels.

### A11Y-2 — Improve image alt text in lightboxes/curate grid
- **Effort:** S · **Risk:** Low · **Status:** TODO
- **Why:** Album lightbox uses generic `alt="Photo"`; curate grid/lightbox use `alt=""`. Weak for screen readers.
- **Files:** `album/index.html`, `curate/index.html`
- **Done when:** Alt text reflects album/position (e.g. "Venice — photo 12").

---

## Tier 5 — Scripts & Docs Housekeeping

### OPS-1 — Label or archive stale scripts
- **Effort:** S · **Risk:** Low · **Status:** TODO
- **Why:** `dev-server.py` (orphaned; skill prescribes `vercel dev` on 8080, this defaults to 4000), `test-header-scroll.mjs` (Puppeteer probe, but Puppeteer not in `package.json`), `build-italy-film-rolls.py` (one-off) aren't part of the documented workflow.
- **Files:** `scripts/` + `README.md`
- **Done when:** Each is either removed or clearly labeled "one-off/debug" in the README.

### OPS-2 — Parameterize hardcoded Italy path
- **Effort:** S · **Risk:** Low · **Status:** TODO
- **Why:** `scripts/lib/athena-manifest.py` (~lines 10–13) hardcodes `/Volumes/PhotosSSD/.../Italy`. Non-portable beyond this trip/machine.
- **Files:** `scripts/lib/athena-manifest.py`, `scripts/athena-manifest.sh`
- **Done when:** Path is a CLI arg / env var with the current value as default.

### OPS-3 — Commit-ignore Python caches
- **Effort:** S · **Risk:** Low · **Status:** TODO
- **Why:** `scripts/__pycache__/` and `scripts/lib/__pycache__/` show as untracked.
- **Files:** `.gitignore`
- **Done when:** `__pycache__/` is gitignored; `git status` is clean.

---

## Won't-fix-now / Known limitations

### NOTE-1 — Album passwords are client-side only
- **Status:** ACKNOWLEDGED (by design)
- Hashes live in `config.js` and photos are plain public R2 URLs — anyone reading `config.js` can fetch images directly. Fine for casual gating, **not** real privacy. True privacy would require signed URLs or an auth-gated proxy. No real API tokens are committed (those are Vercel env vars).

---

## Suggested order
1. Tier 1 (QW-1…QW-7) — one safe pass.
2. Decide STY-1 (biggest perf win).
3. Tier 4 bugs (BUG-1…BUG-3, A11Y-*).
4. Tier 3 extraction (MNT-1 → MNT-2 → MNT-3 → MNT-4) when next touching album code.
5. Tier 5 housekeeping anytime.
