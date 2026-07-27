/**
 * POST /api/admin-curate
 *
 * Writes a curated photo list for a given album into the album source file
 * under js/albums/*.js (or legacy js/config.js) via the GitHub API.
 * The endpoint does NOT touch R2 — it only updates source.
 *
 * Body: { albumId: string, photos: string[] }
 *   albumId — the album's `id` field
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

  // Allowlist: every URL must be from the known R2 public bucket.
  // This prevents an attacker with a stolen session from injecting
  // arbitrary JS/expressions into the backtick literals in album files.
  const R2_ORIGIN = 'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/';
  const invalidUrls = photos.filter(u => {
    if (typeof u !== 'string') return true;
    if (!u.startsWith(R2_ORIGIN)) return true;
    // Reject anything that could escape a template literal or the JS file
    if (/[`\\${}]/.test(u)) return true;
    // Reject path traversal
    if (u.includes('..')) return true;
    return false;
  });
  if (invalidUrls.length > 0) {
    return res.status(400).json({
      error: `Invalid photo URLs (must start with ${R2_ORIGIN} and contain no special characters)`,
      examples: invalidUrls.slice(0, 3),
    });
  }

  const [owner, repo] = GITHUB_REPO.split('/');
  const ghHeaders = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  let albumFile;
  try {
    albumFile = await findAlbumSourceFile(owner, repo, albumId, ghHeaders);
  } catch (err) {
    return res.status(502).json({ error: `Failed to locate album source: ${err.message}` });
  }

  if (!albumFile) {
    return res.status(404).json({
      error: `Album '${albumId}' not found in js/albums/*.js or js/config.js`,
    });
  }

  const { filePath, fileData, content: originalContent } = albumFile;
  const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

  let updatedContent;
  try {
    updatedContent = applyCuratedUpdate(originalContent, albumId, photos);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  if (updatedContent === originalContent) {
    return res.status(200).json({ ok: true, changed: false, message: 'curated set unchanged', file: filePath });
  }

  // ── Write back to GitHub ──────────────────────────────────────────────────
  try {
    const putRes = await fetch(apiBase, {
      method: 'PUT',
      headers: { ...ghHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: photos.length === 0
          ? `Admin: clear curated set for ${albumId}`
          : `Admin: set curated[${photos.length}] for ${albumId}`,
        content: Buffer.from(updatedContent).toString('base64'),
        sha: fileData.sha,
      }),
    });

    if (!putRes.ok) {
      const errBody = await putRes.text();
      throw new Error(`GitHub PUT failed: ${putRes.status} — ${errBody}`);
    }
  } catch (err) {
    return res.status(502).json({ error: `Failed to write ${filePath}: ${err.message}` });
  }

  return res.status(200).json({
    ok: true,
    changed: true,
    albumId,
    file: filePath,
    curatedCount: photos.length,
    message: `curated[${photos.length}] saved for ${albumId} in ${filePath} — Vercel will redeploy`,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Locate which source file contains the album object.
 * Prefers js/albums/*.js; falls back to legacy js/config.js.
 */
async function findAlbumSourceFile(owner, repo, albumId, ghHeaders) {
  const candidates = [];

  const listRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/js/albums`,
    { headers: ghHeaders },
  );
  if (listRes.ok) {
    const entries = await listRes.json();
    if (Array.isArray(entries)) {
      for (const entry of entries) {
        if (entry?.type === 'file' && typeof entry.name === 'string' && entry.name.endsWith('.js')) {
          candidates.push(entry.path);
        }
      }
    }
  }

  // Legacy fallback for any albums still inlined in config.js
  candidates.push('js/config.js');

  const albumStartPattern = new RegExp(`\\bid:\\s*['"]${escapeRegex(albumId)}['"]`);

  const hits = await Promise.all(candidates.map(async (filePath) => {
    const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
    const getRes = await fetch(apiBase, { headers: ghHeaders });
    if (!getRes.ok) return null;
    const fileData = await getRes.json();
    if (!fileData?.content) return null;
    const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
    if (!albumStartPattern.test(content)) return null;
    return { filePath, fileData, content };
  }));

  return hits.find(Boolean) || null;
}

/**
 * Insert or replace the curated[] array in the album block.
 *
 * Strategy:
 *   1. Find the album object by its `id: 'albumId'` line.
 *   2. Find the closing `},` of that object (tracking brace depth).
 *   3. If a `curated:` line already exists in the block, replace it.
 *      If not, insert it before the closing `},`.
 *
 * Intentionally conservative: never reformat anything outside the curated line.
 */
function applyCuratedUpdate(originalContent, albumId, photos) {
  const lines = originalContent.split('\n');

  const albumStartPattern = new RegExp(`\\bid:\\s*['"]${escapeRegex(albumId)}['"]`);
  let albumStartLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (albumStartPattern.test(lines[i])) {
      albumStartLine = i;
      break;
    }
  }

  if (albumStartLine === -1) {
    throw new Error(`Album '${albumId}' not found in source file`);
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
    throw new Error(`Could not find closing brace for album '${albumId}'`);
  }

  // Match surrounding property indent (album files use 4 spaces)
  const indentMatch = lines[albumStartLine].match(/^(\s*)/);
  const indent = indentMatch ? indentMatch[1] : '    ';
  const curatedLine = buildCuratedLine(photos, indent);

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
    let curatedEnd = existingCuratedLine;
    if (
      !lines[existingCuratedLine].includes('[')
      || lines[existingCuratedLine].trimEnd().endsWith('],')
      || lines[existingCuratedLine].trimEnd().endsWith(']')
    ) {
      curatedEnd = existingCuratedLine;
    } else {
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

  return updatedLines.join('\n');
}

/**
 * Build a single curated: [...] line.
 * URLs are written as JSON.stringify() single-quoted strings so no
 * backtick template expression or injection is possible even if a URL
 * somehow contained special characters (the allowlist above also blocks this).
 */
function buildCuratedLine(photos, indent) {
  if (photos.length === 0) {
    return `${indent}curated: [],`;
  }
  // Use JSON.stringify to get a safely escaped string, then convert outer
  // double-quotes to single-quotes (album file convention).
  const safeStr = (u) => JSON.stringify(u).replace(/^"|"$/g, "'");
  if (photos.length <= 3) {
    const inner = photos.map(safeStr).join(', ');
    return `${indent}curated: [${inner}],`;
  }
  const inner = photos.map(u => `${indent}  ${safeStr(u)},`).join('\n');
  return `${indent}curated: [\n${inner}\n${indent}],`;
}
