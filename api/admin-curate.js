/**
 * POST /api/admin-curate
 *
 * Writes a curated photo list for a given album into js/config.js via the GitHub API.
 * The endpoint does NOT touch R2 — it only updates config.js.
 *
 * Body: { albumId: string, photos: string[] }
 *   albumId — the album's `id` field in config.js
 *   photos  — ordered array of full R2 photo URLs to set as `curated`
 *
 * Requires a valid admin session cookie (set by api/admin-login.js).
 */
import { requireSession } from './_admin-session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require valid signed session
  const session = requireSession(req, res);
  if (!session) return;

  const { GITHUB_TOKEN, GITHUB_REPO } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return res.status(500).json({ error: 'Server not configured — missing GITHUB_TOKEN or GITHUB_REPO' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { albumId, photos } = body || {};

  if (!albumId || typeof albumId !== 'string') {
    return res.status(400).json({ error: 'albumId is required' });
  }
  if (!Array.isArray(photos)) {
    return res.status(400).json({ error: 'photos must be an array' });
  }

  // ── Fetch config.js from GitHub ───────────────────────────────────────────
  const [owner, repo] = GITHUB_REPO.split('/');
  const filePath = 'js/config.js';
  const apiBase  = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  const ghHeaders = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  let fileData;
  try {
    const getRes = await fetch(apiBase, { headers: ghHeaders });
    if (!getRes.ok) throw new Error(`GitHub GET failed: ${getRes.status}`);
    fileData = await getRes.json();
  } catch (err) {
    return res.status(502).json({ error: `Failed to fetch config.js: ${err.message}` });
  }

  const originalContent = Buffer.from(fileData.content, 'base64').toString('utf-8');

  // ── Insert or replace the curated[] array in the album block ─────────────
  //
  // Strategy:
  //   1. Find the album object by its `id: 'albumId'` line.
  //   2. Find the closing `},` of that object (tracking brace depth).
  //   3. If a `curated:` line already exists in the block, replace it.
  //      If not, insert it before the closing `},`.
  //
  // This is intentionally conservative: we never reformat or rewrite anything
  // outside the curated line itself.

  const lines = originalContent.split('\n');

  // Find the line index that starts this album's object
  const albumStartPattern = new RegExp(`\\bid:\\s*['"]${escapeRegex(albumId)}['"]`);
  let albumStartLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (albumStartPattern.test(lines[i])) {
      albumStartLine = i;
      break;
    }
  }

  if (albumStartLine === -1) {
    return res.status(404).json({ error: `Album '${albumId}' not found in config.js` });
  }

  // Walk back to find the opening `{` of the album object (usually on the line before `id:`)
  let blockStart = albumStartLine;
  while (blockStart > 0 && !lines[blockStart].includes('{')) blockStart--;

  // Walk forward from blockStart to find the matching closing `}` / `},`
  let depth = 0;
  let blockEnd = -1;
  for (let i = blockStart; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) { blockEnd = i; break; }
      }
    }
    if (blockEnd !== -1) break;
  }

  if (blockEnd === -1) {
    return res.status(500).json({ error: `Could not find closing brace for album '${albumId}'` });
  }

  // Build the curated line (indented 4 spaces to match the rest of the config)
  const indent = '    ';
  const curatedLine = buildCuratedLine(photos, indent);

  // Check if a `curated:` key already exists in the block
  const curatedPattern = /^\s*curated\s*:/;
  let existingCuratedLine = -1;
  for (let i = blockStart; i <= blockEnd; i++) {
    if (curatedPattern.test(lines[i])) {
      existingCuratedLine = i;
      break;
    }
  }

  let updatedLines;
  if (existingCuratedLine !== -1) {
    // Replace the existing curated line (may span multiple lines if it's a multi-line array)
    // Find where it ends: the line ending with ],  or ] and the next non-array line
    let curatedEnd = existingCuratedLine;
    // If the line contains the full array on one line, it ends here
    if (!lines[existingCuratedLine].includes('[') || lines[existingCuratedLine].trimEnd().endsWith('],') || lines[existingCuratedLine].trimEnd().endsWith(']')) {
      curatedEnd = existingCuratedLine;
    } else {
      // Multi-line array: scan forward until we see the closing `]`
      for (let i = existingCuratedLine + 1; i <= blockEnd; i++) {
        curatedEnd = i;
        if (/^\s*\]/.test(lines[i])) break;
      }
    }
    updatedLines = [
      ...lines.slice(0, existingCuratedLine),
      curatedLine,
      ...lines.slice(curatedEnd + 1),
    ];
  } else {
    // Insert before the closing `},` of the album block
    updatedLines = [
      ...lines.slice(0, blockEnd),
      curatedLine,
      ...lines.slice(blockEnd),
    ];
  }

  const updatedContent = updatedLines.join('\n');

  if (updatedContent === originalContent) {
    return res.status(200).json({ ok: true, changed: false, message: 'curated set unchanged' });
  }

  // ── Write back to GitHub ──────────────────────────────────────────────────
  try {
    const putRes = await fetch(apiBase, {
      method: 'PUT',
      headers: { ...ghHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Admin: set curated[${photos.length}] for ${albumId}`,
        content: Buffer.from(updatedContent).toString('base64'),
        sha: fileData.sha,
      }),
    });

    if (!putRes.ok) {
      const errBody = await putRes.text();
      throw new Error(`GitHub PUT failed: ${putRes.status} — ${errBody}`);
    }
  } catch (err) {
    return res.status(502).json({ error: `Failed to write config.js: ${err.message}` });
  }

  return res.status(200).json({
    ok: true,
    changed: true,
    albumId,
    curatedCount: photos.length,
    message: `curated[${photos.length}] saved for ${albumId} — Vercel will redeploy`,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a single curated: [...] line.
 * For ≤ 3 photos: inline. For > 3: multi-line array, one URL per line.
 */
function buildCuratedLine(photos, indent) {
  if (photos.length === 0) {
    return `${indent}curated: [],`;
  }
  if (photos.length <= 3) {
    const inner = photos.map(u => `\`${u}\``).join(', ');
    return `${indent}curated: [${inner}],`;
  }
  const inner = photos.map(u => `${indent}  \`${u}\`,`).join('\n');
  return `${indent}curated: [\n${inner}\n${indent}],`;
}
