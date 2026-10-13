/**
 * POST /api/admin-portfolio
 *
 * Updates ordered public portfolio categories in js/portfolio.js and, when
 * asked, only the highlights[] field of an album that already has a carousel.
 * Does not delete album photos or change any other album field.
 *
 * Local development must not call this endpoint. The admin UI saves a
 * browser-only preview on localhost instead.
 *
 * Body: {
 *   portfolio: { featured: string[], travel: string[], life: string[], events: string[], couples: string[] },
 *   highlights?: { [albumId]: string[] },
 *   showcase?: { sourceAlbumId, sourceUrl, publicUrl, published }[]
 * }
 *
 * Category URLs are written to js/portfolio.js. The private source trace is
 * written to api/_portfolio-showcase.js, which is not loaded by public pages.
 */
import { requireSession } from './_admin-session.js';

const R2_ORIGIN = 'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/';
const CATEGORIES = ['featured', 'travel', 'life', 'events', 'couples'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

  const portfolio = body?.portfolio;
  const highlights = body?.highlights && typeof body.highlights === 'object' ? body.highlights : {};
  const showcase = Array.isArray(body?.showcase) ? body.showcase : [];
  if (!portfolio || typeof portfolio !== 'object') {
    return res.status(400).json({ error: 'portfolio object is required' });
  }

  for (const id of CATEGORIES) {
    const invalid = invalidUrls(portfolio[id]);
    if (invalid) {
      return res.status(400).json({ error: `Invalid ${id} photo URLs`, examples: invalid });
    }
  }
  for (const [albumId, urls] of Object.entries(highlights)) {
    if (!/^[a-z0-9-]+$/.test(albumId)) {
      return res.status(400).json({ error: `Invalid album id: ${albumId}` });
    }
    const invalid = invalidUrls(urls);
    if (invalid) {
      return res.status(400).json({ error: `Invalid carousel URLs for ${albumId}`, examples: invalid });
    }
  }
  const showcaseError = invalidShowcase(showcase);
  if (showcaseError) {
    return res.status(400).json({ error: 'Invalid showcase records', examples: showcaseError });
  }

  const [owner, repo] = GITHUB_REPO.split('/');
  const ghHeaders = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  try {
    await writeGithubFile(
      owner,
      repo,
      'js/portfolio.js',
      ghHeaders,
      content => applyPortfolioArrays(content, portfolio),
      'Admin: update curated portfolio selects',
    );

    for (const [albumId, urls] of Object.entries(highlights)) {
      const filePath = await findAlbumFile(owner, repo, albumId, ghHeaders);
      if (!filePath) {
        return res.status(404).json({ error: `Album '${albumId}' not found` });
      }
      await writeGithubFile(
        owner,
        repo,
        filePath,
        ghHeaders,
        content => applyHighlightsUpdate(content, albumId, urls),
        `Admin: update archive carousel for ${albumId}`,
      );
    }

    await writeGithubFile(
      owner,
      repo,
      'api/_portfolio-showcase.js',
      ghHeaders,
      () => renderShowcaseModule(showcase),
      'Admin: update private portfolio showcase trace',
    );
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }

  return res.status(200).json({ ok: true, message: 'Portfolio saved — Vercel will redeploy' });
}

function invalidShowcase(list) {
  const bad = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') {
      bad.push('record must be an object');
      continue;
    }
    if (item.sourceAlbumId && !/^[a-z0-9-]+$/.test(item.sourceAlbumId)) bad.push(item.sourceAlbumId);
    const urls = invalidUrls([item.sourceUrl, item.publicUrl].filter(Boolean));
    if (!item.publicUrl || urls) bad.push(item.publicUrl || item.sourceUrl || 'missing url');
    const showcaseCopy = typeof item.publicUrl === 'string' && item.publicUrl.includes('/portfolio-showcase/');
    const alreadyPublic = item.publicUrl === item.sourceUrl;
    if (!showcaseCopy && !alreadyPublic) bad.push(item.publicUrl);
  }
  return bad.length ? bad.slice(0, 3) : null;
}

function renderShowcaseModule(showcase) {
  const lines = showcase.map(item => {
    const record = {
      sourceAlbumId: item.sourceAlbumId || '',
      sourceUrl: item.sourceUrl || '',
      publicUrl: item.publicUrl,
      published: Boolean(item.published),
    };
    return `  ${JSON.stringify(record)},`;
  });
  return `// Admin source trace. Public pages do not load this file.\nconst PORTFOLIO_SHOWCASE = [\n${lines.join('\n')}\n];\n`;
}

function invalidUrls(list) {
  if (!Array.isArray(list)) return ['photos must be an array'];
  const bad = list.filter(url => {
    if (typeof url !== 'string') return true;
    if (!url.startsWith(R2_ORIGIN)) return true;
    if (/[`\\${}]/.test(url)) return true;
    if (url.includes('..')) return true;
    return false;
  });
  return bad.length ? bad.slice(0, 3) : null;
}

async function writeGithubFile(owner, repo, filePath, ghHeaders, transform, message) {
  const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  const getRes = await fetch(apiBase, { headers: ghHeaders });
  let sha = null;
  let original = '';
  if (getRes.ok) {
    const fileData = await getRes.json();
    sha = fileData.sha;
    original = Buffer.from(fileData.content || '', 'base64').toString('utf-8');
  } else if (getRes.status !== 404) {
    throw new Error(`Failed to read ${filePath}: ${getRes.status}`);
  }
  const updated = transform(original);
  if (updated === original) return;
  const putRes = await fetch(apiBase, {
    method: 'PUT',
    headers: { ...ghHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: Buffer.from(updated).toString('base64'),
      ...(sha ? { sha } : {}),
    }),
  });
  if (!putRes.ok) {
    const errBody = await putRes.text();
    throw new Error(`GitHub PUT failed for ${filePath}: ${putRes.status} — ${errBody}`);
  }
}

function applyPortfolioArrays(original, portfolio) {
  let updated = original;
  for (const id of CATEGORIES) {
    const pattern = new RegExp(`(${id}:\\s*\\[)[\\s\\S]*?(\\n\\s*\\],)`);
    if (!pattern.test(updated)) throw new Error(`Could not find ${id} array in js/portfolio.js`);
    const urls = portfolio[id];
    const body = urls.length
      ? `\n${urls.map(url => `    ${JSON.stringify(url).replace(/^"|"$/g, "'")},`).join('\n')}\n  `
      : '';
    updated = updated.replace(pattern, `$1${body}$2`);
  }
  return updated;
}

async function findAlbumFile(owner, repo, albumId, ghHeaders) {
  const listRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/js/albums`,
    { headers: ghHeaders },
  );
  if (!listRes.ok) return null;
  const entries = await listRes.json();
  const pattern = new RegExp(`\\bid:\\s*['"]${albumId}['"]`);
  for (const entry of entries) {
    if (entry?.type !== 'file' || !entry.name?.endsWith('.js')) continue;
    const getRes = await fetch(entry.url, { headers: ghHeaders });
    if (!getRes.ok) continue;
    const fileData = await getRes.json();
    const content = Buffer.from(fileData.content || '', 'base64').toString('utf-8');
    if (pattern.test(content)) return entry.path;
  }
  return null;
}

function applyHighlightsUpdate(originalContent, albumId, photos) {
  const lines = originalContent.split('\n');
  const albumStartPattern = new RegExp(`\\bid:\\s*['"]${albumId}['"]`);
  const albumStartLine = lines.findIndex(line => albumStartPattern.test(line));
  if (albumStartLine === -1) throw new Error(`Album '${albumId}' not found in source file`);

  let blockStart = albumStartLine;
  while (blockStart > 0 && !lines[blockStart].includes('{')) blockStart--;

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
  if (blockEnd === -1) throw new Error(`Could not find closing brace for album '${albumId}'`);

  let existing = -1;
  for (let i = blockStart; i <= blockEnd; i++) {
    if (/^\s*highlights\s*:/.test(lines[i])) { existing = i; break; }
  }
  if (existing === -1) {
    throw new Error(`Album '${albumId}' has no archive carousel`);
  }

  let highlightsEnd = existing;
  if (!lines[existing].includes(']') ) {
    for (let i = existing + 1; i <= blockEnd; i++) {
      highlightsEnd = i;
      if (/^\s*\]/.test(lines[i])) break;
    }
  }

  const indent = (lines[albumStartLine].match(/^(\s*)/) || ['', '    '])[1];
  const safe = url => JSON.stringify(url).replace(/^"|"$/g, "'");
  const highlightsLine = photos.length
    ? `${indent}highlights: [\n${photos.map(url => `${indent}  ${safe(url)},`).join('\n')}\n${indent}],`
    : `${indent}highlights: [],`;

  return [
    ...lines.slice(0, existing),
    highlightsLine,
    ...lines.slice(highlightsEnd + 1),
  ].join('\n');
}
