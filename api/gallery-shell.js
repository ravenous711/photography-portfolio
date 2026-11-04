// Serves the group and album HTML with the real title in the raw page.
// Link previews never run the script that sets document.title, so a shared
// /gallery/ URL otherwise previews as "Album".
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const PHOTOGRAPHER = 'Raveen Fernando';
const DESCRIPTION = 'Photography by Raveen Fernando.';
const SITE_URL = 'https://raveenfernando.com';
const DEFAULT_OG_IMAGE = `${SITE_URL}/images/hero.jpg`;
const PUBLIC_R2 = 'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev';

// Private-bucket covers can't be fetched by crawlers. Family/client albums
// have audience 'family' or 'client:*'. For those, use the public og-covers
// copy uploaded to portfolio-images/og-covers/<albumId>.jpg.
function resolveOgImage(album) {
  if (!album) return DEFAULT_OG_IMAGE;
  const audience = album.audience || 'public';
  const isPrivate = audience === 'family' || audience.startsWith('client:');
  if (isPrivate) {
    // Use public og-covers copy (uploaded per album)
    return album.id ? `${PUBLIC_R2}/og-covers/${album.id}.jpg` : DEFAULT_OG_IMAGE;
  }
  // Public album — cover is accessible directly
  return album.coverImage || DEFAULT_OG_IMAGE;
}

let albumsCache = null;

function loadAlbums() {
  if (albumsCache) return albumsCache;
  const dir = path.join(process.cwd(), 'js', 'albums');
  const albums = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.js')) continue;
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    const match = source.match(/const (ALBUMS_[A-Z0-9_]+)\s*=/);
    if (!match) continue;
    const sandbox = { R2_BASE_URL: PUBLIC_R2 };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.__albums = ${match[1]};`, sandbox);
    if (Array.isArray(sandbox.__albums)) albums.push(...sandbox.__albums);
  }
  albumsCache = albums;
  return albums;
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function findAlbum(query) {
  const albums = loadAlbums();
  const page = first(query.page);
  const id = first(query.id);
  const group = first(query.group);
  const slug = first(query.slug);

  if (page === 'group' && id) {
    return albums.find(album => album.id === id) || null;
  }
  if (group && slug) {
    return albums.find(album => album.parentId === group && album.slug === slug) || null;
  }
  if (slug && first(query.year)) {
    return albums.find(album => album.familySlug === slug) || null;
  }
  if (id) return albums.find(album => album.id === id) || null;
  return null;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function withShareTitle(html, title, ogImage) {
  const full = `${title} — ${PHOTOGRAPHER}`;
  const safe = escapeHtml(full);
  const img = escapeHtml(ogImage || DEFAULT_OG_IMAGE);
  const head = [
    `<title>${safe}</title>`,
    `<meta name="description" content="${escapeHtml(DESCRIPTION)}" />`,
    `<meta property="og:title" content="${safe}" />`,
    `<meta property="og:description" content="${escapeHtml(DESCRIPTION)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:image" content="${img}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${safe}" />`,
    `<meta name="twitter:image" content="${img}" />`,
  ].join('\n  ');
  return html.replace(/<title>[^<]*<\/title>/, head);
}

export default function handler(req, res) {
  const page = first(req.query.page) === 'group' ? 'group' : 'album';
  const file = path.join(process.cwd(), page, 'index.html');
  let html;
  try {
    html = fs.readFileSync(file, 'utf8');
  } catch {
    res.status(404).send('Not found');
    return;
  }

  try {
    const album = findAlbum(req.query);
    if (album?.title) html = withShareTitle(html, album.title, resolveOgImage(album));
  } catch (err) {
    console.error('gallery-shell title lookup failed', err);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.status(200).send(html);
}
