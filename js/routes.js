// Clean URL helpers — used across static pages
const Routes = {
  home: '/',
  gallery: '/gallery/',

  /** Flat album URL — used when no parent slug (legacy / standalone albums) */
  album(id) {
    return `/album/${encodeURIComponent(id)}/`;
  },

  /** Nested city album under a group — /gallery/italy-2026/florence/ */
  nestedAlbum(groupId, slug) {
    return `/gallery/${encodeURIComponent(groupId)}/${encodeURIComponent(slug)}/`;
  },

  /** Album group (e.g. Italy 2026) — /gallery/:id/, not the /gallery/ index */
  group(id) {
    return `/gallery/${encodeURIComponent(id)}/`;
  },

  /** Family album — /familyalbums/:year/:familySlug/ */
  familyAlbum(album) {
    const year = (album.date || '').match(/\b(20\d\d)\b/)?.[1] || 'family';
    return `/familyalbums/${year}/${encodeURIComponent(album.familySlug)}/`;
  },

  albumPageUrl(album) {
    if (!album) return this.gallery;
    if (album.type === 'group') return this.group(album.id);
    if (album.familySlug) return this.familyAlbum(album);
    if (album.parentId && album.slug) {
      return this.nestedAlbum(album.parentId, album.slug);
    }
    return this.album(album.id);
  },

  photoFilename(url) {
    if (!url) return '';
    return url.split('/').pop().split('?')[0];
  },

  /** Album page URL that opens a specific photo (via ?photo=filename.jpg) */
  albumPhotoUrl(album, photoUrl) {
    const base = this.albumPageUrl(album);
    const name = this.photoFilename(photoUrl);
    return name ? `${base}?photo=${encodeURIComponent(name)}` : base;
  },

  _albums() {
    return typeof ALBUMS !== 'undefined' ? ALBUMS : [];
  },

  findAlbumByGroupSlug(groupId, slug) {
    return this._albums().find(
      a => a.parentId === groupId && a.slug === slug && a.type !== 'group'
    );
  },

  /** Resolve album from current path — handles all URL patterns */
  resolveAlbumFromPath() {
    // /familyalbums/:year/:slug/
    const family = window.location.pathname.match(/^\/familyalbums\/([^/]+)\/([^/]+)\/?$/);
    if (family) {
      const slug = decodeURIComponent(family[2]);
      return this._albums().find(a => a.familySlug === slug);
    }

    // /gallery/:group/:slug/ or /fullalbums/:group/:slug/
    const nested = window.location.pathname.match(/^\/(gallery|fullalbums)\/([^/]+)\/([^/]+)\/?$/);
    if (nested) {
      return this.findAlbumByGroupSlug(
        decodeURIComponent(nested[2]),
        decodeURIComponent(nested[3])
      );
    }

    // /album/:id/ or /fullalbums/:id/
    const flat = window.location.pathname.match(/^\/(album|fullalbums)\/([^/]+)\/?$/);
    if (flat) {
      const id = decodeURIComponent(flat[2]);
      return this._albums().find(a => a.id === id);
    }

    return null;
  },

  /** True when the current page is a /fullalbums/ full-album view */
  isFullAlbumPath() {
    return window.location.pathname.startsWith('/fullalbums/');
  },

  /** Returns the ?k= share key from the current URL, or null */
  getShareKey() {
    return new URLSearchParams(window.location.search).get('k') || null;
  },

  /** Build a /fullalbums/... URL for a given album, with the share key appended */
  fullAlbumUrl(album, key) {
    let base;
    if (!album) return key ? `/fullalbums/?k=${encodeURIComponent(key)}` : '/fullalbums/';
    if (album.parentId && album.slug) {
      base = `/fullalbums/${encodeURIComponent(album.parentId)}/${encodeURIComponent(album.slug)}/`;
    } else {
      base = `/fullalbums/${encodeURIComponent(album.id)}/`;
    }
    return key ? `${base}?k=${encodeURIComponent(key)}` : base;
  },

  /** Build the public curated /gallery/... URL for an album */
  curatedUrl(album) {
    return this.albumPageUrl(album);
  },

  /** /album/:id/ → canonical URL (family slug or nested gallery) when a better URL exists */
  redirectLegacyFlatAlbum() {
    const flat = window.location.pathname.match(/^\/album\/([^/]+)\/?$/);
    if (!flat) return false;

    const album = this._albums().find(a => a.id === decodeURIComponent(flat[1]));
    if (!album) return false;

    if (album.familySlug) {
      window.location.replace(this.familyAlbum(album));
      return true;
    }
    if (album.parentId && album.slug) {
      window.location.replace(this.nestedAlbum(album.parentId, album.slug));
      return true;
    }
    return false;
  },

  /** ?id= on album page → canonical nested or flat URL. Returns true if redirecting. */
  canonicalizeAlbumQuery() {
    const params = new URLSearchParams(window.location.search);
    const legacyId = params.get('id');
    if (!legacyId) return false;

    const album = this._albums().find(a => a.id === legacyId);
    if (!album) return false;

    window.location.replace(this.albumPageUrl(album));
    return true;
  },

  /** Build /segment/id/ with optional query string */
  _cleanPath(segment, id, qs) {
    const base = `/${segment}/${encodeURIComponent(id)}/`;
    return qs ? `${base}?${qs}` : base;
  },

  /** Read an id from /segment/:id or legacy ?queryKey= */
  parsePathId(segment, queryKeys = ['id']) {
    const match = window.location.pathname.match(new RegExp(`/${segment}/([^/]+)/?$`));
    if (match) return decodeURIComponent(match[1]);

    const params = new URLSearchParams(window.location.search);
    for (const key of queryKeys) {
      const val = params.get(key);
      if (val) return val;
    }
    return null;
  },

  /** Album group at /gallery/:id/ — excludes /gallery/ index and nested albums */
  parseGalleryGroupId(queryKeys = ['id']) {
    const match = window.location.pathname.match(/^\/gallery\/([^/]+)\/?$/);
    if (match) return decodeURIComponent(match[1]);

    const params = new URLSearchParams(window.location.search);
    for (const key of queryKeys) {
      const val = params.get(key);
      if (val) return val;
    }
    return null;
  },

  /** Redirect legacy query URLs to /segment/:id/ */
  canonicalize(segment, queryKeys = ['id']) {
    const params = new URLSearchParams(window.location.search);
    let legacyId = null;
    let usedKey = null;
    for (const key of queryKeys) {
      const val = params.get(key);
      if (val) {
        legacyId = val;
        usedKey = key;
        break;
      }
    }
    if (!legacyId) return null;

    if (new RegExp(`/${segment}/[^/]+/?$`).test(window.location.pathname)) {
      return legacyId;
    }

    params.delete(usedKey);
    window.location.replace(this._cleanPath(segment, legacyId, params.toString()));
    return legacyId;
  },

  /** Legacy /group/:id → /gallery/:id/ */
  redirectOldGroupPaths() {
    const match = window.location.pathname.match(/^\/group\/([^/]+)\/?$/);
    if (!match) return false;
    window.location.replace(this.group(match[1]));
    return true;
  },

  parseNestedPath(prefix, segment, queryKeys) {
    const match = window.location.pathname.match(
      new RegExp(`/${prefix}/${segment}/([^/]+)/?$`)
    );
    if (match) return decodeURIComponent(match[1]);

    const params = new URLSearchParams(window.location.search);
    for (const key of queryKeys) {
      const val = params.get(key);
      if (val) return val;
    }
    return null;
  },

  canonicalizeNested(prefix, segment, queryKeys) {
    const params = new URLSearchParams(window.location.search);
    let legacyId = null;
    let usedKey = null;
    for (const key of queryKeys) {
      const val = params.get(key);
      if (val) {
        legacyId = val;
        usedKey = key;
        break;
      }
    }
    if (!legacyId) return null;

    if (new RegExp(`/${prefix}/${segment}/[^/]+/?$`).test(window.location.pathname)) {
      return legacyId;
    }

    params.delete(usedKey);
    const qs = params.toString();
    const base = `/${prefix}/${segment}/${encodeURIComponent(legacyId)}/`;
    window.location.replace(qs ? `${base}?${qs}` : base);
    return legacyId;
  },
};
