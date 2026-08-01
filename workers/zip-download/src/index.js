import { makeZip, predictLength } from 'client-zip';

const R2_PUBLIC_BASE = 'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/';
const MAX_FILES = 1000;

// Token lifetime: 4 hours
const TOKEN_TTL_SECONDS = 4 * 60 * 60;

// ── HMAC token helpers (Web Crypto) ──────────────────────────────────────────

async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlDecode(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

/** Create a signed token: base64url(payload).base64url(hmac) */
async function createToken(payload, secret) {
  const key = await importHmacKey(secret);
  const data = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${b64url(sig)}`;
}

/** Verify token; returns parsed payload or null if invalid/expired. */
async function verifyToken(token, secret) {
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const data = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  try {
    const key = await importHmacKey(secret);
    const sigBytes = b64urlDecode(sigB64);
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(data)));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── /unlock — exchange password hash for a signed token ──────────────────────

/**
 * POST /unlock
 * Body: { hash: "<sha256-of-password>" }
 * Env secrets: UNLOCK_SECRET, FRIENDS_HASH, FAMILY_HASH
 * Returns: { token, tier, expiresAt } or 401
 */
async function handleUnlock(request, env, cors) {
  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!env.UNLOCK_SECRET) return json({ error: 'Unlock not configured' }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { hash } = body || {};
  if (!hash || typeof hash !== 'string' || !/^[0-9a-f]{64}$/i.test(hash)) {
    return json({ error: 'Invalid hash' }, 400);
  }

  // Match hash against known tier hashes (constant-time comparison via subtle)
  let grantedTier = null;
  const check = async (envHash, tierName) => {
    if (!envHash || grantedTier) return;
    // Use HMAC of '1' as a dummy constant-time compare proxy
    const a = new TextEncoder().encode(hash);
    const b = new TextEncoder().encode(envHash);
    if (a.length !== b.length) return;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    if (diff === 0) grantedTier = tierName;
  };

  await check(env.FAMILY_HASH, 'family');
  await check(env.FRIENDS_HASH, 'friends');

  // Fall back to D1 access_codes if env hashes didn't match
  if (!grantedTier && env.DB) {
    const row = await env.DB.prepare(
      `SELECT audience FROM access_codes WHERE code_hash = ? AND revoked = 0 LIMIT 1`
    ).bind(hash).first();
    if (row) grantedTier = row.audience;
  }

  if (!grantedTier) return json({ error: 'Invalid access code' }, 401);

  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const token = await createToken({ tier: grantedTier, exp }, env.UNLOCK_SECRET);

  return json({ token, tier: grantedTier, expiresAt: exp * 1000 });
}

// ── /image — serve private R2 objects behind token gate ───────────────────────

/**
 * GET /image?key=<r2-key>&token=<hmac-token>
 * Serves from PRIVATE_BUCKET if token is valid and tier has access to this key.
 */
async function handleImage(request, url, env, cors) {
  const err = (msg, status) =>
    new Response(msg, { status, headers: { ...cors, 'Cache-Control': 'no-store' } });

  if (request.method !== 'GET') return err('Method not allowed', 405);
  if (!env.UNLOCK_SECRET || !env.PRIVATE_BUCKET) return err('Not configured', 503);

  const token = url.searchParams.get('token');
  const rawKey = url.searchParams.get('key');
  if (!token || !rawKey) return err('Missing token or key', 400);

  // Sanitise key: no traversal, no leading slash
  const key = decodeURIComponent(rawKey).replace(/^\/+/, '').replace(/\.\./g, '');
  if (!key) return err('Invalid key', 400);

  const payload = await verifyToken(token, env.UNLOCK_SECRET);
  if (!payload) return err('Forbidden', 403);

  // Tier access rules:
  // - 'family' or 'family:*' → any key in the private bucket
  // - 'client:<name>' → keys under '<name>/', 'grid/<name>/' or 'view/<name>/' (case-insensitive)
  // - 'friends' → no private bucket access (friends albums use public R2)
  const { tier } = payload;
  if (tier === 'friends') return err('Forbidden', 403);
  if (tier.startsWith('client:')) {
    const clientName = tier.slice(7).toLowerCase();
    const keyLower = key.toLowerCase();
    const allowed =
      keyLower.startsWith(`${clientName}/`) ||
      keyLower.startsWith(`grid/${clientName}/`) ||
      keyLower.startsWith(`view/${clientName}/`);
    if (!allowed) return err('Forbidden', 403);
  }
  // 'family' tier → allow any private bucket key

  const object = await env.PRIVATE_BUCKET.get(key);
  if (!object) return err('Not found', 404);

  const ext = key.split('.').pop().toLowerCase();
  const contentType = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', avif: 'image/avif' }[ext] || 'application/octet-stream';

  return new Response(object.body, {
    headers: {
      ...cors,
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
      'Content-Length': String(object.size),
    },
  });
}

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

// ── /access-codes — admin CRUD for D1-backed access codes ────────────────────

/**
 * Requires: Authorization: Bearer <ADMIN_SECRET>
 *
 * POST   /access-codes         { label, audience, code }  → { id, label, audience }
 * GET    /access-codes                                     → { codes: [...] }
 * DELETE /access-codes/:id                                 → { ok: true }
 */
async function handleAccessCodes(request, url, env, cors) {
  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  // All access-codes endpoints require admin auth
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!env.ADMIN_SECRET || !token || token !== env.ADMIN_SECRET) {
    return json({ error: 'Unauthorized' }, 401);
  }

  if (!env.DB) return json({ error: 'DB not configured' }, 503);

  // DELETE /access-codes/:id — revoke
  const deleteMatch = url.pathname.match(/^\/access-codes\/(\d+)$/);
  if (deleteMatch && request.method === 'DELETE') {
    const id = parseInt(deleteMatch[1], 10);
    await env.DB.prepare(`UPDATE access_codes SET revoked = 1 WHERE id = ?`).bind(id).run();
    return json({ ok: true });
  }

  // GET /access-codes — list all (active + revoked, newest first)
  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT id, label, audience, created_at, revoked FROM access_codes ORDER BY id DESC`
    ).all();
    return json({ codes: results });
  }

  // POST /access-codes — create new code
  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

    const { label, audience, code } = body || {};
    if (!label || !audience || !code) {
      return json({ error: 'label, audience, and code are required' }, 400);
    }
    if (typeof label !== 'string' || label.length > 128) return json({ error: 'label too long' }, 400);
    if (typeof audience !== 'string' || audience.length > 64) return json({ error: 'audience too long' }, 400);
    if (typeof code !== 'string' || code.length < 8 || code.length > 256) {
      return json({ error: 'code must be 8–256 characters' }, 400);
    }

    // Hash the plaintext code before storing
    const codeHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))
      .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''));

    try {
      const result = await env.DB.prepare(
        `INSERT INTO access_codes (code_hash, label, audience) VALUES (?, ?, ?)`
      ).bind(codeHash, label, audience).run();
      return json({ id: result.meta.last_row_id, label, audience }, 201);
    } catch (e) {
      if (String(e).includes('UNIQUE')) return json({ error: 'Code already exists' }, 409);
      throw e;
    }
  }

  return json({ error: 'Method not allowed' }, 405);
}

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
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Route favorites requests
    if (url.pathname.startsWith('/favorites')) {
      return handleFavorites(request, url, env, cors);
    }

    // Private image unlock
    if (url.pathname === '/unlock') {
      return handleUnlock(request, env, cors);
    }

    // Private image serving
    if (url.pathname === '/image') {
      return handleImage(request, url, env, cors);
    }

    // Access codes admin CRUD
    if (url.pathname.startsWith('/access-codes')) {
      return handleAccessCodes(request, url, env, cors);
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
