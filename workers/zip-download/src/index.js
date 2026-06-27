import { makeZip } from 'client-zip';

const R2_PUBLIC_BASE = 'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/';
const MAX_FILES = 1000;

const ALLOWED_ORIGINS = new Set([
  'https://raveenfernando.com',
  'https://www.raveenfernando.com',
  'https://photography-portfolio-pi-blush.vercel.app',
]);

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    return { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' };
  }
  return {};
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

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          ...cors,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

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

    // Lazily pull each object from R2 so memory stays flat while the ZIP streams.
    async function* entries() {
      for (const key of keys) {
        const object = await env.BUCKET.get(key);
        if (!object || !object.body) continue;
        yield {
          name: uniqueName(key),
          input: object.body,
          size: object.size,
          lastModified: object.uploaded,
        };
      }
    }

    const zipStream = makeZip(entries());

    return new Response(zipStream, {
      headers: {
        ...cors,
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  },
};
