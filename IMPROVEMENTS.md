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

---

## Status board

| Ticket | Area | Effort | Risk | Status |
|--------|------|--------|------|--------|
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
| AUTH-1 | Idea (big) | XL | High | IN PROGRESS |
| FEAT-1 | Idea | M–L | Med | IN PROGRESS |
| UX-8 | Header UX | M | Med | ✅ DONE |

### Where to start next
1. **Quick wins:** Tier bugs BUG-1…BUG-3 + A11Y-1/A11Y-2 (small, isolated, low risk).
2. **Maintainability**, when next touching album code: MNT-1 → MNT-2 → MNT-3 → MNT-4.
3. **Housekeeping** anytime: OPS-1 → OPS-2 → OPS-3.
4. **Styling:** STY-2 → STY-3.
5. **Big bet:** AUTH-1 Phase 1–2 shipped (group password tiers, client-side gating). Phase 3 (real privacy, private R2 bucket + Worker cookie) is next — see AUTH-1 ticket.

---

## Tickets

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
- **Effort:** XL · **Risk:** High · **Status:** IN PROGRESS
- **Chosen approach:** group-password tiers. D1 (client-side) for friends/city albums; D2 (server-enforced cookie + private R2 bucket) for family/kids/clients.
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
- **Pending (Phase 2b):** D1 favorites table + inline heart toggle + admin tally (replaces Supabase)
- **Pending (Phase 3):** Private R2 bucket; Worker cookie-based image/ZIP serving; /unlock Worker endpoint; access-codes D1 table + admin CRUD
- **Env var to add to Vercel + `.env.local`:** `SESSION_SECRET` — run `openssl rand -hex 32`
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

### FEAT-1 — Public "best of" curated albums
- **Effort:** M–L · **Risk:** Med · **Status:** IN PROGRESS (Phase 1 shipped, curated picker shipped)
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
