// Clean URL helpers — used across static pages
const Routes = {
  home: '/',
  gallery: '/gallery/',

  login(returnTo) {
    return `/login/?return=${encodeURIComponent(returnTo || this.home)}`;
  },

  album(id) {
    return `/album/${encodeURIComponent(id)}/`;
  },

  /** Album group (e.g. Italy 2026) — /gallery/:id/, not the /gallery/ index */
  group(id) {
    return `/gallery/${encodeURIComponent(id)}/`;
  },

  curate(albumId) {
    return `/curate/${encodeURIComponent(albumId)}/`;
  },

  curateGroup(groupId, pw) {
    let url = `/curate/group/${encodeURIComponent(groupId)}/`;
    if (pw) url += `?pw=${encodeURIComponent(pw)}`;
    return url;
  },

  albumPageUrl(album) {
    if (!album) return this.gallery;
    return album.type === 'group' ? this.group(album.id) : this.album(album.id);
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

  /** Album group at /gallery/:id/ — excludes the /gallery/ listing page */
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
