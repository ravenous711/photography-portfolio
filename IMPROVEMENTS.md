# Photography Portfolio — Runbook & Backlog

A living runbook for `raveenfernando.com`: how to work on the site, a pick-a-ticket
backlog from the June 2026 audit, and a parking lot for larger ideas. Grab any ticket,
hand it to the agent ("do ticket BUG-1"), and it has the context to act.

---

## How to use this runbook

### Working a ticket
- Every ticket below is self-contained: **Why / Fix / Files / Done when**. That's the brief.
- Hand one to the agent by ID, e.g. *"work MNT-1"* or *"do BUG-1 and BUG-2"*.
- Update the ticket **Status** (and the Status board) as you go: `TODO → IN PROGRESS → DONE`.
- When a ticket ships, move a one-line entry to the **Changelog** at the bottom.

### Local dev
- Start the local server with the **dev-server** skill, or: `vercel dev --listen 8080`.
- Site is static HTML/CSS/JS. Config + all album metadata live in `js/config.js`.
- Images are served from a public Cloudflare R2 bucket; ZIP downloads from a Cloudflare Worker.

### Testing & verification
- Verify UI/UX changes in a real browser at `http://localhost:8080`; for headless checks
  use the Puppeteer probe pattern (point at the system Chrome binary), then clean up temp files.
- Sanity-check the console for errors and test both desktop + mobile widths.

### Git & deploy conventions
- Use a **feature branch per ticket** (`git checkout -b <ticket>-short-name`).
- **Commit after each logical step** so any step is easy to revert.
- Production auto-deploys from `main` via Vercel — so **push to `main` only when explicitly asked**.
- **Never deploy, publish, or upload files/data to an external endpoint without explicit approval.**

### Legend
- **Effort:** S (minutes) · M (an hour-ish) · L (half-day+)
- **Risk:** Low (isolated) · Med (touches shared code) · High (broad refactor)
- **Status:** `TODO` · `IN PROGRESS` · `DONE` · `WON'T DO`

### Album adds (agent)
- Use the **add-portfolio-album** skill (`.cursor/skills/add-portfolio-album/SKILL.md`).
- **Check [Active album session](#active-album-session) first** — it tracks in-flight R2 uploads,
  config/deploy state, and the queue. Update it as you go (status + changelog when done).

---

## Active album session

Living tracker for multi-step album work (local photos → R2 → `config.js` → deploy).
**Update this section** when starting, finishing, or queueing albums.

*Active session (Jul 29 2026 — Moksha Yoga renumber shipped on main).*

### In progress

*(none)*

### Queued (approved, not started)

*(none)*

### Done (this session)

| Album | Audience | Notes |
|-------|----------|-------|
| **Moksha Yoga renumber** | `client:moksha-yoga` | Renumbered `15b`→`16`, shifted former `16`–`50`→`17`–`51`. Local + private R2 complete; config sequential `01`–`51` in `js/albums/clients.js`. Shipped on `main` (`1cbdeaa`). |
| **Moksha Yoga** | `client:moksha-yoga` | 51 photos on `portfolio-images-private/Moksha-Yoga/` + grids. Merged to `main` (`c0ae2cf`); client return navigation and album-specific grid controls shipped in `7a18855`. Access code created in D1 (id 1). Missed export was later renumbered into sequential `01`–`51` (see renumber row). |

---

## Status board

| Ticket | Area | Effort | Risk | Status |
|--------|------|--------|------|--------|
| PERF-1 | Performance | L | Med | IN PROGRESS |
| BUG-1 | Correctness | S | Low | TODO |
| BUG-2 | Correctness | S | Low | TODO |
| BUG-3 | Correctness | S | Low | TODO |
| A11Y-1 | Accessibility | M | Low–Med | TODO |
| A11Y-2 | Accessibility | S | Low | TODO |
| MNT-1 | Maintainability | M | Med | TODO |
| MNT-2 | Maintainability | S–M | Med | TODO |
| MNT-3 | Maintainability | L | Med | TODO |
| MNT-4 | Maintainability | L | High | TODO |
| MNT-5 | Maintainability | L | Med | TODO |
| STY-2 | Styling | S–M | Low | TODO |
| STY-3 | Styling | L | Med | TODO |
| OPS-1 | Housekeeping | S | Low | TODO |
| OPS-2 | Housekeeping | S | Low | TODO |
| OPS-3 | Housekeeping | S | Low | TODO |
| OPS-4 | Tooling | L | Med | TODO |
| ADMIN-1 | Admin/tooling | M–L | Med | TODO |
| AUTH-1 | Idea (big) | XL | High | ✅ DONE |
| FEAT-1 | Idea | M–L | Med | ✅ DONE |
| UX-8 | Header UX | M | Med | ✅ DONE |
| FEAT-2 | Friends curation flow | L | Med | ✅ DONE |
| FEAT-3 | Select & download workflow | L | Med | TODO |
| UX-HEARTS | Differentiate hearts vs selection visually | S | Low | TODO |

### Where to start next
1. **Quick wins:** Tier bugs BUG-1…BUG-3 + A11Y-1/A11Y-2 (small, isolated, low risk).
2. **Maintainability**, when next touching album code: MNT-1 → MNT-2 → MNT-3 → MNT-4.
3. **Housekeeping** anytime: OPS-1 → OPS-2 → OPS-3.
4. **Styling:** STY-2 → STY-3.
  5. **Big bet:** AUTH-1 + FEAT-1 fully shipped (Phases 1–3b). Private R2 + signed tokens + access codes panel all live. See AUTH-1 ticket for details.

---

## Tickets

### Performance

#### PERF-1 — Add view/ image tier; stop lightbox serving 15-40MB originals
- **Effort:** L · **Risk:** Med · **Status:** IN PROGRESS (Phases 1–6 implemented on `feat/perf1-download-and-upload-tiers`; Worker redeploy needed for Phase 6)
- **Why:** ~~The lightbox upgrades to the raw original on every open…~~ *(fixed Aug 2026 for viewing.)* Remaining work was the download path and making new uploads emit `view/` so albums don't regress.
- **Target model:** `grid/` (thumbnails) → `view/` ~2048px (lightbox) → original (download only, explicitly chosen).
- **Phases:**
  - **Phase 1** (`perf/lightbox-image-tiers`): Frontend lightbox → `view/` with 404 fallback. **Shipped on `main` (`48495fc`).**
  - **Phase 2**: Worker ACL for `view/<client>/`. **On `main`; Worker deployed.**
  - **Phase 3**: `scripts/backfill-image-tiers.sh`. **On `main`.**
  - **Phase 4**: Backfill live albums. **Done** (every live album has `view/`).
  - **Phase 5** (`feat/perf1-download-and-upload-tiers`): Size chooser on ZIP / Download All / section downloads (Low/Med/Full), keys remapped via `sizedKey`, preference shared with lightbox dropdown. **Implemented; awaiting merge.**
  - **Phase 6** (`feat/perf1-download-and-upload-tiers`): Private album ZIP — token-gated `PRIVATE_BUCKET` reads in the ZIP Worker. **Implemented; needs Worker redeploy after merge.**
  - **Upload path:** `upload-album.sh` now generates/uploads `grid/` (900px q75) + `view/` (2048px q80) alongside originals. **Implemented; awaiting merge.**
- **Files:** `js/main.js`, `album/index.html`, `workers/zip-download/src/index.js`, `scripts/backfill-image-tiers.sh`, `scripts/upload-album.sh`, `scripts/lib/r2-upload-lib.sh`
- **Done when:** Lightbox serves `view/` for all backfilled albums; download chooser lets users pick web/large/original; private albums can ZIP; originals are only pulled on explicit download.

> **Regression note (Aug 2026).** Phase 1 landed on `main` as `7edbd70`/`8f5b705` and was wiped an hour later by `028c108` (`Merge branch 'feat/backfill-image-tiers'`). That branch forked before Phase 1, and the conflict resolution took its copy of `album/index.html` and `js/main.js` verbatim — the merge result is byte-identical to the branch side for both files. Only the Phase 1 *docs* survived, which is why this ticket read as shipped for a week while the lightbox served originals. Measured on Venice before the fix: opening one photo and pressing next three times pulled **255 MB**; after, **5.2 MB**. When merging a branch that forks before a perf change, diff the result against the pre-merge tip before pushing.

---

### Correctness / robustness

#### BUG-1 — Curate "album not found" doesn't stop execution
- **Effort:** S · **Risk:** Low · **Status:** TODO
- **Why:** In `curate/index.html` (~lines 432–439) the no-album / not-found branches set error HTML but don't `return`. `init()` keeps running and `tryUnlock` hits `album.protected` on `null` → TypeError.
- **Files:** `curate/index.html`
- **Done when:** Both branches early-return; visiting `/curate/` with a bad id shows the error cleanly, no console error.

#### BUG-2 — Group page unguarded `subAlbums` access
- **Effort:** S · **Risk:** Low · **Status:** TODO
- **Why:** Uses `group.subAlbums?.length` in one spot but unguarded `group.subAlbums.map(...)` at ~line 193 → throws for a group with no subAlbums.
- **Files:** `group/index.html`
- **Done when:** Access is null-safe; a group without subAlbums renders without throwing.

#### BUG-3 — `athena-manifest.py --upload-lists` only writes last batch
- **Effort:** S · **Risk:** Low · **Status:** TODO
- **Why:** Indentation bug (~lines 182–190): the `with open(...)` write sits outside the `for prefix, batch` loop, so only the final batch is written.
- **Files:** `scripts/lib/athena-manifest.py`
- **Done when:** Every batch file is written; verify by running the mode.

### Accessibility

#### A11Y-1 — Lightbox focus management & ARIA
- **Effort:** M · **Risk:** Low–Med · **Status:** TODO
- **Why:** No focus trap or focus-restore on close (Tab reaches content behind overlay). Curate lightbox lacks `role="dialog"`/`aria-modal` and an `aria-label` on the `✕` close button.
- **Files:** `album/index.html`, `curate/index.html`, `js/main.js` (mobile menu also lacks focus trap)
- **Done when:** Lightbox traps focus, restores focus on close, has proper dialog roles/labels.

#### A11Y-2 — Improve image alt text in lightboxes/curate grid
- **Effort:** S · **Risk:** Low · **Status:** TODO
- **Why:** Album lightbox uses generic `alt="Photo"`; curate grid/lightbox use `alt=""`. Weak for screen readers.
- **Files:** `album/index.html`, `curate/index.html`
- **Done when:** Alt text reflects album/position (e.g. "Venice — photo 12").

### Maintainability (reduce duplication)

#### MNT-1 — Extract shared password gate
- **Effort:** M · **Risk:** Med · **Status:** TODO
- **Why:** Password gating is implemented 4× (album, group, curate, curate/group). Album vs group are near-identical (~55 lines): hash → unlock → shake → error.
- **Files:** new `js/password-gate.js`; `album/index.html`, `group/index.html` (consume it)
- **Done when:** Both pages use one module; unlocking still works + shake animation on wrong password.
- **Related:** feeds into AUTH-1 (if we add real auth, this becomes the client UX layer on top of it).

#### MNT-2 — Drop curate's re-implemented utilities
- **Effort:** S–M · **Risk:** Med · **Status:** TODO
- **Why:** `curate/index.html` and `curate/group/index.html` redefine `hashPassword`, `gridUrl`, and a partial `ImagePreload` that already exist in `js/main.js` (~73 lines duplicated).
- **Files:** `curate/index.html`, `curate/group/index.html` (load `main.js` or a slim shared module instead)
- **Done when:** No duplicate definitions; curate voting + lightbox still work.

#### MNT-3 — Extract shared lightbox core
- **Effort:** L · **Risk:** Med · **Status:** TODO
- **Why:** Lightbox double-buffer/open/close/nav logic is duplicated between album and curate (~100–130 lines). Album also lacks a generation-token guard in curate's version (stale-frame risk).
- **Files:** new `js/lightbox.js`; `album/index.html`, `curate/index.html` extend it
- **Done when:** Shared core powers both; album keeps EXIF/ZIP/scroll-lock extras; no stale-frame flashes.

#### MNT-4 — Split the 2,192-line `album/index.html`
- **Effort:** L · **Risk:** High · **Status:** TODO
- **Why:** ~1,678 lines of inline JS in one file (lightbox, ZIP, selection mode, sticky toolbar, section nav, justified layout, EXIF). Hardest file to change safely. Depends on / overlaps MNT-1, MNT-3.
- **Files:** `album/index.html` → `js/album-page.js` (+ sub-modules)
- **Done when:** Album logic in external modules; album page behaves identically. Do MNT-1/2/3 first.

#### MNT-5 — Tame the 1,447-line hand-edited `config.js`
- **Effort:** L · **Risk:** Med · **Status:** TODO
- **Why:** Grows painful as albums are added; easy to introduce syntax errors by hand.
- **Options:** generate `config.js` from small per-album manifests, or split into per-album files imported together.
- **Files:** `js/config.js`, possibly new `scripts/`
- **Done when:** Adding an album doesn't require editing one giant file by hand.
- **Related:** a manifest-based config would also make AUTH-1's authenticated album manifests much easier.

### Styling (biggest performance lever)

#### STY-2 — Purge dead CSS in `style.css`
- **Effort:** S–M · **Risk:** Low · **Status:** TODO
- **Why:** ~50–80 lines confirmed dead, mostly from removed Contact/About variants.
- **Known-dead selectors:** `.contact-success` (+`.show`), `.about-photo-wrap` (+`::after`), `.skeleton` (+`@keyframes shimmer`), `.text-gold`, `.sr-only`, `textarea.form-field`; stale "contact" comment ~line 1788.
- **Files:** `css/style.css`
- **Done when:** Dead selectors removed; visual diff shows no change.

#### STY-3 — Consolidate inline CSS into stylesheets
- **Effort:** L · **Risk:** Med · **Status:** TODO
- **Why:** ~1,170 lines of inline `<style>` across pages (224 at the **bottom** of `album/index.html`, 303 in `admin/`). `admin`/`album` redefine `.photo-grid`/`.photo-thumb` instead of reusing shared classes. Hard to find/change styles.
- **Files:** `album/index.html`, `admin/index.html`, `curate/*`, `about/index.html` → `css/style.css` or per-page CSS files
- **Done when:** Page-specific CSS lives in stylesheets; shared classes reused, not redefined.

### Ops & housekeeping

#### OPS-1 — Label or archive stale scripts
- **Effort:** S · **Risk:** Low · **Status:** TODO
- **Why:** `dev-server.py` (orphaned; skill prescribes `vercel dev` on 8080, this defaults to 4000), `test-header-scroll.mjs` (Puppeteer probe, but Puppeteer not in `package.json`), `build-italy-film-rolls.py` (one-off) aren't part of the documented workflow.
- **Files:** `scripts/` + `README.md`
- **Done when:** Each is either removed or clearly labeled "one-off/debug" in the README.

#### OPS-2 — Parameterize hardcoded Italy path
- **Effort:** S · **Risk:** Low · **Status:** TODO
- **Why:** `scripts/lib/athena-manifest.py` (~lines 10–13) hardcodes `/Volumes/PhotosSSD/.../Italy`. Non-portable beyond this trip/machine.
- **Files:** `scripts/lib/athena-manifest.py`, `scripts/athena-manifest.sh`
- **Done when:** Path is a CLI arg / env var with the current value as default.

#### OPS-3 — Commit-ignore Python caches
- **Effort:** S · **Risk:** Low · **Status:** TODO
- **Why:** `scripts/__pycache__/` and `scripts/lib/__pycache__/` show as untracked.
- **Files:** `.gitignore`
- **Done when:** `__pycache__/` is gitignored; `git status` is clean.

#### OPS-4 — Unified end-to-end "add album" script (stop doing it bespoke)
- **Effort:** L · **Risk:** Med · **Status:** TODO
- **Why:** Adding an album is an 11-step manual pipeline (see `.cursor/skills/add-portfolio-album/SKILL.md` + README "Adding a new album"): generate 1200px grids (`sips`), upload originals + grids with retry/backoff and rate-limit sleeps, verify against the R2 manifest, retry missing files, hash the password, hand-insert the album object into the 1,447-line `config.js`, then commit. It's reassembled semi-bespoke every time — slow and easy to get wrong.
- **Fix:** One parameterized script (e.g. `scripts/add-album.sh`) that takes: local folder path, album name/slug, type (public / protected / hidden), and all-vs-starred. It then runs the whole flow end-to-end: grid gen → upload originals → upload grids → verify manifest → auto-retry missing → optional password hash → emit (or insert) the `config.js` album block. Reuse `upload_with_retry` + the documented rate-limit rules; keep the agent skill as the friendly wrapper that calls it.
- **Consider:** pair with MNT-5 (manifest-based config) so the script writes a small per-album manifest instead of hand-editing the giant `config.js`.
- **Files:** new `scripts/add-album.sh` (build on `scripts/upload-album.sh` + `scripts/lib/r2-upload-lib.sh`), `.cursor/skills/add-portfolio-album/SKILL.md` (point at it), `README.md` (document it)
- **Done when:** Adding an album is a single command (plus confirmations) that uploads, verifies, and produces the config entry; the skill + README reference it; no bespoke per-album shell assembly.
- **Related:** MNT-5 (config generation), OPS-2 (path parameterization), `add-portfolio-album` skill.

### Admin & tooling

#### ADMIN-1 — Drag-and-drop photo reorder in `/admin`
- **Effort:** M–L · **Risk:** Med · **Status:** TODO
- **Why:** Album/gallery order is set by hand-editing photo arrays in `config.js` — tedious and easy to break. A reorder UI in the existing admin panel would remove the manual editing.
- **Fix (phased):**
  - **Phase 1:** Venice digital only — a reorder mode on the admin grid + a **Save order** button + a new `/api/admin-reorder` endpoint that mirrors `api/admin-delete.js` (GitHub API updates `config.js`, Vercel redeploys).
  - **Phase 2:** other albums + separate reorder controls per section (`photos` vs each `filmSections` roll — Venice has digital + multiple film rolls).
- **Files:** `admin/index.html`, new `api/admin-reorder.js` (mirror `api/admin-delete.js`), `js/config.js` (written via GitHub API)
- **Done when:** You can reorder photos in `/admin` and save; `config.js` updates via GitHub; the redeploy reflects the new order — no hand-editing arrays.
- **Moved from:** README `## TODO → Nice to have` (July 2026).

---

## Ideas / larger initiatives (not yet scoped into tickets)

These are bigger than a single ticket — capture the intent now, scope into tickets later.

### AUTH-1 — Per-user logins & truly private albums
- **Effort:** XL · **Risk:** High · **Status:** ✅ DONE (Jul 2026)
- **Chosen approach:** group-password tiers + D1-backed access codes. Signed HMAC tokens for private R2 serving (no DNS move — Porkbun nameservers kept).
- **Shipped (Phase 1–2, Jul 2026, branch `feat/curated-tiers-phase1-2`):**
  - `audience` tags on every album (`public` / `friends` / `family` / `client:<name>`)
  - `PASSWORD_TIERS` map in `js/config.js` with SHA-256 hashes (friends: `rf-pix-2026`, family: `rf-family-pw`)
  - `TierAuth` in `js/main.js` — sessionStorage + optional localStorage persistence
  - `/unlock/` page + "Unlock" nav link on all pages; `?next=` redirect for album deep-links
  - Gallery shows Family section when family tier is unlocked (Joel Birthday 2025 test case)
  - Admin auth hardened: removed public `adminPasswordHash` from `config.js`; `api/admin-login.js` issues signed HttpOnly 24h session cookie; admin APIs verify session cookie
  - Admin "Save as curated set" button + `api/admin-curate.js` writes `curated[]` to config.js via GitHub
  - Curated-vs-full rendering: public visitors see curated subset + unlock banner; unlocked viewers see full album
  - Removed keep/cut Supabase voting flow (curate/ pages, Supabase client, Routes.curate)
  - Phase 2b: D1 favorites table + inline heart toggle + admin tally tab; Worker deployed with D1
- **Shipped (Phase 3 + 3b, Jul 2026, branch `feat/phase3-private-r2`):**
  - Private R2 bucket `portfolio-images-private` — no public access
  - Worker `POST /unlock`: validates hash (env secrets + D1 `access_codes`) → returns 4h HMAC token
  - Worker `GET /image?key&token`: verifies token + tier → streams from private bucket
  - `TierAuth.getHash()`: stores hash on unlock so album page can silently refresh tokens
  - `album/index.html`: fetches token for family/client albums, rewrites photo URLs to Worker-proxied endpoints
  - Joel Birthday 2025 (74 photos) migrated from public → private bucket
  - D1 `access_codes` table: create/list/revoke codes without config edits or wrangler per client
  - Admin "Access codes" tab: create code (shown once), revoke; `api/admin-access-codes.js` proxy
- **Env vars (all set):** `SESSION_SECRET`, `ADMIN_PASSWORD_HASH`, `GITHUB_TOKEN`, `GITHUB_REPO`, `WORKER_ADMIN_SECRET` in Vercel + `.env.local`
- **Status before these phases:** IDEA (needs a decision + scoping)
- **Goal:** Two-tier viewing:
  - **Public, curated albums** for everyone (e.g. "10 best from each city") — no login.
  - **Full / private albums** visible only to people you authorize, controlled by group
    (e.g. *family* can see niece/nephew albums; *friends* can't).
- **The blocker (see NOTE-1):** today's album "passwords" are **not real privacy**. All photo
  URLs + password hashes ship in `js/config.js`, and the R2 bucket is **public** — anyone
  who reads config or guesses a URL can fetch the images. Real privacy needs **server-side
  enforcement + private storage**, not just a login bolted onto the client-side gate.
- **So the work is two parts:** (1) an identity/login layer, and (2) making private albums +
  their images actually private (private bucket, served only to authorized people).

- **Recommended approach — Option 2: Cloudflare Access** (we're already on Cloudflare):
  - **Access** is the login layer (free up to 50 users). You add people's **emails**; they log
    in with a one-time email code or Google — no passwords for you to manage.
  - Move private albums + their images **behind your domain**, served by a **Worker** reading
    from a **private R2 bucket**, with Access sitting in front.
  - **User groups** = Access Groups (define once): `Family`, `Friends`, etc.
  - **Album→group mapping** = a few **audience tiers by path**, each an Access Application with
    a policy naming allowed groups:
    - `/private/family/*` → allow `Family`
    - `/private/friends/*` → allow `Family`, `Friends`
  - Optional: keep an `audience` field per album in `config.js` + a build step that drops each
    album under the right `/private/<audience>/` path, so "who sees this album" = one field.
  - **Onboarding a new person:** add their email to a group → send the link → they log in via
    one-time PIN or Google (once per device; session lasts as long as you configure).
  - **Management difficulty:** user-group membership = trivial (edit an email list). Album→group
    = easy with a handful of tiers. Per-*individual*, per-album bespoke access = a matrix that
    gets clunky in Access → that's when Option 3 wins.

- **Alternatives considered:**
  - **Option 1 — per-person passwords, still client-side:** quick, but same leak as today; **not**
    real privacy. Fine only for "keep it off the homepage," not for sensitive photos.
  - **Option 3 — custom accounts + database:** own login (email+password / magic link), a
    users↔albums ACL in Cloudflare D1/KV, Worker checks session + serves from private R2, plus
    an admin UI to tick which albums each person sees. Most flexible (per individual), most work,
    you own auth/password-resets/security.

- **Open questions to answer before scoping into tickets:**
  - Group-based (family/friends buckets) or per-individual access? How many audience tiers?
  - Roughly how many viewers? (<10 / 10–50 / 50+ — affects Access free tier & approach.)
  - Confirm the public "best of" split (see FEAT-1) as the companion public tier.
- **Related:** NOTE-1 (the limitation this fixes), MNT-1 (password-gate module becomes the
  client UX layer), MNT-5 (manifest-based config makes authenticated album manifests easier).

### FEAT-3 — Robust select & download workflow
- **Effort:** L · **Risk:** Med · **Status:** TODO
- **Why:** The original select-to-download feature (select individual photos → download as ZIP) was
  temporarily removed because the selection heart badge was visually identical to the favorites
  heart badge, causing confusion for friends trying to vote on photos.
- **Fix:** Design distinct, clearly separated affordances for (a) hearting/voting and (b) selecting
  for download. Consider: different icons (heart for vote, checkbox or plus for download), different
  positions on the thumbnail, or a dedicated download mode that's visually distinct from the
  curation mode. The JS logic is preserved in `album/index.html` behind a CSS `display:none` block
  — search for "FEAT-3" to find it. Re-enable and restyle once the design is settled.
- **Files:** `album/index.html` (select-mode CSS block, `setupSelectModeControls`, `toggleThumb`,
  `downloadPhotos`, `downloadSelected`, `photo-thumb-like`)
- **Done when:** Friends can clearly tell "heart this photo" from "add to my download list" at a
  glance; both flows work on mobile and desktop without ambiguity.

### UX-HEARTS — Differentiate favorites heart from selection indicator
- **Effort:** S · **Risk:** Low · **Status:** TODO (blocked on FEAT-3 design)
- **Why:** `.fav-badge` and `.photo-thumb-like` are both heart-shaped icons at the bottom-right of
  a thumbnail. When both are visible (full album + select mode) friends can't tell them apart.
- **Fix:** Part of FEAT-3 — agree on distinct icons/positions before re-enabling selection.

---

### FEAT-1 — Public "best of" curated albums
- **Effort:** M–L · **Risk:** Med · **Status:** ✅ DONE (Jul 2026, curated picker shipped, placeholder sets on all albums)
- **Why:** The public-facing companion to AUTH-1: a tight, curated set (e.g. top ~10 per city)
  that everyone can see, with the full-resolution / full-count albums reserved for logged-in
  viewers. Also makes the homepage/gallery more focused.
- **Sketch:** a `curated`/`featured` flag or a separate curated photo list per album; gallery +
  home show the curated set publicly, full set lives behind AUTH-1's private tier. The existing
  `/curate/` voting tooling may help pick the "best of."
- **Depends on / pairs with:** AUTH-1.

---

## Known limitations

### NOTE-1 — Album passwords are client-side only
- **Status:** ACKNOWLEDGED (by design, for now — superseded if AUTH-1 ships)
- Hashes live in `config.js` and photos are plain public R2 URLs — anyone reading `config.js` can
  fetch images directly. Fine for casual gating, **not** real privacy. True privacy would require
  signed URLs or an auth-gated proxy (see AUTH-1). No real API tokens are committed (those are
  Vercel env vars).

---

## Changelog (Done)

- **PERF-1 Phases 5–6 + upload-album tiers** — Aug 2026.
  On `feat/perf1-download-and-upload-tiers`: ZIP/Download All size picker (Low/Med/Full), private ZIP via unlock token + `PRIVATE_BUCKET`, and `upload-album.sh` emits 900px `grid/` + 2048px `view/`. Awaiting merge to `main` and Worker redeploy for Phase 6.

- **PERF-1 Phases 1–2 + lightbox layout — shipped** — Aug 2026.
  Merged to `main` (`48495fc`): restored `view/` lightbox path, Worker `view/<client>/` ACL, no eager original blob prefetch, lightbox size/centering fix. Deployed Worker `portfolio-zip-download` version `7b5b3de5-51ce-4fea-8b09-a1170515c2d7`. Public + private albums now serve mid-res in the lightbox; Phases 5–6 still open.

- **Lightbox — no resize or re-centre when the sharper tier loads** — Aug 2026.
  `.lightbox-layer` only had `max-width`/`max-height`, so the `grid/` preview painted at its intrinsic size and grew when `view/` arrived, and `.lightbox-shell` top-aligned it. Layer height is now pinned to `--lb-avail` above the 768px breakpoint (phones are width-bound and already filled the frame) and the shell centres vertically. Verified at 393×852, 800×600, 1440×420, 1440×900 and 2560×1080: size is identical before and after the upgrade, captions still hug the photo. Shipped on `main` (`48495fc`).

- **PERF-1 — Phase 1 restored, Phase 2 cherry-picked** — Aug 2026.
  Re-applied the `view/` tier lightbox logic that merge `028c108` reverted (`_viewMissingPrefixes`, `_viewAlbumPrefix()`, the grid → `view/` upgrade, `view/` prefetching), removed the eager `prefetchDownloadBlob` calls in `openLightbox` *and* `lightboxNav` so originals are only fetched on download intent, deleted the now-dead `ImagePreload.showProgressive`, and brought the `view/<client>/` Worker ACL over from `feat/download-size-picker`. Verified headless on Venice: 255 MB → 5.2 MB for one open plus three nav steps, no raw originals, no JS errors. Merged to `main`; Worker deployed.

- **Album — Moksha Yoga, renumber 15b → sequential 01–51** — Jul 2026.
  Renamed `Moksha-Yoga-15b` → `16` and shifted former `16`–`50` → `17`–`51` so the album uses clean `01`–`51` filenames. Local + private R2 complete (original / `grid/` / `view/` for `16`–`51`); orphaned `15b` objects deleted. Config updated in `js/albums/clients.js`. Shipped on `main` (`1cbdeaa`).

- **Album — Moksha Yoga, added missed photo** — Jul 2026.
  One export missed in the original drop (local `Moksha-Yoga-53.jpg`) uploaded to `portfolio-images-private` as `Moksha-Yoga-15b.jpg` across all three tiers (original, `grid/`, `view/`) and slotted directly after `Moksha-Yoga-15.jpg` in `js/albums/clients.js`. Album is now 51 photos. Shipped on `main` (`0a35d49`); no new access code needed.

- **PERF-1 — Image tier infrastructure (Phases 1–3, 6)** — Jul 2026.
  Frontend stops serving originals in the lightbox; `viewUrl()` + 404 fallback added (`perf/lightbox-image-tiers`). Worker ACL extended for `view/<client>/` keys; ZIP Worker gains token-gated `PRIVATE_BUCKET` support (`feat/download-size-picker`). `scripts/backfill-image-tiers.sh` written for resumable view/ + grid/ derivation (`feat/backfill-image-tiers`). Deploy, backfill run, and download chooser (Phase 4, 5) pending.
  **Correction (Aug 2026):** only Phase 3 actually reached `main`. Phase 1 was reverted by merge `028c108`; Phases 2 and 6 never left `feat/download-size-picker`. See the PERF-1 regression note.

- **Client album navigation and grid controls** — Jul 2026.
  Unlocked clients retain a `Client Gallery` return link across the site, Sign out stays rightmost, and Moksha Yoga grid hearts are hidden. Shipped on `main` (`7a18855`).

- **Album — Moksha Yoga (client drop)** — Jul 2026.
  Hidden `client:moksha-yoga` album (50 photos) on private R2; shipped on `main` (`c0ae2cf`). Access code created via Worker D1 (shown once to operator).

- **Album shell — Moksha Yoga (client)** — Jul 2026.
  Hidden `client:moksha-yoga` album shell in `js/albums/clients.js`; queued for private R2 upload when exports are ready. No deploy/access code yet.

- **Albums — April family (MD + MI)** — Jul 2026.
  Visiting Elena in MD (50× 1★) + Ali's in Michigan (70× all) on `main`; R2 originals + grids complete. MI had one `fetch failed` on `20250413-_DSF3189.jpg` (manual retry OK).

- **Site — Link preview meta** — Jul 2026.
  Homepage Open Graph tags + hero image; title `Raveen Fernando` (fixes iMessage "Photography" label). Push: `26dea8f`.

- **AUTH — Single family tier** — Jul 2026.
  Removed `family:fernando` / `family:anger-ali` sub-groups; one `family` audience + password `fernando-family`. Worker `FAMILY_HASH` updated; all family albums use `audience: 'family'`.

- **Runbook — Active album session board** — Jul 2026.
  Added living tracker for multi-album R2 work (in progress / queued / done); Fernando Family batch + April/Michigan queue documented.

- **Albums — Fernando Family (R2 complete)** — Jul 2026.
  Elena's Birthday (57× 3★) + Thanksgiving (82× 2★) on `main`; private R2 originals + grids complete. Push: `c5801fb`.

- **Album — Misc Film Rolls 2026** — Jul 2026.
  Public group + Ultramax/T-Max sub-albums; reordered first in 2026 gallery section. Push: `2b590d8`.

- **FEAT — In-page full album toggle (replaces keyed hub)** — Jul 2026.
  Removed gated `/fullalbums/?k=` hub and "Full Album" nav. Album pages default to curated set; public "See full album" / "See favorites" toggle (top + bottom) expands in place with `?full=1`. Full view enables anonymous heart voting + instructional note for all visitors. Old `/fullalbums/` URLs redirect to `/gallery/`.

- **FEAT-2 — Full-album friends curation flow** — Jul 2026.
  New `/fullalbums/` URL namespace for the uncut album (distinct gold-accent theme, "FULL ALBUM" badge). Shareable capability link `?k=KEY` grants the `friends` tier — key stays in the URL, is bookmarkable, no typed password. Randos on `/gallery/` only see the curated highlights; `/fullalbums/` without a valid key redirects to `/gallery/`. Cross-links: full-album page → "View public gallery"; curated page → "Open full album" (visible only to granted friends). "All albums" nav hub at `/fullalbums/` lists every non-private album for friends. Favorites hearts now enabled on ALL grids (digital + film) in full mode via a document-level delegated handler, fixing the missing-hearts-on-film bug. Old typed friends password removed; key-only access. Branch: `feat/curated-gallery-friends-links`.
  **Store in 1Password:** plaintext share key `4289e2622ffb284c65c101210c81a389d8bdbfc053e3b822` under "photography portfolio share key".
  **Links to send friends:** hub `raveenfernando.com/fullalbums/?k=4289e2622ffb284c65c101210c81a389d8bdbfc053e3b822` · specific album e.g. `raveenfernando.com/fullalbums/italy-2026/venice/?k=4289e2622ffb284c65c101210c81a389d8bdbfc053e3b822`.

- **AUTH-1 + FEAT-1 Phases 3 + 3b — Private R2 + access codes** — Jul 2026.
  Private R2 bucket; Worker signed HMAC token system (`/unlock`, `/image`); Joel Birthday photos migrated; D1 `access_codes` table; admin "Access codes" tab (create/show-once/revoke); no wrangler or config edit per new client. Branch: `feat/phase3-private-r2`.

- **AUTH-1 + FEAT-1 Phases 1–2 — Group password tiers + curated albums** — Jul 2026.
  Audience tags on all albums; `PASSWORD_TIERS` map; `TierAuth` store; `/unlock/` page + nav link;
  gallery family section; admin session auth (HttpOnly cookie, public hash removed);
  admin "Save as curated set" + `api/admin-curate.js`; curated-vs-full album rendering with unlock
  banner; keep/cut Supabase flow removed. Branch: `feat/curated-tiers-phase1-2`.
  **Next:** add `SESSION_SECRET` Vercel env var; run admin curated picker for each city album.

- **UX-8 — Sibling city-album switcher in the album header** — June 2026. From a city album you
  can jump straight to any sibling city from the header (active city indicated); works desktop +
  mobile; folds into the mobile Navigate menu; locked groups aren't exposed. Later refined:
  squared editorial chips, wider tracking, ISO-condensed film labels.
- **UX-1…UX-7 — Album & group header UX pass** — June 2026 (compact one-row mobile header,
  sticky toolbar, section nav, spacing). Removed after shipping.
