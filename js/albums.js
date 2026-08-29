// ============================================================
// albums.js — Album registry
// ============================================================
// This file assembles the global ALBUMS array used by every page.
//
// Each album group lives in its own file under js/albums/:
//
//   clients.js          — hidden/private client albums
//   family-2025.js      — family event albums from 2025
//   family-2026.js      — family event albums from 2026
//   california-2025.js  — California 2025 trip
//   misc-2026.js        — standalone 2026 public albums (Film Rolls, Red Rock)
//   italy-2026.js       — Italy 2026 trip (cities + film rolls)
//   morgan-alden-2026.js — unlisted public album (Morgan and Alden)
//
// ── To add a new trip or album group ──────────────────────────
//   1. Create js/albums/my-trip-YYYY.js
//   2. Define:  const ALBUMS_MY_TRIP = [ { id: '...', ... }, ... ];
//   3. Add it to the spread below
//   4. Add <script src="/js/albums/my-trip-YYYY.js"></script> to
//      every HTML page (right before this file's script tag)
//
// ── To add a new family album ─────────────────────────────────
//   Open js/albums/family-YYYY.js for the right year and add the
//   album object at the top of the array (newest first).
// ============================================================

// ── Album field reference ──────────────────────────────────────
//   id          – unique slug used in URLs
//   title       – display name
//   description – short caption shown on gallery card
//   date        – date string for dateline (e.g. "May 2026")
//   dateline    – optional override string (or false to hide)
//   audience    – 'public' | 'family' | 'client:<name>'  (legacy 'friends' = public)
//   hidden      – true = exclude from gallery grid
//   protected   – true = password required (legacy per-album gate)
//   coverImage  – full URL to cover photo
//   coverPosition – CSS object-position override (e.g. "50% 30%")
//   photos      – array of digital photo URLs
//   digitalLabel– optional heading above digital grid
//   filmSections– array of { label, photos, navLabel, camera, filmStock }
//   filmPhotos  – shorthand: single film section appended after photos
//   albumKind   – 'film-roll' for hidden full-roll sub-albums
//   camera / filmStock / rollNumber – for film-roll albums
//   tripAlbumId – optional: full trip/place album this roll came from (when
//                 parentId is the film-rolls catalog, not the trip itself)
//   type        – 'group' for trip index pages (shows sub-album grid)
//   subAlbums   – array of sub-album ids (for type:'group')
//   subAlbumSections – optional [{ title, albums }] to section the group card grid
//   includeHiddenSubAlbums – group flag: show hidden sub-albums in the card grid
//   showFilmRolls – group flag: false hides the film-roll ledger on the group page
//   parentId    – parent group id (for sub-albums)
//   slug        – URL slug within parent group (for sub-albums)
//   familySlug  – slug used in /familyalbums/:year/:slug/ URLs
// ============================================================

const ALBUMS = [
  ...ALBUMS_CLIENTS,
  ...ALBUMS_FAMILY_2026,
  ...ALBUMS_FAMILY_2025,
  ...ALBUMS_CALIFORNIA,
  ...ALBUMS_MISC_2026,
  ...ALBUMS_ITALY_2026,
  ...ALBUMS_MORGAN_ALDEN_2026,
];
