# Photography Portfolio — Runbook & Backlog

Living runbook for `raveenfernando.com`. **Start at [Open tickets](#open-tickets)** —
pick an ID and tell the agent e.g. *"do ticket OPS-5"*.

Each open ticket below has **Why / Fix / Files / Done when**. When it ships: mark it
done, move it out of Open, add a Changelog line.

---

## Open tickets

*Only unfinished work. Sorted by what to do next.*

### 1 — Decide / verify first
| ID | One-liner | Effort |
|----|-----------|--------|
| **OPS-5** | Confirm Worker redeploy so private/family ZIP downloads work in prod | S |

### 2 — Quick wins
| ID | One-liner | Effort |
|----|-----------|--------|
| **BUG-2** | Null-safe `subAlbums` on group page | S |
| **BUG-3** | Fix athena-manifest `--upload-lists` writing only last batch | S |
| **A11Y-2** | Better lightbox alt text (`Album — photo N`) | S |
| **OPS-7** | Delete stale feature branches | S |

### 3 — Content & ops
| ID | One-liner | Effort |
|----|-----------|--------|
| **ALBUM-1** | London 2025 shell: upload it or delete the empty entry | M |
| **OPS-6** | D1 backup/restore for access codes + favorites | M |
| **OPS-1** | Label or archive stale scripts | S |
| **OPS-2** | Parameterize hardcoded Italy path in athena-manifest | S |

### 4 — Product
| ID | One-liner | Effort | Notes |
|----|-----------|--------|-------|
| **FEAT-3** | Re-enable select-to-download with clear UX | L | |
| **FEAT-4** | Roll out Large (~5 MB) download tier | M | Worker `d5993742…` live; frontend commit/push pending |
| **UX-HEARTS** | Distinct icons for heart vs select | S | Blocked on FEAT-3 |
| **ADMIN-1** | Drag-and-drop reorder in `/admin` | M–L | |

### 5 — Code health (when touching album code)
| ID | One-liner | Effort | Notes |
|----|-----------|--------|-------|
| **MNT-1** | Shared password-gate module (album + group) | M | |
| **MNT-3** | Extract lightbox core from album page | L | |
| **MNT-4** | Split ~3,100-line `album/index.html` | L | After MNT-1/3 |
| **MNT-5** | Automate album `<script>` registration across pages | M | Split already done |
| **OPS-4** | One-command add-album script | L | Pairs with MNT-5 |
| **A11Y-1** | Lightbox focus trap + ARIA | M | |
| **STY-2** | Purge dead CSS | S–M | |
| **STY-3** | Move inline CSS into stylesheets | L | |

---

## Active album session

| State | Album | Notes |
|-------|-------|-------|
| Queued | **London 2025** | Empty hidden shell — **ALBUM-1** |
| In progress | **Morgan and Alden** | Unlisted public group (digital + film); public R2 |
| Done recently | Moksha Yoga (+ renumber) | Private R2 + D1 access code |

Album workflow: **add-portfolio-album** skill. Update this table when queueing/shipping.

---

## How to work here

- Local: **dev-server** skill, or `vercel dev --listen 8080`
- Config: `js/config.js` (site + passwords); albums in `js/albums/*.js`
- Images: R2 public + private; ZIP via Cloudflare Worker
- Branch per ticket · commit per step · **push `main` only when asked** · never deploy/upload externally without approval
- Effort: S minutes · M ~hour · L half-day+

---

## Ticket details (open)

Jump here after picking an ID from Open tickets.

### OPS-5 — Confirm Worker Phase 6 deploy (private ZIP)
- **Effort:** S · **Risk:** Med · **Status:** TODO
- **Why:** Phase 6 code is on `main`; last documented Worker deploy was Phases 1–2. Family/client ZIP may fail until redeployed.
- **Fix:** Redeploy Worker (with approval), smoke-test ZIP on a family album + Moksha at Low/Med/Full while unlocked.
- **Files:** `workers/zip-download/`
- **Done when:** Private ZIP works in prod; Changelog has Worker version id.

### BUG-2 — Group page unguarded `subAlbums`
- **Effort:** S · **Risk:** Low · **Status:** TODO
- **Why:** `group.subAlbums.map(...)` (~line 218) throws if `subAlbums` missing.
- **Files:** `group/index.html`
- **Done when:** Null-safe; empty group renders without throw.

### BUG-3 — athena-manifest `--upload-lists` last batch only
- **Effort:** S · **Risk:** Low · **Status:** TODO
- **Why:** `with open(...)` is outside the `for` loop (~182–190) — only last batch written.
- **Files:** `scripts/lib/athena-manifest.py`
- **Done when:** Every batch file written; mode verified.

### A11Y-2 — Lightbox alt text
- **Effort:** S · **Risk:** Low · **Status:** TODO
- **Why:** Generic `alt="Photo"`.
- **Files:** `album/index.html`
- **Done when:** Alt like "Venice — photo 12".

### OPS-7 — Clean up stale feature branches
- **Effort:** S · **Risk:** Low · **Status:** TODO
- **Why:** Old branches (`feat/download-size-picker`, `feat/backfill-image-tiers`, `feat/family-groups`, …) confuse merges.
- **Fix:** Confirm merged/abandoned → delete local + remote (remote needs approval).
- **Done when:** Only active branches remain; list in Changelog.

### ALBUM-1 — London 2025 shell
- **Effort:** M · **Risk:** Low · **Status:** TODO
- **Why:** `london-2025` in `js/albums/california-2025.js` is hidden with `photos: []`.
- **Options:** Upload via add-portfolio-album skill, or delete the shell.
- **Files:** `js/albums/california-2025.js` (+ R2 if uploading)
- **Done when:** Real album shipped/queued, or shell removed.

### OPS-6 — D1 backup / restore
- **Effort:** M · **Risk:** Med · **Status:** TODO
- **Why:** Access codes + favorites in D1; no backup/restore runbook.
- **Fix:** Document/automate `wrangler d1 export`; store backups; write restore steps.
- **Files:** README/ADMIN/docs + optional `scripts/backup-d1.sh`
- **Done when:** Backup run once; restore steps written.

### OPS-1 — Label or archive stale scripts
- **Effort:** S · **Risk:** Low · **Status:** TODO
- **Why:** `dev-server.py`, `test-header-scroll.mjs`, `build-italy-film-rolls.py` aren't in the documented workflow.
- **Files:** `scripts/` + `README.md`
- **Done when:** Removed or labeled one-off/debug.

### OPS-2 — Parameterize Italy path
- **Effort:** S · **Risk:** Low · **Status:** TODO
- **Why:** Hardcoded `/Volumes/PhotosSSD/.../Italy` in athena-manifest.
- **Files:** `scripts/lib/athena-manifest.py`, `scripts/athena-manifest.sh`
- **Done when:** CLI arg / env var; current path as default.

### FEAT-3 — Select & download workflow
- **Effort:** L · **Risk:** Med · **Status:** TODO
- **Why:** Select-to-ZIP hidden because selection hearts looked like favorite hearts.
- **Fix:** Distinct select vs heart UX; re-enable CSS-hidden select mode (search `FEAT-3` in `album/index.html`). Size picker already exists.
- **Files:** `album/index.html`
- **Done when:** Heart vs select are obvious on mobile + desktop; both work.
- **Related:** UX-HEARTS.

### FEAT-4 — Large (~5 MB) download tier
- **Effort:** M · **Risk:** Med · **Status:** WORKER LIVE / FRONTEND PENDING
- **Why:** Existing choices jump from Med (~1.5 MB) to Full (15–40 MB).
- **Implementation:** `download/<key>` at 4000px q88 (4.99 MB on the calibration sample); frontend fourth option; Worker private ACL; upload/backfill/resume support.
- **Files:** `album/index.html`, `js/main.js`, `scripts/`, `workers/zip-download/`, upload docs/skill.
- **Remaining:** Commit and publish the frontend, then smoke-test Low/Med/Large/Full on a public and a private album.
- **Done when:** Low/Med/Large/Full work for single and ZIP downloads on public, family, and client albums.

### UX-HEARTS — Distinct heart vs selection icons
- **Effort:** S · **Risk:** Low · **Status:** TODO (blocked on FEAT-3)
- **Why:** `.fav-badge` and `.photo-thumb-like` are both hearts at bottom-right.
- **Fix:** Part of FEAT-3 design.

### ADMIN-1 — Drag-and-drop reorder in `/admin`
- **Effort:** M–L · **Risk:** Med · **Status:** TODO
- **Why:** Photo order = hand-edit `js/albums/*.js`.
- **Fix:** Phase 1 Venice digital + `/api/admin-reorder` (GitHub API updates album shard). Phase 2 other albums / film sections.
- **Files:** `admin/index.html`, new `api/admin-reorder.js`, `js/albums/*.js`
- **Done when:** Reorder in admin → save → redeploy reflects order.

### MNT-1 — Shared password gate
- **Effort:** M · **Risk:** Med · **Status:** TODO
- **Why:** Album + group duplicate ~55 lines of unlock UI.
- **Files:** new `js/password-gate.js`; `album/index.html`, `group/index.html`
- **Done when:** One module; unlock + shake still work.

### MNT-3 — Extract lightbox core
- **Effort:** L · **Risk:** Med · **Status:** TODO
- **Why:** Lightbox logic buried in album page; needed before/with MNT-4.
- **Files:** new `js/lightbox.js`; `album/index.html`
- **Done when:** Core extracted; EXIF/ZIP extras stay on album; no stale-frame flashes.

### MNT-4 — Split `album/index.html` (~3,100 lines)
- **Effort:** L · **Risk:** High · **Status:** TODO
- **Why:** Hardest file to change safely.
- **Files:** → `js/album-page.js` (+ modules)
- **Done when:** Behavior identical. Do MNT-1/3 first.

### MNT-5 — Automate album script registration
- **Effort:** M · **Risk:** Med · **Status:** PARTIAL
- **Why:** Albums already split into `js/albums/*.js`. Still must wire `<script>` tags on ~8 HTML pages.
- **Done when:** New album doesn't require hand-editing every page.
- **Related:** OPS-4.

### OPS-4 — One-command add-album script
- **Effort:** L · **Risk:** Med · **Status:** TODO
- **Why:** Multi-step manual pipeline every album.
- **Fix:** `scripts/add-album.sh` on top of `upload-album.sh`; skill wraps it.
- **Done when:** One command uploads, verifies, emits config entry.
- **Related:** MNT-5, OPS-2.

### A11Y-1 — Lightbox focus trap + ARIA
- **Effort:** M · **Risk:** Low–Med · **Status:** TODO
- **Why:** Tab escapes overlay; missing dialog roles/labels; mobile menu no trap.
- **Files:** `album/index.html`, `js/main.js`
- **Done when:** Focus trapped + restored; proper dialog semantics.

### STY-2 — Purge dead CSS
- **Effort:** S–M · **Risk:** Low · **Status:** TODO
- **Why:** ~50–80 dead selectors (old Contact/About).
- **Files:** `css/style.css`
- **Done when:** Dead rules gone; no visual change.

### STY-3 — Inline CSS → stylesheets
- **Effort:** L · **Risk:** Med · **Status:** TODO
- **Why:** Large `<style>` blocks in album/admin; duplicated grid classes.
- **Files:** `album/index.html`, `admin/index.html`, `about/index.html` → CSS files
- **Done when:** Page CSS in stylesheets; shared classes reused.

---

## Done / closed (reference only)

| ID | Status | Note |
|----|--------|------|
| AUTH-2 | ✅ DONE | Public curated + full; friends unlock removed Aug 2026 |
| PERF-1 | ✅ DONE | view/ + download size picker + private ZIP code on `main` (`7535d57`); prod verify → OPS-5 |
| UX-NAV | ✅ DONE | Nav order/labels (`0d59b08`) |
| OPS-3 | ✅ DONE | `__pycache__/` gitignored |
| AUTH-1 | ✅ DONE | Family/client private R2 + D1 access codes |
| FEAT-1 | ✅ DONE | Curated public sets |
| FEAT-2 | ✅ DONE | Then replaced keyed hub with public `?full=1` — see AUTH-2 |
| UX-8 | ✅ DONE | Sibling city switcher |
| BUG-1 | WON'T DO | `curate/` removed |
| MNT-2 | WON'T DO | `curate/` removed |

### PERF-1 notes (shipped)
- Model: `grid/` → `view/` (~2048px lightbox) → original (download only).
- Regression (Aug 2026): Phase 1 briefly wiped by merge `028c108`; restored in `48495fc`. Venice open+3 nav: 255 MB → 5.2 MB.
- Follow-up: **OPS-5** for Worker redeploy.

### AUTH-1 notes (shipped)
- Tiers: `public` / `friends` / `family` / `client:<name>`
- Private R2 + Worker `/unlock` + `/image`; admin Access codes tab
- Friends city albums still on **public** R2 (intentional; AUTH-2)

### NOTE-1 — Privacy reality
- Family/client: real privacy (private R2 + tokens). ✅
- Public city albums: curated default + open full-album toggle on public R2 (intentional — AUTH-2).

---

## Changelog

- **FEAT-4 — Worker deploy for Large download tier** — Aug 2026.
  `portfolio-zip-download` version `d5993742-7e2f-45a0-8102-35a411bf7d88`.
  R2 `download/` backfill complete; frontend still uncommitted.

- **FEAT-4 — Large download tier implementation** — Aug 2026.
  Added a 4000px q88 `download/` derivative (~5 MB), fourth download choice, private Worker ACL,
  deletion cleanup, and resumable upload/backfill support.

- **Home chapters — Personal / Professional work IA** — Aug 2026 (branch `feat/home-chapters-reggie`).
  Yosemite photo-only hero + Personal/Client banners; `/personal-work/` + `/professional-work/`;
  Italy trip `highlights[]` + cities open full; Moksha public curated teaser (full set private R2).
  Merge pending explicit approval.

- **AUTH-2 — Public curated + full; drop friends unlock** — Aug 2026.
  City albums retagged `public`; removed friends hash from `PASSWORD_TIERS`; docs/skill/runbook cleaned. Anyone can see curated and full album.

- **Runbook — readable Open tickets board** — Aug 2026.
  Replaced mixed Status board with Open-only pick list + Done/closed reference table.

- **Runbook — Aug 2026 audit tickets** — Aug 2026.
  Marked PERF-1 / OPS-3 / UX-NAV done; closed BUG-1 + MNT-2; re-scoped MNT-5; added AUTH-2, OPS-5, OPS-6, OPS-7, ALBUM-1.

- **UX-NAV — Unlocked nav order + labels** — Aug 2026.
  Home · Gallery · Family Gallery · Client: \<title\> · About · Add Access · Sign out (`0d59b08`).

- **Album — Paulina and Maleek's Wedding rename** — Aug 2026.
  `js/albums/family-2025.js` → `main` (`c6a2faf`).

- **PERF-1 Phases 5–6 + upload tiers — merged** — Aug 2026.
  `7535d57`: size picker, private ZIP code, upload-album grid+view. Prod Worker → OPS-5.

- **PERF-1 Phases 1–2 + lightbox layout** — Aug 2026.
  `48495fc`; Worker `7b5b3de5-51ce-4fea-8b09-a1170515c2d7`.

- **Moksha Yoga** — Jul 2026.
  51 photos private R2; renumber sequential; D1 access code; nav/grid controls.

- **April family (MD + MI) + Fernando Family** — Jul 2026.
  Private R2 albums on `main`.

- **AUTH-1 + FEAT-1** — Jul 2026.
  Tiers, curated sets, private R2, access codes admin.

- **FEAT in-page full toggle** — Jul 2026.
  Replaced `/fullalbums/?k=` hub with public `?full=1` (see AUTH-2).

- **UX-8 sibling city switcher** — June 2026.
