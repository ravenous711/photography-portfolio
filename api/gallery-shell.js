// Serves the group and album HTML with the real title in the raw page.
// Link previews never run the script that sets document.title, so a shared
// /gallery/ URL otherwise previews as "Album".
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const PHOTOGRAPHER = 'Raveen Fernando';
const DESCRIPTION = 'Photography by Raveen Fernando.';

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
    const sandbox = { R2_BASE_URL: '' };
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

function withShareTitle(html, title) {
  const full = `${title} — ${PHOTOGRAPHER}`;
  const safe = escapeHtml(full);
  const head = [
    `<title>${safe}</title>`,
    `<meta name="description" content="${escapeHtml(DESCRIPTION)}" />`,
    `<meta property="og:title" content="${safe}" />`,
    `<meta property="og:description" content="${escapeHtml(DESCRIPTION)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${safe}" />`,
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
    if (album?.title) html = withShareTitle(html, album.title);
  } catch (err) {
    console.error('gallery-shell title lookup failed', err);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.status(200).send(html);
}
