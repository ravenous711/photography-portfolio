import { requireSession } from './_admin-session.js';

const BUCKET = 'portfolio-images';
const R2_BASE_URL = 'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require valid signed session cookie
  const session = requireSession(req, res);
  if (!session) return;

  const {
    CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN,
    GITHUB_TOKEN,
    GITHUB_REPO,
  } = process.env;

  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN || !GITHUB_TOKEN || !GITHUB_REPO) {
    return res.status(500).json({ error: 'Server not configured — missing environment variables.' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { urls } = body;

  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'No URLs provided' });
  }

  // Strip base URL to get R2 object keys (path after bucket root)
  const objectKeys = urls
    .filter(u => typeof u === 'string' && u.startsWith(R2_BASE_URL))
    .map(u => u.slice(R2_BASE_URL.length).replace(/^\//, ''));

  if (objectKeys.length === 0) {
    return res.status(400).json({ error: 'No valid R2 URLs found' });
  }

  // Also delete grid/ copies; ignore thumbnails/ (deprecated tier)
  const allKeys = objectKeys.flatMap(key => [key, `grid/${key}`]);

  // ── 1. Delete from Cloudflare R2 ──────────────────────────────────────────
  const deleteResults = await Promise.allSettled(
    allKeys.map(key =>
      fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets/${BUCKET}/objects/${encodeURIComponent(key)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}` },
        }
      ).then(r => ({ key, ok: r.ok, status: r.status }))
    )
  );

  const deleted = [...new Set(
    deleteResults
      .filter(r => r.status === 'fulfilled' && r.value.ok)
      .map(r => r.value.key)
      .filter(key => !key.startsWith('grid/'))
  )];

  const deleteFailed = deleteResults
    .filter(r => r.status === 'rejected' || !r.value?.ok)
    .map(r => r.value?.key || 'unknown');

  // ── 2. Update album source files via GitHub API ────────────────────────────
  // Albums live in js/albums/*.js (legacy leftovers may still be in js/config.js).
  const [owner, repo] = GITHUB_REPO.split('/');
  const ghHeaders = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  let configUpdated = false;
  let configError = null;
  const updatedFiles = [];

  try {
    const sourceFiles = await listAlbumSourceFiles(owner, repo, ghHeaders);
    const fileResults = await Promise.all(sourceFiles.map(async (filePath) => {
      const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
      const getRes = await fetch(apiBase, { headers: ghHeaders });
      if (!getRes.ok) return { filePath, changed: false, error: `GitHub GET failed: ${getRes.status}` };
      const fileData = await getRes.json();
      const originalContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
      const updatedContent = removeUrlsFromSource(originalContent, urls);

      if (updatedContent === originalContent) {
        return { filePath, changed: false };
      }

      const putRes = await fetch(apiBase, {
        method: 'PUT',
        headers: { ...ghHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Admin: remove ${deleted.length} photo${deleted.length !== 1 ? 's' : ''} from ${filePath}`,
          content: Buffer.from(updatedContent).toString('base64'),
          sha: fileData.sha,
        }),
      });
      if (!putRes.ok) {
        const errBody = await putRes.text();
        return { filePath, changed: false, error: `GitHub PUT failed: ${putRes.status} — ${errBody}` };
      }
      return { filePath, changed: true };
    }));

    for (const result of fileResults) {
      if (result.changed) {
        configUpdated = true;
        updatedFiles.push(result.filePath);
      } else if (result.error) {
        configError = configError
          ? `${configError}; ${result.filePath}: ${result.error}`
          : `${result.filePath}: ${result.error}`;
      }
    }

    if (!configUpdated && !configError) {
      configError = 'No matching photo URLs found in js/albums/*.js or js/config.js';
    }
  } catch (err) {
    configError = err.message;
  }

  return res.status(200).json({
    deleted,
    deleteFailed,
    configUpdated,
    updatedFiles,
    configError: configError || null,
  });
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function listAlbumSourceFiles(owner, repo, ghHeaders) {
  const files = [];
  const listRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/js/albums`,
    { headers: ghHeaders },
  );
  if (listRes.ok) {
    const entries = await listRes.json();
    if (Array.isArray(entries)) {
      for (const entry of entries) {
        if (entry?.type === 'file' && typeof entry.name === 'string' && entry.name.endsWith('.js')) {
          files.push(entry.path);
        }
      }
    }
  }
  files.push('js/config.js');
  return files;
}

function removeUrlsFromSource(originalContent, urls) {
  // Album files use `${R2_BASE_URL}/path/file.jpg` — not the expanded full URL
  let updatedContent = originalContent;
  for (const url of urls) {
    const path = url.startsWith(R2_BASE_URL)
      ? url.slice(R2_BASE_URL.length).replace(/^\//, '')
      : null;
    if (!path) continue;

    const pathPattern = escapeRegex(path);

    // Photo array entry: `${R2_BASE_URL}/path/file.jpg`,
    updatedContent = updatedContent.replace(
      new RegExp(`\\s*\`\\$\\{R2_BASE_URL\\}/${pathPattern}\`,\\n`, 'g'),
      '\n'
    );
    // Legacy: full URL string (if any old entries exist)
    updatedContent = updatedContent.replace(
      new RegExp(`\\s*\`${escapeRegex(url)}\`,\\n`, 'g'),
      '\n'
    );
    // curated entries are single-quoted full URLs
    updatedContent = updatedContent.replace(
      new RegExp(`\\s*'${escapeRegex(url)}',\\n`, 'g'),
      '\n'
    );
    // coverImage
    updatedContent = updatedContent.replace(
      new RegExp(`(coverImage:\\s*)\`\\$\\{R2_BASE_URL\\}/${pathPattern}\``, 'g'),
      "$1'/images/placeholder-album.svg'"
    );
    updatedContent = updatedContent.replace(
      new RegExp(`(coverImage:\\s*)\`${escapeRegex(url)}\``, 'g'),
      "$1'/images/placeholder-album.svg'"
    );
  }

  // Clean up any double blank lines introduced by removal
  return updatedContent.replace(/\n{3,}/g, '\n\n');
}
