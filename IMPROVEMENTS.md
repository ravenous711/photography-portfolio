# Improvements Backlog

A pick-a-ticket list from the June 2026 site audit. Each ticket is self-contained: grab any one, hand it to the agent ("do ticket QW-3"), and it has the context to act.

**Legend**
- **Effort:** S (minutes) · M (an hour-ish) · L (half-day+)
- **Risk:** Low (isolated) · Med (touches shared code) · High (broad refactor)
- **Status:** `TODO` · `IN PROGRESS` · `DONE` · `WON'T DO`

---

## Contents

**Tier 2 — Styling**
- [STY-2 — Purge dead CSS in `style.css`](#sty-2--purge-dead-css-in-stylecss)
- [STY-3 — Consolidate inline CSS into stylesheets](#sty-3--consolidate-inline-css-into-stylesheets)

**Tier 3 — Maintainability**
- [MNT-1 — Extract shared password gate](#mnt-1--extract-shared-password-gate)
- [MNT-2 — Drop curate's re-implemented utilities](#mnt-2--drop-curates-re-implemented-utilities)
- [MNT-3 — Extract shared lightbox core](#mnt-3--extract-shared-lightbox-core)
- [MNT-4 — Split the 2,192-line `album/index.html`](#mnt-4--split-the-2192-line-albumindexhtml)
- [MNT-5 — Tame the 1,447-line hand-edited `config.js`](#mnt-5--tame-the-1447-line-hand-edited-configjs)

**Tier 4 — Correctness / Robustness**
- [BUG-1 — Curate "album not found" doesn't stop execution](#bug-1--curate-album-not-found-doesnt-stop-execution)
- [BUG-2 — Group page unguarded `subAlbums` access](#bug-2--group-page-unguarded-subalbums-access)
- [BUG-3 — `athena-manifest.py --upload-lists` only writes last batch](#bug-3--athena-manifestpy---upload-lists-only-writes-last-batch)
- [A11Y-1 — Lightbox focus management & ARIA](#a11y-1--lightbox-focus-management--aria)
- [A11Y-2 — Improve image alt text in lightboxes/curate grid](#a11y-2--improve-image-alt-text-in-lightboxescurate-grid)

**Tier 5 — Scripts & Docs Housekeeping**
- [OPS-1 — Label or archive stale scripts](#ops-1--label-or-archive-stale-scripts)
- [OPS-2 — Parameterize hardcoded Italy path](#ops-2--parameterize-hardcoded-italy-path)
- [OPS-3 — Commit-ignore Python caches](#ops-3--commit-ignore-python-caches)

**Tier 6 — Album & Group Header UX**
- [UX-8 — Sibling city-album switcher in the album header](#ux-8--sibling-city-album-switcher-in-the-album-header)

**Other**
- [NOTE-1 — Album passwords are client-side only](#note-1--album-passwords-are-client-side-only)
- [Suggested order](#suggested-order)

---

## Tier 2 — Styling (biggest performance lever)

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

## Tier 6 — Album & Group Header UX

### UX-8 — Sibling city-album switcher in the album header
- **Effort:** M · **Risk:** Med · **Status:** TODO
- **Why:** From a city album (e.g. Rome) the only way to reach a sibling city (Venice, Florence, Assisi, Pisa) is the breadcrumb back-link to the parent Italy group, then a second click into the next album. There's a bottom-of-page "Next" nav (`getNextAlbum`), but it's one-directional and below the fold. A visitor browsing the trip can't hop laterally between cities from the top of the page.
- **Fix:** Surface the parent group's sibling albums in the album header so a user can jump straight to another city without backing out. Likely approaches (pick during implementation):
  - A "cities" dropdown next to the breadcrumb (parent title) that lists sibling sub-albums, current one marked active — mirrors the existing `Navigate` menu pattern and stays compact on mobile.
  - Or prev/next city chevrons flanking the title in the toolbar.
- **Scope notes:**
  - Siblings = `ALBUMS.filter(a => a.parentId === album.parentId && a.type !== 'group' && !a.hidden)` in the group's `subAlbums` order; exclude film-roll sub-albums (`albumKind === 'film-roll'`) or list them separately, TBD.
  - Reuse `getItalyNavSequence()` / `getNextAlbum()` ordering and `albumPageUrl()` for hrefs; respect parent-group password gating (don't expose locked groups' albums).
  - Keep it generic (driven by `parentId`/`subAlbums`), not Italy-specific, so future trips get it for free.
  - Must stay within the one-row compact mobile header (UX-2) — fold into the `Navigate` menu on mobile rather than adding a second row.
- **Files:** `album/index.html` (header toolbar markup + a new sibling-switcher render + wire into `Navigate` menu), `js/main.js` (a `getSiblingAlbums(album)` helper), `css/style.css`
- **Done when:** From a city album, a user can navigate directly to any sibling city from the header (active city indicated); works on desktop + mobile; locked groups aren't exposed; no console errors.

---

## Won't-fix-now / Known limitations

### NOTE-1 — Album passwords are client-side only
- **Status:** ACKNOWLEDGED (by design)
- Hashes live in `config.js` and photos are plain public R2 URLs — anyone reading `config.js` can fetch images directly. Fine for casual gating, **not** real privacy. True privacy would require signed URLs or an auth-gated proxy. No real API tokens are committed (those are Vercel env vars).

---

## Suggested order
1. Tier 4 bugs (BUG-1…BUG-3, A11Y-*).
2. Tier 3 extraction (MNT-1 → MNT-2 → MNT-3 → MNT-4) when next touching album code.
3. Tier 5 housekeeping anytime.
4. Remaining styling: STY-2 → STY-3.
5. Tier 6 header UX: UX-8 (sibling city switcher) when next touching the album header.

_(Tier 6 — earlier header-UX tickets UX-1…UX-7 — done June 2026, removed.)_
