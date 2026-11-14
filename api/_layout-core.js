/**
 * Pure helpers for the on-site layout editor (api/admin-layout.js).
 * Underscore prefix = Vercel treats this as a private helper, not a route.
 *
 * A "trip" owns one marked LAYOUT block at the top of its album file:
 *
 *   // LAYOUT:BEGIN greece-2026 ...
 *   const GREECE_LAYOUT = { highlights: [...], kalymnos: { curated, photos }, ..., removed: [...] };
 *   // LAYOUT:END greece-2026
 *
 * The save endpoint rewrites only the text between the markers, and strips
 * removed photos from the full-frames file by exact-line match. No brace walking.
 */

export const R2_ORIGIN = 'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/';

export const TRIPS = {
  'greece-2026': {
    file: 'js/albums/greece-2026.js',
    allFile: 'js/albums/greece-2026-all.js',
    layoutVar: 'GREECE_LAYOUT',
    locations: ['kalymnos', 'naxos', 'athens'],
    // Public album ids whose highlights/curated/photos now live in the layout block.
    managedAlbumIds: [
      'greece-2026',
      'greece-public-kalymnos',
      'greece-public-naxos',
      'greece-public-athens',
    ],
  },
};

export const MANAGED_ALBUM_IDS = new Set(
  Object.values(TRIPS).flatMap((t) => t.managedAlbumIds),
);

const MAX_URLS_PER_LIST = 3000;

/** A URL is accepted only if it is a plain R2 public-bucket object URL. */
export function isValidPhotoUrl(u) {
  if (typeof u !== 'string') return false;
  if (!u.startsWith(R2_ORIGIN)) return false;
  if (u.length > 400) return false;
  // Nothing that could escape a template literal or the JS file.
  if (/[`\\${}\r\n]/.test(u)) return false;
  if (u.includes('..')) return false;
  return true;
}

function urlPath(url) {
  return url.slice(R2_ORIGIN.length);
}

/** `${R2_BASE_URL}/path` entry as written in the album files (no indent, no comma). */
export function entryLiteral(url) {
  return '`${R2_BASE_URL}/' + urlPath(url) + '`';
}

function dedupe(list) {
  return [...new Set(list)];
}

/**
 * Validate a layout payload for a trip and return a clean copy.
 * Throws an Error with a user-facing message on bad input.
 */
export function normalizeLayout(trip, layout, removed) {
  const checkList = (name, list) => {
    if (!Array.isArray(list)) throw new Error(`${name} must be an array`);
    if (list.length > MAX_URLS_PER_LIST) throw new Error(`${name} is too long`);
    const bad = list.filter((u) => !isValidPhotoUrl(u));
    if (bad.length) {
      const err = new Error(`Invalid photo URLs in ${name} (must be plain URLs under ${R2_ORIGIN})`);
      err.examples = bad.slice(0, 3);
      throw err;
    }
    return dedupe(list);
  };

  if (!layout || typeof layout !== 'object') throw new Error('layout is required');
  const clean = { highlights: checkList('highlights', layout.highlights), locations: {} };
  for (const loc of trip.locations) {
    const entry = layout[loc];
    if (!entry || typeof entry !== 'object') throw new Error(`layout.${loc} is required`);
    clean.locations[loc] = {
      curated: checkList(`${loc}.curated`, entry.curated),
      photos: checkList(`${loc}.photos`, entry.photos),
    };
  }
  clean.removed = checkList('removed', removed || []);
  return clean;
}

/** Remove tombstoned URLs from every list in a normalized layout. */
export function applyRemoved(clean, removedSet) {
  const keep = (list) => list.filter((u) => !removedSet.has(u));
  clean.highlights = keep(clean.highlights);
  for (const loc of Object.keys(clean.locations)) {
    clean.locations[loc].curated = keep(clean.locations[loc].curated);
    clean.locations[loc].photos = keep(clean.locations[loc].photos);
  }
  return clean;
}

function renderList(name, list, indent) {
  if (!list.length) return `${indent}${name}: [],`;
  const inner = list.map((u) => `${indent}  ${entryLiteral(u)},`).join('\n');
  return `${indent}${name}: [\n${inner}\n${indent}],`;
}

export function buildLayoutBlock(tripId, trip, clean) {
  const lines = [];
  lines.push(`// LAYOUT:BEGIN ${tripId} — written by the on-site layout editor (/api/admin-layout).`);
  lines.push('// Edit photos from the site while logged in as admin; do not hand-edit between the markers.');
  lines.push('// Stars: highlights = 4 (trip page), curated = 3 (location default grid), photos = 2 (location View all).');
  lines.push(`const ${trip.layoutVar} = {`);
  lines.push(renderList('highlights', clean.highlights, '  '));
  for (const loc of trip.locations) {
    lines.push(`  ${loc}: {`);
    lines.push(renderList('curated', clean.locations[loc].curated, '    '));
    lines.push(renderList('photos', clean.locations[loc].photos, '    '));
    lines.push('  },');
  }
  lines.push(renderList('removed', clean.removed, '  ') + ' // removed from the manifest; files remain in R2');
  lines.push('};');
  lines.push(`// LAYOUT:END ${tripId}`);
  return lines.join('\n');
}

function markerRegex(tripId) {
  const id = tripId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`// LAYOUT:BEGIN ${id}\\b[^\\n]*\\n[\\s\\S]*?// LAYOUT:END ${id}`);
}

export function hasLayoutBlock(source, tripId) {
  return markerRegex(tripId).test(source);
}

export function replaceLayoutBlock(source, tripId, block) {
  const re = markerRegex(tripId);
  if (!re.test(source)) throw new Error(`LAYOUT block for '${tripId}' not found in album file`);
  // Function replacer so `$` sequences in the block are never interpreted.
  return source.replace(re, () => block);
}

/** URLs currently listed under `removed: [...]` inside the LAYOUT block. */
export function parseRemovedFromBlock(source, tripId) {
  const m = source.match(markerRegex(tripId));
  if (!m) return [];
  const section = m[0].match(/removed:\s*\[([\s\S]*?)\]/);
  if (!section) return [];
  const out = [];
  const re = /`\$\{R2_BASE_URL\}\/([^`]+)`/g;
  let hit;
  while ((hit = re.exec(section[1])) !== null) out.push(R2_ORIGIN + hit[1]);
  return out;
}

function isEntryLine(line, literal) {
  const t = line.trim();
  return t === literal || t === literal + ',';
}

/**
 * Remove every line that is exactly one array entry for one of `urls`.
 * Returns { source, removedLines }.
 */
export function stripEntryLines(source, urls) {
  const literals = new Set(urls.map(entryLiteral));
  if (!literals.size) return { source, removedLines: 0 };
  let removedLines = 0;
  const kept = source.split('\n').filter((line) => {
    const t = line.trim().replace(/,$/, '');
    if (literals.has(t)) {
      removedLines += 1;
      return false;
    }
    return true;
  });
  return { source: kept.join('\n'), removedLines };
}

/**
 * Lines that mention a URL's path but are NOT a bare array entry
 * (coverImage, filmSections.coverImage, hand-written lists with other syntax, ...).
 * These block a removal because deleting them would leave the config pointing at nothing.
 */
export function findNonEntryReferences(source, urls) {
  const hits = [];
  const lines = source.split('\n');
  for (const url of urls) {
    const path = urlPath(url);
    const literal = entryLiteral(url);
    lines.forEach((line, i) => {
      if (line.includes(path) && !isEntryLine(line, literal)) {
        hits.push({ url, line: i + 1, text: line.trim().slice(0, 160) });
      }
    });
  }
  return hits;
}

/** Bare array-entry references in a file we will NOT edit (other lists). */
export function findEntryReferences(source, urls) {
  const found = new Set();
  const lines = source.split('\n');
  for (const url of urls) {
    const literal = entryLiteral(url);
    if (lines.some((line) => isEntryLine(line, literal))) found.add(url);
  }
  return [...found];
}
