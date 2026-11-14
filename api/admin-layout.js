/**
 * POST /api/admin-layout
 *
 * Saves the on-site layout editor's result for one trip as a SINGLE commit:
 *   - rewrites the marked LAYOUT block in the trip's album file
 *     (highlights = 4 stars, per-location curated = 3 stars, per-location photos = 2 stars)
 *   - strips photos removed from the manifest out of the full-frames file
 * It never touches R2. `git revert <sha>` undoes a save, including removals.
 *
 * Body: {
 *   trip: 'greece-2026',
 *   layout: { highlights: string[], kalymnos: { curated, photos }, naxos: {...}, athens: {...} },
 *   removed: string[],     // photos to remove from the manifest in this save
 *   dryRun?: boolean       // compute and report, write nothing
 * }
 *
 * Write targets:
 *   - Production / preview: GitHub Git Data API (one commit). Branch = GITHUB_BRANCH,
 *     else the repo's default branch.
 *   - Local dev: set LAYOUT_WRITE_MODE=local to write the files in the working tree instead
 *     (refused when VERCEL_ENV=production).
 *
 * Requires a valid admin session cookie (api/admin-login.js).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { requireSession } from './_admin-session.js';
import {
  TRIPS,
  applyRemoved,
  buildLayoutBlock,
  findEntryReferences,
  findNonEntryReferences,
  hasLayoutBlock,
  normalizeLayout,
  parseRemovedFromBlock,
  replaceLayoutBlock,
  stripEntryLines,
} from './_layout-core.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireSession(req, res);
  if (!session) return;

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const tripId = body?.trip;
  const trip = typeof tripId === 'string' && Object.hasOwn(TRIPS, tripId) ? TRIPS[tripId] : null;
  if (!trip) return res.status(400).json({ error: `Unknown trip '${tripId}'` });

  let clean;
  try {
    clean = normalizeLayout(trip, body.layout, body.removed);
  } catch (err) {
    return res.status(400).json({ error: err.message, examples: err.examples });
  }
  const dryRun = body.dryRun === true;

  const localMode = process.env.LAYOUT_WRITE_MODE === 'local';
  if (localMode && process.env.VERCEL_ENV === 'production') {
    return res.status(500).json({ error: 'LAYOUT_WRITE_MODE=local is not allowed in production' });
  }

  let store;
  try {
    store = localMode ? localStore() : githubStore();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  let current;
  try {
    current = await store.read(trip);
  } catch (err) {
    return res.status(502).json({ error: `Failed to read album files: ${err.message}` });
  }
  const { tripSource, allSource, others } = current;

  if (!hasLayoutBlock(tripSource, tripId)) {
    return res.status(409).json({ error: `LAYOUT block for '${tripId}' is missing from ${trip.file}` });
  }

  // Tombstones: earlier removals stay removed; this save's removals are added.
  const removedAll = [...new Set([...parseRemovedFromBlock(tripSource, tripId), ...clean.removed])];
  const removedSet = new Set(removedAll);
  const newlyRemoved = clean.removed.filter((u) => !parseRemovedFromBlock(tripSource, tripId).includes(u));

  // Refuse removals that would orphan a cover (or any non-list reference).
  const blockers = [];
  for (const [file, source] of [[trip.file, tripSource], [trip.allFile, allSource]]) {
    // Ignore the old LAYOUT block while scanning (its lines are plain entries anyway).
    findNonEntryReferences(source, newlyRemoved).forEach((hit) => blockers.push({ file, ...hit }));
  }
  if (blockers.length) {
    return res.status(409).json({
      error: 'Cannot remove photos that are used outside a photo list (for example as a cover). Change the cover first.',
      blockers: blockers.map((b) => ({ file: b.file, line: b.line, text: b.text })),
    });
  }

  // Build the new files.
  applyRemoved(clean, removedSet);
  clean.removed = removedAll;

  const stripTrip = stripEntryLines(tripSource, removedAll);
  const newTripSource = replaceLayoutBlock(
    stripTrip.source,
    tripId,
    buildLayoutBlock(tripId, trip, clean),
  );
  const stripAll = stripEntryLines(allSource, removedAll);

  // Other album files may list the same photo (film catalogs, etc). We leave them alone and say so.
  const warnings = [];
  for (const [file, source] of Object.entries(others)) {
    const refs = findEntryReferences(source, newlyRemoved);
    if (refs.length) {
      warnings.push(`${refs.length} removed photo(s) are also listed in ${file}; left untouched.`);
    }
  }

  const changes = [];
  if (newTripSource !== tripSource) changes.push({ path: trip.file, content: newTripSource });
  if (stripAll.source !== allSource) changes.push({ path: trip.allFile, content: stripAll.source });

  const summary = {
    highlights: clean.highlights.length,
    locations: Object.fromEntries(
      trip.locations.map((l) => [l, {
        curated: clean.locations[l].curated.length,
        photos: clean.locations[l].photos.length,
      }]),
    ),
    removedTotal: removedAll.length,
    newlyRemoved: newlyRemoved.length,
    removedLinesAllFile: stripAll.removedLines,
  };

  if (!changes.length) {
    return res.status(200).json({ ok: true, changed: false, message: 'Layout unchanged', summary, warnings });
  }
  if (dryRun) {
    return res.status(200).json({
      ok: true, changed: true, dryRun: true, files: changes.map((c) => c.path), summary, warnings,
    });
  }

  const counts = trip.locations
    .map((l) => `${l} ${summary.locations[l].curated}/${summary.locations[l].photos}`)
    .join(', ');
  let message = `Admin: layout ${tripId} (trip ${summary.highlights}; ${counts})`;
  if (newlyRemoved.length) {
    message += `; remove ${newlyRemoved.length} photo(s) from manifest, R2 untouched`;
  }

  try {
    const result = await store.write(changes, message);
    return res.status(200).json({
      ok: true,
      changed: true,
      mode: localMode ? 'local' : 'github',
      files: changes.map((c) => c.path),
      summary,
      warnings,
      ...result,
    });
  } catch (err) {
    return res.status(502).json({ error: `Failed to save: ${err.message}` });
  }
}

// ── Local working-tree store (dev only) ───────────────────────────────────────

function localStore() {
  const root = process.cwd();
  const abs = (p) => path.join(root, p);
  return {
    async read(trip) {
      const tripSource = await fs.readFile(abs(trip.file), 'utf8');
      const allSource = await fs.readFile(abs(trip.allFile), 'utf8');
      const others = {};
      const names = await fs.readdir(abs('js/albums'));
      for (const name of names) {
        const rel = `js/albums/${name}`;
        if (!name.endsWith('.js') || rel === trip.file || rel === trip.allFile) continue;
        others[rel] = await fs.readFile(abs(rel), 'utf8');
      }
      return { tripSource, allSource, others };
    },
    async write(changes) {
      for (const c of changes) await fs.writeFile(abs(c.path), c.content, 'utf8');
      return { message: 'Wrote files in the local working tree (no commit). Review with git diff.' };
    },
  };
}

// ── GitHub store: one commit via the Git Data API ─────────────────────────────

function githubStore() {
  const { GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    throw new Error('Server not configured — missing GITHUB_TOKEN or GITHUB_REPO');
  }
  const [owner, repo] = GITHUB_REPO.split('/');
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };

  const gh = async (url, init) => {
    const r = await fetch(url, { ...init, headers: { ...headers, ...(init?.headers || {}) } });
    if (!r.ok) {
      const text = await r.text();
      const err = new Error(`GitHub ${init?.method || 'GET'} ${url.replace(api, '')} failed: ${r.status} ${text.slice(0, 200)}`);
      err.status = r.status;
      throw err;
    }
    return r.json();
  };

  const resolveBranch = async () => {
    if (GITHUB_BRANCH) return GITHUB_BRANCH;
    const info = await gh(api);
    return info.default_branch;
  };

  const readFile = async (p, branch) => {
    const data = await gh(`${api}/contents/${p}?ref=${encodeURIComponent(branch)}`);
    return Buffer.from(data.content, 'base64').toString('utf8');
  };

  let branchName;
  return {
    async read(trip) {
      branchName = await resolveBranch();
      const [tripSource, allSource] = await Promise.all([
        readFile(trip.file, branchName),
        readFile(trip.allFile, branchName),
      ]);
      const listing = await gh(`${api}/contents/js/albums?ref=${encodeURIComponent(branchName)}`);
      const otherPaths = (Array.isArray(listing) ? listing : [])
        .filter((e) => e.type === 'file' && e.name.endsWith('.js') && e.path !== trip.file && e.path !== trip.allFile)
        .map((e) => e.path);
      const others = {};
      await Promise.all(otherPaths.map(async (p) => { others[p] = await readFile(p, branchName); }));
      return { tripSource, allSource, others };
    },
    async write(changes, message) {
      const ref = await gh(`${api}/git/ref/heads/${encodeURIComponent(branchName)}`);
      const parentSha = ref.object.sha;
      const parent = await gh(`${api}/git/commits/${parentSha}`);
      const tree = await gh(`${api}/git/trees`, {
        method: 'POST',
        body: JSON.stringify({
          base_tree: parent.tree.sha,
          tree: changes.map((c) => ({ path: c.path, mode: '100644', type: 'blob', content: c.content })),
        }),
      });
      const commit = await gh(`${api}/git/commits`, {
        method: 'POST',
        body: JSON.stringify({ message, tree: tree.sha, parents: [parentSha] }),
      });
      try {
        await gh(`${api}/git/refs/heads/${encodeURIComponent(branchName)}`, {
          method: 'PATCH',
          body: JSON.stringify({ sha: commit.sha, force: false }),
        });
      } catch (err) {
        if (err.status === 422 || err.status === 409) {
          throw new Error('The branch moved while saving (another save or push). Reload the page and try again.');
        }
        throw err;
      }
      return { branch: branchName, commit: commit.sha, message };
    },
  };
}
