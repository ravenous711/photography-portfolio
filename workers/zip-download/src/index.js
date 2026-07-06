import { makeZip, predictLength } from 'client-zip';

const R2_PUBLIC_BASE = 'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/';
const MAX_FILES = 1000;

const ALLOWED_ORIGINS = new Set([
  'https://raveenfernando.com',
  'https://www.raveenfernando.com',
  'https://photography-portfolio-pi-blush.vercel.app',
  // Local dev: add your vercel dev origin if needed
  'http://localhost:8080',
  'http://localhost:3000',
]);

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    return { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' };
  }
  return {};
}

// ── Favorites / voting (D1) ───────────────────────────────────────────────────

/**
 * POST /favorites/toggle
 * Body: { albumId, photoUrl, sessionId }
 * Returns: { hearted: bool, count: number }
 *
 * GET /favorites?albumId=X&sessionId=Y
 * Returns: { heartedUrls: string[] }
 *
 * GET /favorites/tally?albumId=X
 * Requires: Authorization: Bearer <ADMIN_SECRET>
 * Returns: { tally: [{photoUrl, count}] } sorted DESC
 */
async function handleFavorites(request, url, env, cors) {
  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'Favorites not configured (no D1 binding)' }),
      { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  // Admin tally — requires Bearer token matching ADMIN_SECRET wrangler secret
  if (url.pathname === '/favorites/tally') {
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!env.ADMIN_SECRET || !token || token !== env.ADMIN_SECRET) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const albumId = url.searchParams.get('albumId');
    if (!albumId) return json({ error: 'albumId required' }, 400);

    const { results } = await env.DB.prepare(
      `SELECT photo_url, COUNT(*) as count
       FROM favorites
       WHERE album_id = ?
       GROUP BY photo_url
       ORDER BY count DESC`
    ).bind(albumId).all();

    return json({ tally: results.map(r => ({ photoUrl: r.photo_url, count: r.count })) });
  }

  // Heart toggle — POST /favorites/toggle
  if (url.pathname === '/favorites/toggle') {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

    const { albumId, photoUrl, sessionId } = body || {};
    if (!albumId || !photoUrl || !sessionId) {
      return json({ error: 'albumId, photoUrl, sessionId required' }, 400);
    }
    if (sessionId.length > 128 || albumId.length > 256 || photoUrl.length > 2048) {
      return json({ error: 'Input too long' }, 400);
    }

    // Check if already hearted
    const existing = await env.DB.prepare(
      `SELECT id FROM favorites WHERE session_id = ? AND photo_url = ?`
    ).bind(sessionId, photoUrl).first();

    if (existing) {
      // Un-heart
      await env.DB.prepare(
        `DELETE FROM favorites WHERE session_id = ? AND photo_url = ?`
      ).bind(sessionId, photoUrl).run();
    } else {
      // Heart — INSERT OR IGNORE handles race conditions
      await env.DB.prepare(
        `INSERT OR IGNORE INTO favorites (album_id, photo_url, session_id) VALUES (?, ?, ?)`
      ).bind(albumId, photoUrl, sessionId).run();
    }

    // Return updated count for this photo
    const row = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM favorites WHERE photo_url = ?`
    ).bind(photoUrl).first();

    return json({ hearted: !existing, count: row?.count ?? 0 });
  }

  // Session hearts — GET /favorites?albumId=X&sessionId=Y
  if (url.pathname === '/favorites') {
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

    const albumId = url.searchParams.get('albumId');
    const sessionId = url.searchParams.get('sessionId');
    if (!albumId || !sessionId) return json({ error: 'albumId and sessionId required' }, 400);

    const { results } = await env.DB.prepare(
      `SELECT photo_url FROM favorites WHERE album_id = ? AND session_id = ?`
    ).bind(albumId, sessionId).all();

    return json({ heartedUrls: results.map(r => r.photo_url) });
  }

  return json({ error: 'Not found' }, 404);
}

// ── Helpers (ZIP) ─────────────────────────────────────────────────────────────

// Normalise a caller-supplied value into an R2 object key.
// Accepts full public URLs or already-relative keys; strips query strings.
function toKey(raw) {
  let value = (raw || '').trim();
  if (!value) return '';
  if (value.startsWith(R2_PUBLIC_BASE)) value = value.slice(R2_PUBLIC_BASE.length);
  value = value.replace(/^https?:\/\/[^/]+\//, '');
  value = value.replace(/^\/+/, '');
  value = value.split('?')[0];
  try {
    value = decodeURIComponent(value);
  } catch (_) {
    // leave as-is if it is not valid percent-encoding
  }
  // Reject path traversal / absolute escapes.
  if (value.includes('..')) return '';
  return value;
}

function sanitizeFilename(name) {
  const cleaned = (name || '').replace(/[^a-z0-9._-]/gi, '-').replace(/-+/g, '-');
  return cleaned && cleaned !== '.zip' ? cleaned : 'photos.zip';
}

async function parseKeys(request) {
  const url = new URL(request.url);
  let rawKeys = [];
  let filename = url.searchParams.get('filename') || '';

  if (request.method === 'POST') {
    const contentType = request.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      const body = await request.json().catch(() => ({}));
      rawKeys = Array.isArray(body.keys) ? body.keys : [];
      filename = body.filename || filename;
    } else {
      const form = await request.formData();
      const raw = form.get('keys') || '';
      rawKeys = String(raw).split(/[\n,]/);
      filename = form.get('filename') || filename;
    }
  } else {
    const raw = url.searchParams.get('keys') || '';
    rawKeys = raw.split(',');
  }

  const seen = new Set();
  const keys = [];
  for (const item of rawKeys) {
    const key = toKey(item);
    if (key && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return { keys, filename: sanitizeFilename(filename.endsWith('.zip') ? filename : `${filename}.zip`) };
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          ...cors,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Route favorites requests
    if (url.pathname.startsWith('/favorites')) {
      return handleFavorites(request, url, env, cors);
    }

    // ZIP download (existing)
    if (request.method !== 'GET' && request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: cors });
    }

    const { keys, filename } = await parseKeys(request);

    if (!keys.length) {
      return new Response('No valid photo keys provided', { status: 400, headers: cors });
    }
    if (keys.length > MAX_FILES) {
      return new Response(`Too many files (max ${MAX_FILES})`, { status: 400, headers: cors });
    }

    // Dedupe entry names so the archive stays valid when two folders share a filename.
    const usedNames = new Set();
    const uniqueName = (key) => {
      let name = key.split('/').pop() || 'photo.jpg';
      if (!usedNames.has(name)) {
        usedNames.add(name);
        return name;
      }
      const dot = name.lastIndexOf('.');
      const base = dot >= 0 ? name.slice(0, dot) : name;
      const ext = dot >= 0 ? name.slice(dot) : '';
      let n = 2;
      while (usedNames.has(`${base}-${n}${ext}`)) n++;
      const unique = `${base}-${n}${ext}`;
      usedNames.add(unique);
      return unique;
    };

    // Pre-pass: resolve each object's size (via cheap HEAD) so we can send an
    // exact Content-Length. Without it the response is chunked/unknown-length,
    // and iOS Safari's download manager stalls at "0 KB". Run in bounded
    // batches to stay polite with concurrent R2 ops.
    const CONCURRENCY = 50;
    const metas = [];
    for (let i = 0; i < keys.length; i += CONCURRENCY) {
      const batch = keys.slice(i, i + CONCURRENCY);
      const heads = await Promise.all(
        batch.map(async (key) => {
          const head = await env.BUCKET.head(key);
          return head ? { key, size: head.size, lastModified: head.uploaded } : null;
        })
      );
      for (const m of heads) if (m) metas.push(m);
    }

    if (!metas.length) {
      return new Response('No matching photos found', { status: 404, headers: cors });
    }

    // Final entry list with deduped names; used for both length prediction and streaming.
    const files = metas.map((m) => ({
      key: m.key,
      name: uniqueName(m.key),
      size: m.size,
      lastModified: m.lastModified,
    }));

    // Exact byte length of the archive client-zip will emit for this metadata.
    const totalLength = predictLength(files.map((f) => ({ name: f.name, size: f.size })));

    // Lazily pull each object from R2 so memory stays flat while the ZIP streams.
    async function* entries() {
      for (const f of files) {
        const object = await env.BUCKET.get(f.key);
        if (!object || !object.body) continue;
        yield {
          name: f.name,
          input: object.body,
          size: f.size,
          lastModified: f.lastModified,
        };
      }
    }

    // Pipe the ZIP through a FixedLengthStream so the runtime emits a real
    // Content-Length instead of chunked encoding. iOS Safari needs a known
    // size or its download manager stalls at "0 KB". predictLength is verified
    // to match makeZip's output exactly, so the byte count is safe to enforce.
    const { readable, writable } = new FixedLengthStream(Number(totalLength));
    makeZip(entries()).pipeTo(writable).catch(() => {});

    return new Response(readable, {
      headers: {
        ...cors,
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  },
};
