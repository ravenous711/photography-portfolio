// ── Shared utilities used across all pages ──

// SHA-256 hash helper (Web Crypto API)
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Navigation: transparent → opaque on scroll (home hero only) ──
function initNav() {
  const nav = document.getElementById('main-nav');
  if (!nav) return;

  const overHero = document.querySelector('.hero');

  const updateNav = () => {
    if (!overHero || window.scrollY > 60) {
      nav.classList.add('nav-scrolled');
    } else {
      nav.classList.remove('nav-scrolled');
    }
  };

  window.addEventListener('scroll', updateNav, { passive: true });
  updateNav();

  // Home · Personal work · Professional work · About · Private Access (dropdown)
  buildPrivateAccessMenu();
  initPrivateAccessDropdown();
}

// Client albums unlocked via access code — used by the Private Access menu.
function getUnlockedClientAlbums() {
  if (typeof TierAuth === 'undefined' || typeof ALBUMS === 'undefined') return [];
  return [...TierAuth.grantedTiers()]
    .filter(tier => tier.startsWith('client:'))
    .map(tier => ALBUMS.find(a => a.audience === tier) || ALBUMS.find(a => a.id === tier.slice(7)))
    .filter(Boolean);
}

function normalizeNavPath(path) {
  return (path || '/').replace(/\/?$/, '/') || '/';
}

function appendPrivateAccessItem(container, { href, label, active, onClick, dataset }) {
  if (!container) return;
  const el = onClick
    ? document.createElement('button')
    : document.createElement('a');
  el.className = 'nav-dropdown-item' + (active ? ' nav-active' : '');
  el.textContent = label;
  if (onClick) {
    el.type = 'button';
    el.addEventListener('click', onClick);
  } else {
    el.href = href;
    el.setAttribute('role', 'menuitem');
  }
  if (dataset) {
    Object.entries(dataset).forEach(([k, v]) => { el.dataset[k] = v; });
  }
  container.appendChild(el);
}

/** Fill desktop + mobile Private Access menus from current unlock state. */
function buildPrivateAccessMenu() {
  const desktopMenu = document.getElementById('nav-private-menu');
  const mobileMenu = document.getElementById('mobile-private-menu');
  if (!desktopMenu && !mobileMenu) return;

  const hasAnyTiers = (typeof TierAuth !== 'undefined') && TierAuth.grantedTiers().size > 0;
  const albums = getUnlockedClientAlbums();
  const canSeeFamily = (typeof TierAuth !== 'undefined') && TierAuth.canAccess('family');
  const currentPath = normalizeNavPath(window.location.pathname);

  function fill(container) {
    if (!container) return;
    container.innerHTML = '';

    if (!hasAnyTiers) {
      appendPrivateAccessItem(container, {
        href: '/unlock/',
        label: 'Enter code',
        active: currentPath.startsWith('/unlock/'),
      });
      return;
    }

    albums.forEach(album => {
      if (typeof Routes === 'undefined') return;
      const href = Routes.albumPageUrl(album);
      appendPrivateAccessItem(container, {
        href,
        label: album.title,
        active: normalizeNavPath(href) === currentPath,
        dataset: { clientAlbum: album.id },
      });
    });

    if (canSeeFamily) {
      appendPrivateAccessItem(container, {
        href: '/familyalbums/',
        label: 'Family Gallery',
        active: currentPath.startsWith('/familyalbums/') || currentPath.startsWith('/family/'),
      });
    }

    appendPrivateAccessItem(container, {
      href: '/unlock/',
      label: 'Add code',
      active: currentPath.startsWith('/unlock/'),
    });

    appendPrivateAccessItem(container, {
      label: 'Sign out',
      onClick: (e) => { e.preventDefault(); signOut(); },
    });
  }

  fill(desktopMenu);
  fill(mobileMenu);
}

function closePrivateAccessDropdown() {
  const item = document.getElementById('nav-unlock-item');
  const trigger = document.getElementById('nav-unlock-trigger');
  const menu = document.getElementById('nav-private-menu');
  if (!item || !trigger || !menu) return;
  item.classList.remove('is-open');
  trigger.setAttribute('aria-expanded', 'false');
}

function openPrivateAccessDropdown() {
  const item = document.getElementById('nav-unlock-item');
  const trigger = document.getElementById('nav-unlock-trigger');
  const menu = document.getElementById('nav-private-menu');
  if (!item || !trigger || !menu) return;
  menu.hidden = false;
  item.classList.add('is-open');
  trigger.setAttribute('aria-expanded', 'true');
}

function initPrivateAccessDropdown() {
  const item = document.getElementById('nav-unlock-item');
  const trigger = document.getElementById('nav-unlock-trigger');
  const menu = document.getElementById('nav-private-menu');
  if (item && trigger && menu) {
    // Prefer class + CSS transition over [hidden]/display:none) so the menu can slide
    menu.hidden = false;

    const canHover = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (item.classList.contains('is-open')) closePrivateAccessDropdown();
      else openPrivateAccessDropdown();
    });

    item.addEventListener('mouseenter', () => {
      if (canHover()) openPrivateAccessDropdown();
    });
    item.addEventListener('mouseleave', () => {
      if (canHover()) closePrivateAccessDropdown();
    });

    document.addEventListener('click', (e) => {
      if (!item.contains(e.target)) closePrivateAccessDropdown();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePrivateAccessDropdown();
    });
  }

  const mobileTrigger = document.getElementById('mobile-private-trigger');
  const mobilePanel = document.getElementById('mobile-private-menu');
  if (mobileTrigger && mobilePanel) {
    mobileTrigger.addEventListener('click', () => {
      const isOpen = mobileTrigger.getAttribute('aria-expanded') === 'true';
      mobileTrigger.setAttribute('aria-expanded', String(!isOpen));
      mobilePanel.hidden = isOpen;
      mobileTrigger.classList.toggle('is-open', !isOpen);
    });
  }
}

// ── Sign out: clear all unlocked tiers + cached tokens, return home ──
function signOut() {
  if (typeof TierAuth !== 'undefined') TierAuth.clear();
  try {
    // Drop any cached Worker image tokens so private albums re-gate immediately
    Object.keys(sessionStorage)
      .filter(k => k.startsWith('worker_token_'))
      .forEach(k => sessionStorage.removeItem(k));
  } catch {}
  window.location.href = '/';
}

// ── Mobile menu toggle ──
function initMobileMenu() {
  const toggle = document.getElementById('menu-toggle');
  const mobileMenu = document.getElementById('mobile-menu');
  if (!toggle || !mobileMenu) return;

  const setOpen = (open) => {
    mobileMenu.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelectorAll('.bar').forEach(b => b.classList.toggle('active', open));
  };

  toggle.addEventListener('click', () => {
    setOpen(!mobileMenu.classList.contains('open'));
  });

  // Tap the dimmed backdrop (outside the sheet) to dismiss
  mobileMenu.addEventListener('click', (e) => {
    if (e.target === mobileMenu) setOpen(false);
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!toggle.contains(e.target) && !mobileMenu.contains(e.target)) {
      setOpen(false);
    }
  });
}

// ── Set active nav link based on current page ──
function setActiveNavLink() {
  const path = window.location.pathname.replace(/\/?$/, '/') || '/';
  let key = '';
  if (path === '/') key = 'home';
  else if (path.startsWith('/personal-work/') || path.startsWith('/gallery/')) key = 'gallery';
  else if (path.startsWith('/professional-work/')) key = 'professional';
  else if (path.startsWith('/familyalbums/') || path.startsWith('/family/')) key = 'unlock';
  else if (path.startsWith('/about/')) key = 'about';
  else if (path.startsWith('/unlock/')) key = 'unlock';
  else if (path.startsWith('/album/')) {
    const id = path.split('/').filter(Boolean)[1];
    const album = (typeof ALBUMS !== 'undefined') ? ALBUMS.find(a => a.id === id) : null;
    // Client albums live under Private Access — highlight that trigger.
    if (album && String(album.audience || '').startsWith('client:')) {
      key = 'unlock';
    } else {
      key = (album && album.portfolio === true) ? 'professional' : 'gallery';
    }
  }

  if (!key) return;
  document.querySelectorAll(`[data-nav-link][data-nav="${key}"]`).forEach(link => {
    link.classList.add('nav-active');
  });
}

// ── Intersection observer for fade-in animations ──
let fadeInObserver = null;

function observeFadeInElements(root) {
  if (!fadeInObserver) return;
  const scope = (root && root.querySelectorAll) ? root : document;
  scope.querySelectorAll('.fade-in:not(.visible)').forEach(el => fadeInObserver.observe(el));
}

function initScrollAnimations() {
  fadeInObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          fadeInObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );

  observeFadeInElements();
}

// ── R2 image URL helpers ──
// grid/ = 900px for album grid, admin, and curate previews
// view/ = ~2048px for lightbox (see viewUrl); originals are download-only
const R2_URL_RE = /^https:\/\/pub-[a-f0-9]+\.r2\.dev\/(.+)$/;

function gridUrl(fullUrl) {
  if (!fullUrl) return fullUrl;
  // Worker-proxied private image URL (/image?key=...): serve the grid/ variant
  // so thumbnails and lightbox previews load small files, not full-res originals.
  if (fullUrl.includes('/image?') && fullUrl.includes('key=')) {
    try {
      const u = new URL(fullUrl);
      const key = u.searchParams.get('key');
      if (key && !key.startsWith('grid/')) {
        u.searchParams.set('key', 'grid/' + key);
        return u.toString();
      }
    } catch { /* fall through */ }
    return fullUrl;
  }
  const m = fullUrl.match(/^(https:\/\/pub-[a-f0-9]+\.r2\.dev\/)(.+)$/);
  return m ? `${m[1]}grid/${m[2]}` : fullUrl;
}

function viewUrl(fullUrl) {
  if (!fullUrl) return fullUrl;
  if (fullUrl.includes('/image?') && fullUrl.includes('key=')) {
    try {
      const u = new URL(fullUrl);
      const key = u.searchParams.get('key');
      if (key && !key.startsWith('view/')) {
        u.searchParams.set('key', 'view/' + key);
        return u.toString();
      }
    } catch { /* fall through */ }
    return fullUrl;
  }
  const m = fullUrl.match(/^(https:\/\/pub-[a-f0-9]+\.r2\.dev\/)(.+)$/);
  return m ? `${m[1]}view/${m[2]}` : fullUrl;
}

// alias kept for admin/curate call sites
function thumbUrl(fullUrl) { return gridUrl(fullUrl); }

function getAlbumFilmSections(album) {
  if (!album) return [];
  if (album.filmSections?.length) return album.filmSections;
  if (album.filmPhotos?.length) {
    return [{ label: album.filmLabel || 'On film', photos: album.filmPhotos }];
  }
  return [];
}

// Drop the trailing film speed/ISO for compact nav chips:
// "Kodak Ultramax 400" -> "Kodak Ultramax", "Ilford FP4 Plus 125" -> "Ilford FP4 Plus".
function condenseFilmStock(label) {
  return (label || '').replace(/\s+\d+\s*$/, '').trim() || label;
}

function getAlbumSectionNavItems(album) {
  if (!album || album.type === 'group') return [];

  const items = [];
  const digitalPhotos = album.photos || [];
  const filmSections = getAlbumFilmSections(album);

  if (digitalPhotos.length && filmSections.length) {
    items.push({
      id: 'digital-section',
      label: album.digitalNavLabel || 'Digital',
    });
  }

  filmSections.forEach((section, index) => {
    // navLabel is the short jump-nav chip; label is the heading above the grid.
    // If navLabel is omitted, fall back to a condensed film-stock label (trailing
    // ISO dropped: "Kodak Ultramax 400" -> "Kodak Ultramax").
    items.push({
      id: `album-section-film-${index}`,
      label: section.navLabel
        || (section.label
          ? condenseFilmStock(section.label)
          : (filmSections.length > 1 ? `Film Roll ${index + 1}` : 'Film')),
    });
  });

  return items.length >= 2 ? items : [];
}

function getAlbumAllPhotos(album) {
  if (!album) return [];
  const digital = album.photos || [];
  if (album.filmSections?.length) {
    return [...digital, ...album.filmSections.flatMap(section => section.photos || [])];
  }
  return [...digital, ...(album.filmPhotos || [])];
}

function getAlbumPhotoCount(album) {
  return getAlbumAllPhotos(album).length;
}

function isEmptyAlbum(album) {
  return album.type !== 'group' && !getAlbumPhotoCount(album);
}

function isCompleteAlbum(album) {
  if (!album) return false;
  if (album.type === 'group') {
    return (album.subAlbums || []).some(subId => {
      const sub = ALBUMS.find(a => a.id === subId);
      return sub && getAlbumPhotoCount(sub) > 0;
    });
  }
  return getAlbumPhotoCount(album) > 0;
}

function albumYear(album) {
  if (!album?.date) return null;
  const years = album.date.match(/\b(20\d{2})\b/g);
  return years ? years[years.length - 1] : null;
}

const MONTH_SORT_ORDER = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** Sort key for chronological album order within a year (year×100 + month). */
function albumSortKey(album) {
  const date = (album?.date || '').toLowerCase();
  const yearMatch = date.match(/\b(20\d{2})\b/);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : 0;
  const monthMatch = date.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/
  );
  const month = monthMatch ? (MONTH_SORT_ORDER[monthMatch[1]] || 0) : 0;
  return year * 100 + month;
}

function compareAlbumsByDate(a, b) {
  return albumSortKey(a) - albumSortKey(b);
}

// Journal-style dateline: date only (e.g. "May 2026").
function albumDateline(album, { withDesc = false } = {}) {
  if (album.dateline === false) return '';
  if (album.dateline) return album.dateline;

  if (isEmptyAlbum(album)) {
    return withDesc ? '' : '(TBD)';
  }

  const parts = [];
  // Film-roll cards share stock names across trips — lead with place when set.
  if (album.albumKind === 'film-roll' && album.location) parts.push(album.location);
  if (album.date) parts.push(album.date);

  return parts.join(' · ');
}

function albumCardDesc(album) {
  if (isEmptyAlbum(album)) return album.description || '(TBD)';
  return album.description || '';
}

function albumCoverUrl(album) {
  const src = album?.coverImage || '';
  if (!src) return '';
  if (src.startsWith('/')) return src;
  if (/^https?:\/\//.test(src)) return gridUrl(src);
  return `/${src.replace(/^\.\/?/, '')}`;
}

// Catalog covers span most of the page, so the 900px grid/ variant upscales on
// high-DPI screens — use the ~2048px view/ tier instead.
function albumCoverUrlWide(album) {
  const src = album?.coverImage || '';
  if (!src) return '';
  if (src.startsWith('/')) return src;
  if (/^https?:\/\//.test(src)) return viewUrl(src);
  return `/${src.replace(/^\.\/?/, '')}`;
}

function albumPageUrl(album) {
  return Routes.albumPageUrl(album);
}

function albumPhotoUrl(album, photoUrl) {
  return Routes.albumPhotoUrl(album, photoUrl);
}

function isItalyAlbum(album) {
  if (!album) return false;
  if (album.id === 'italy-2026') return true;
  if (!album.parentId) return false;
  return isItalyAlbum(ALBUMS.find(a => a.id === album.parentId));
}

function getItalyNavSequence() {
  const root = ALBUMS.find(a => a.id === 'italy-2026');
  if (!root?.subAlbums) return [];

  return root.subAlbums.flatMap(id => {
    const album = ALBUMS.find(a => a.id === id && !a.hidden);
    if (!album) return [];
    if (album.type === 'group' && album.subAlbums?.length) {
      const rolls = album.subAlbums
        .map(subId => ALBUMS.find(a => a.id === subId && !a.hidden))
        .filter(Boolean);
      return [album, ...rolls];
    }
    return [album];
  });
}

// All non-Italy, non-family, non-hidden navigable albums in gallery display order,
// with group sub-albums expanded inline (same traversal as the gallery page).
function getGalleryNavSequence() {
  return ALBUMS
    .filter(a => !a.parentId && !a.hidden && a.id !== 'italy-2026' && !(a.audience || '').startsWith('family'))
    .flatMap(a => {
      if (a.type === 'group' && a.subAlbums?.length) {
        return a.subAlbums
          .map(id => ALBUMS.find(sub => sub.id === id && !sub.hidden))
          .filter(sub => sub && sub.type !== 'group' && sub.albumKind !== 'film-roll' && getAlbumPhotoCount(sub) > 0);
      }
      if (a.type !== 'group' && a.albumKind !== 'film-roll' && getAlbumPhotoCount(a) > 0) return [a];
      return [];
    });
}

function getNextAlbum(album) {
  const italySeq = getItalyNavSequence();
  const italyIdx = italySeq.findIndex(a => a.id === album.id);
  if (italyIdx !== -1) {
    // Within Italy: advance to next city; at the end, hand off to the gallery sequence
    if (italyIdx < italySeq.length - 1) return italySeq[italyIdx + 1];
    return getGalleryNavSequence()[0] || null;
  }

  // Within the public gallery: advance to the next album; stop at the last
  const gallerySeq = getGalleryNavSequence();
  const galleryIdx = gallerySeq.findIndex(a => a.id === album.id);
  if (galleryIdx !== -1 && galleryIdx < gallerySeq.length - 1) {
    return gallerySeq[galleryIdx + 1];
  }

  return null;
}

// Sibling photo albums within the same parent group, in the group's subAlbums
// order. Generic (driven by parentId/subAlbums), so any trip gets it for free.
// Excludes hidden albums, nested groups, film-roll sub-albums, and empties.
// The current album is included so callers can mark it active. Siblings share
// the parent group, so its password gate (already enforced on this page) covers
// them too — no locked-group exposure.
function getSiblingAlbums(album) {
  if (!album?.parentId) return [];
  const parent = ALBUMS.find(a => a.id === album.parentId);
  if (!parent?.subAlbums?.length) return [];
  return parent.subAlbums
    .map(id => ALBUMS.find(a => a.id === id))
    .filter(a => a && !a.hidden && a.type !== 'group'
      && a.albumKind !== 'film-roll' && getAlbumPhotoCount(a) > 0);
}

function getGroupFilmRollAlbums(groupId) {
  return getFilmRollAlbums(groupId);
}

function getFilmRollAlbums(parentId) {
  const cameraOrder = ['Minolta X-700', "Athena's Pentax 17"];
  return ALBUMS
    .filter(a => a.parentId === parentId && a.albumKind === 'film-roll')
    .sort((a, b) => {
      const cameraDiff = cameraOrder.indexOf(a.camera) - cameraOrder.indexOf(b.camera);
      if (cameraDiff !== 0) return cameraDiff;
      return (a.rollNumber || 0) - (b.rollNumber || 0);
    });
}

function isFilmRollAlbum(album) {
  return album?.albumKind === 'film-roll';
}

/** Trip/place album a film roll belongs to (explicit tripAlbumId, or trip parent). */
function getFilmRollTripAlbum(album) {
  if (!isFilmRollAlbum(album)) return null;
  if (album.tripAlbumId) {
    return ALBUMS.find(a => a.id === album.tripAlbumId) || null;
  }
  if (!album.parentId) return null;
  const parent = ALBUMS.find(a => a.id === album.parentId);
  if (parent?.type === 'group' && parent.id !== 'misc-film-rolls-2026') return parent;
  return null;
}

function filmRollLinkLabel(roll) {
  if (!roll) return '';
  if (roll.camera && roll.filmStock && roll.rollNumber) {
    return `${roll.camera} - Roll ${roll.rollNumber} - ${roll.filmStock}`;
  }
  return roll.shortTitle || roll.title || '';
}

function filmRollPageTitle(roll) {
  if (!roll) return '';
  if (roll.filmStock && roll.rollNumber) {
    return `Roll ${roll.rollNumber} - ${roll.filmStock}`;
  }
  return roll.title || '';
}

function albumDisplayTitle(album) {
  if (isFilmRollAlbum(album)) return filmRollPageTitle(album);
  return album?.title || '';
}

function renderFilmRollLinks(parentAlbum) {
  const rolls = getFilmRollAlbums(parentAlbum?.id);
  const section = document.getElementById('film-roll-section');
  const list = document.getElementById('film-roll-links');
  const desc = document.getElementById('film-roll-desc');
  if (!rolls.length || !section || !list) return;

  if (desc) {
    desc.textContent = parentAlbum?.filmRollsDesc || '';
    desc.hidden = !parentAlbum?.filmRollsDesc;
  }

  list.innerHTML = '';
  rolls.forEach(roll => {
    const link = document.createElement('a');
    link.href = albumPageUrl(roll);
    link.className = 'group-film-roll-card';

    // Split the long "Camera - Roll N - Stock" label into a two-line card:
    // camera as a small muted eyebrow, roll + stock as the title.
    const name = (roll.filmStock && roll.rollNumber)
      ? `Roll ${roll.rollNumber} · ${roll.filmStock}`
      : (roll.shortTitle || roll.title || '');
    if (roll.camera) {
      const camera = document.createElement('span');
      camera.className = 'group-film-roll-camera';
      camera.textContent = roll.camera;
      link.appendChild(camera);
    }
    const title = document.createElement('span');
    title.className = 'group-film-roll-name';
    title.textContent = name || filmRollLinkLabel(roll);
    link.appendChild(title);

    list.appendChild(link);
  });

  section.hidden = false;
  section.classList.add('visible');
}

// Preload images for lightbox — grid first on slow links, view/ upgrades in background
const ImagePreload = {
  _cache: new Map(),
  _loaded: new Set(),

  isLoaded(url) {
    return !!url && this._loaded.has(url);
  },

  isSlowConnection() {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return false;
    if (conn.saveData) return true;
    const type = conn.effectiveType;
    return type === 'slow-2g' || type === '2g' || type === '3g';
  },

  load(url) {
    if (!url || this._cache.has(url)) return this._cache.get(url);
    const p = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        this._loaded.add(url);
        resolve(img);
      };
      img.onerror = reject;
      img.src = url;
    });
    this._cache.set(url, p);
    return p;
  },

  preloadAdjacent(urls, index, radius = 3) {
    const slow = this.isSlowConnection();
    const r = slow ? 1 : radius;
    const order = [];
    for (let o = 1; o <= r; o++) {
      if (index + o < urls.length) order.push(index + o);
      if (index - o >= 0) order.push(index - o);
    }
    for (const i of order) {
      const u = urls[i];
      this.load(gridUrl(u)).catch(() => {});
      if (!slow) this.load(viewUrl(u)).catch(() => {});
    }
  },

  async apply(imgEl, src, { awaitDecode = true } = {}) {
    await this.load(src);
    if (imgEl.src !== src) imgEl.src = src;
    if (!imgEl.complete) {
      await new Promise((resolve, reject) => {
        imgEl.onload = () => resolve();
        imgEl.onerror = reject;
      });
    }
    if (awaitDecode) {
      try { await imgEl.decode(); } catch (_) {}
    }
  },

  // Set src immediately for instant layer swap; load/decode continues in background.
  applyInstant(imgEl, src) {
    if (!src) return;
    if (imgEl.src !== src) imgEl.src = src;
    this.load(src).catch(() => {});
  },

  // Load into imgEl and wait until it can paint — avoids flashing stale double-buffer frames.
  async prepareLayer(imgEl, src) {
    if (!src) return;
    await this.load(src);
    if (imgEl.src !== src) imgEl.src = src;
    if (!imgEl.complete || !imgEl.naturalWidth) {
      await new Promise((resolve) => {
        imgEl.onload = () => resolve();
        imgEl.onerror = () => resolve();
      });
    }
    try { await imgEl.decode(); } catch (_) {}
  },

  // Reuse an already-rendered grid thumb when opening the lightbox (instant on tap).
  async applyFromThumb(imgEl, thumbImg, fallbackSrc) {
    if (thumbImg?.complete && thumbImg.naturalWidth) {
      if (imgEl.src !== thumbImg.src) imgEl.src = thumbImg.src;
      this._loaded.add(thumbImg.src);
      try { await imgEl.decode(); } catch (_) {}
      return;
    }
    await this.apply(imgEl, fallbackSrc);
  },
};

// ── Session-based album unlock store (legacy per-album gating) ──
const AlbumAuth = {
  key: 'unlocked_albums',

  isUnlocked(albumId) {
    try {
      const unlocked = JSON.parse(sessionStorage.getItem(this.key) || '[]');
      return unlocked.includes(albumId);
    } catch {
      return false;
    }
  },

  unlock(albumId) {
    try {
      const unlocked = JSON.parse(sessionStorage.getItem(this.key) || '[]');
      if (!unlocked.includes(albumId)) {
        unlocked.push(albumId);
        sessionStorage.setItem(this.key, JSON.stringify(unlocked));
      }
    } catch {}
  },
};

// ── Tier-based access store ──────────────────────────────────────────────────
// Tracks which audience tiers (family / client:x) have been unlocked
// via the shared unlock modal. Stored in sessionStorage so it clears on tab close.
// "Remember me" (localStorage) is opt-in, set in the unlock flow.
const TierAuth = {
  _sessionKey: 'unlocked_tiers',
  _localKey:   'unlocked_tiers_persist',

  // Return the set of currently granted audiences
  grantedTiers() {
    try {
      const session = JSON.parse(sessionStorage.getItem(this._sessionKey) || '[]');
      const persist = JSON.parse(localStorage.getItem(this._localKey)   || '[]');
      return new Set([...session, ...persist]);
    } catch {
      return new Set();
    }
  },

  // Does the viewer have access to this audience?
  // Rules: 'public' (and legacy 'friends') always granted.
  // Legacy family sub-tiers still grant family until users re-unlock.
  canAccess(audience) {
    if (!audience || audience === 'public' || audience === 'friends') return true;
    const tiers = this.grantedTiers();
    if (tiers.has(audience)) return true;
    const hasLegacyFamily = tiers.has('family:anger-ali') || tiers.has('family:fernando');
    if (hasLegacyFamily && audience === 'family') return true;
    return false;
  },

  // Grant a list of audiences (e.g. ['family'])
  grant(audiences, persist = false) {
    try {
      const session = JSON.parse(sessionStorage.getItem(this._sessionKey) || '[]');
      const merged = [...new Set([...session, ...audiences])];
      sessionStorage.setItem(this._sessionKey, JSON.stringify(merged));

      if (persist) {
        const local = JSON.parse(localStorage.getItem(this._localKey) || '[]');
        const mergedLocal = [...new Set([...local, ...audiences])];
        localStorage.setItem(this._localKey, JSON.stringify(mergedLocal));

        // Mirror the password hashes for these audiences into localStorage so a
        // remembered login can still exchange them for a Worker token in a fresh
        // session (otherwise private images fall back to non-existent public URLs).
        const sessHashes = JSON.parse(sessionStorage.getItem('tier_hashes') || '{}');
        const persistHashes = JSON.parse(localStorage.getItem('tier_hashes_persist') || '{}');
        for (const a of audiences) {
          if (sessHashes[a]) persistHashes[a] = sessHashes[a];
        }
        localStorage.setItem('tier_hashes_persist', JSON.stringify(persistHashes));
      }
    } catch {}
  },

  // Clear all tiers (sign out)
  clear() {
    try {
      sessionStorage.removeItem(this._sessionKey);
      localStorage.removeItem(this._localKey);
      sessionStorage.removeItem('tier_hashes');
      localStorage.removeItem('tier_hashes_persist');
    } catch {}
  },

  // Try to unlock via a password. Returns the granted audiences array, or null.
  // Checks PASSWORD_TIERS first, then falls back to Worker D1 access codes
  // (used for client:<name> codes created in /admin/).
  async tryUnlock(password) {
    if (typeof hashPassword !== 'function') return null;
    const hash = await hashPassword(password);
    const tiers = (typeof PASSWORD_TIERS !== 'undefined') ? PASSWORD_TIERS : {};
    let audiences = tiers[hash] || null;

    if (!audiences) {
      const workerBase = (typeof WORKER_BASE_URL !== 'undefined') ? WORKER_BASE_URL : '';
      if (workerBase) {
        try {
          const resp = await fetch(`${workerBase}/unlock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hash }),
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data.tier) {
              audiences = [data.tier];
              // Cache the Worker token so the album page can load private images immediately.
              try {
                sessionStorage.setItem(
                  `worker_token_${data.tier}`,
                  JSON.stringify({
                    token: data.token,
                    expiresAt: data.expiresAt,
                    workerBase,
                  }),
                );
              } catch {}
            }
          }
        } catch {}
      }
    }

    if (audiences) {
      // Persist hash keyed by audience so album pages can exchange it for a Worker token
      try {
        const stored = JSON.parse(sessionStorage.getItem('tier_hashes') || '{}');
        for (const a of audiences) stored[a] = hash;
        sessionStorage.setItem('tier_hashes', JSON.stringify(stored));
      } catch {}
    }
    return audiences;
  },

  // Retrieve the stored password hash for a given audience (for Worker token exchange).
  getHash(audience) {
    try {
      const session = JSON.parse(sessionStorage.getItem('tier_hashes') || '{}');
      const persist = JSON.parse(localStorage.getItem('tier_hashes_persist') || '{}');
      const stored = { ...persist, ...session };
      return stored[audience] || stored['family'] || stored['family:fernando'] || stored['family:anger-ali'] || null;
    } catch { return null; }
  },
};

/**
 * Horizontal film-strip carousel — one row of full-height frames the visitor
 * swipes or arrows through. Uses native overflow scrolling plus scroll-snap so
 * touch, trackpad, and keyboard all work without a slider library.
 */
function renderPhotoFilmstrip(trackEl, urls, {
  alt = '',
  eagerCount = 4,
  prevBtn = null,
  nextBtn = null,
  railEl = null,
  thumbEl = null,
} = {}) {
  if (!trackEl || !urls?.length) return;

  trackEl.innerHTML = '';

  urls.forEach((url, i) => {
    const item = document.createElement('div');
    item.className = 'strip-item';
    // Placeholder ratio keeps the strip from reflowing wildly as frames arrive.
    item.style.aspectRatio = '3 / 2';

    const img = document.createElement('img');
    img.src = typeof gridUrl === 'function' ? gridUrl(url) : url;
    img.alt = alt;
    img.loading = i < eagerCount ? 'eager' : 'lazy';
    img.decoding = 'async';
    img.draggable = false;
    img.addEventListener('load', () => {
      if (img.naturalWidth && img.naturalHeight) {
        item.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
      }
      img.classList.add('loaded');
      trackEl._stripSync?.();
    }, { once: true });

    item.appendChild(img);
    trackEl.appendChild(item);
  });

  const MIN_THUMB = 44;
  const maxScroll = () => trackEl.scrollWidth - trackEl.clientWidth;
  // How far the thumb itself can travel, which is what pointer deltas map onto.
  const thumbRange = () => (railEl && thumbEl ? railEl.clientWidth - thumbEl.offsetWidth : 0);

  trackEl._stripSync = () => {
    const max = maxScroll();
    const scrollable = max > 4;
    if (prevBtn) prevBtn.hidden = !scrollable;
    if (nextBtn) nextBtn.hidden = !scrollable;
    if (railEl) railEl.hidden = !scrollable;
    if (!scrollable) return;
    if (prevBtn) prevBtn.disabled = trackEl.scrollLeft <= 2;
    if (nextBtn) nextBtn.disabled = trackEl.scrollLeft >= max - 2;
    if (!railEl || !thumbEl) return;

    // Thumb width is the share of the strip on screen; its offset is how far in you are.
    const railWidth = railEl.clientWidth;
    const shown = trackEl.clientWidth / trackEl.scrollWidth;
    const thumbWidth = Math.max(Math.round(shown * railWidth), MIN_THUMB);
    const progress = Math.min(Math.max(trackEl.scrollLeft / max, 0), 1);
    thumbEl.style.width = `${thumbWidth}px`;
    thumbEl.style.transform = `translateX(${progress * (railWidth - thumbWidth)}px)`;
    thumbEl.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
    thumbEl.setAttribute('aria-valuetext', `${Math.round(shown * 100)}% of the photos shown`);
  };

  if (!trackEl._stripBound) {
    trackEl._stripBound = true;
    const sync = () => trackEl._stripSync?.();
    const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const page = dir => {
      trackEl.scrollBy({
        left: dir * trackEl.clientWidth * 0.8,
        behavior: reduced() ? 'auto' : 'smooth',
      });
    };
    trackEl.addEventListener('scroll', sync, { passive: true });
    new ResizeObserver(sync).observe(trackEl);
    prevBtn?.addEventListener('click', () => page(-1));
    nextBtn?.addEventListener('click', () => page(1));

    if (railEl && thumbEl) {
      let dragFrom = null;

      const setScrubbing = on => {
        // Smooth scrolling and snapping both fight a drag, so they pause mid-scrub.
        trackEl.classList.toggle('is-scrubbing', on);
        railEl.classList.toggle('is-scrubbing', on);
      };

      thumbEl.addEventListener('pointerdown', e => {
        const range = thumbRange();
        if (range <= 0) return;
        dragFrom = { x: e.clientX, scrollLeft: trackEl.scrollLeft, range };
        thumbEl.setPointerCapture(e.pointerId);
        setScrubbing(true);
        e.preventDefault();
      });

      thumbEl.addEventListener('pointermove', e => {
        if (!dragFrom) return;
        const delta = (e.clientX - dragFrom.x) / dragFrom.range;
        trackEl.scrollLeft = dragFrom.scrollLeft + delta * maxScroll();
      });

      const endDrag = e => {
        if (!dragFrom) return;
        dragFrom = null;
        if (thumbEl.hasPointerCapture?.(e.pointerId)) thumbEl.releasePointerCapture(e.pointerId);
        setScrubbing(false);
      };
      thumbEl.addEventListener('pointerup', endDrag);
      thumbEl.addEventListener('pointercancel', endDrag);

      // Clicking the bare rail jumps the thumb's centre to the pointer.
      railEl.addEventListener('pointerdown', e => {
        if (dragFrom || e.target === thumbEl) return;
        const range = thumbRange();
        if (range <= 0) return;
        const offset = e.clientX - railEl.getBoundingClientRect().left - thumbEl.offsetWidth / 2;
        const clamped = Math.min(Math.max(offset, 0), range);
        trackEl.scrollTo({
          left: (clamped / range) * maxScroll(),
          behavior: reduced() ? 'auto' : 'smooth',
        });
      });

      thumbEl.addEventListener('keydown', e => {
        const jump = { ArrowLeft: () => page(-1), ArrowRight: () => page(1) }[e.key];
        if (!jump) return;
        jump();
        e.preventDefault();
      });
    }
  }

  requestAnimationFrame(() => trackEl._stripSync?.());
}

/**
 * Flickr-style justified highlight grid (preserves aspect ratios, fills rows).
 * Requires /js/justified-layout.js loaded before this file.
 */
function renderJustifiedPhotoGrid(gridEl, urls, { alt = '', eagerCount = 6 } = {}) {
  if (!gridEl || !urls?.length) return;
  if (typeof justifiedLayout !== 'function') {
    console.warn('[renderJustifiedPhotoGrid] justifiedLayout missing — load /js/justified-layout.js');
    return;
  }

  gridEl.classList.add('photo-grid');
  gridEl.innerHTML = '';

  urls.forEach((url, i) => {
    const thumb = document.createElement('div');
    thumb.className = 'photo-thumb';
    thumb.style.cursor = 'default';
    const img = document.createElement('img');
    img.src = typeof gridUrl === 'function' ? gridUrl(url) : url;
    img.alt = alt;
    img.loading = i < eagerCount ? 'eager' : 'lazy';
    img.decoding = 'async';
    img.addEventListener('load', () => {
      img.classList.add('loaded');
      runLayout();
    });
    thumb.appendChild(img);
    gridEl.appendChild(thumb);
  });

  function runLayout() {
    const items = Array.from(gridEl.querySelectorAll('.photo-thumb'));
    if (!items.length || !gridEl.offsetWidth) return;

    const aspectRatios = items.map(item => {
      const img = item.querySelector('img');
      if (img?.naturalWidth && img.naturalHeight) {
        return img.naturalWidth / img.naturalHeight;
      }
      return 1.5;
    });

    const layout = justifiedLayout(aspectRatios, {
      containerWidth: gridEl.offsetWidth,
      targetRowHeight: window.innerWidth <= 640 ? 175 : window.innerWidth <= 1024 ? 235 : 300,
      boxSpacing: window.innerWidth <= 640 ? 6 : 10,
      containerPadding: 0,
    });

    gridEl.style.height = layout.containerHeight + 'px';
    items.forEach((item, i) => {
      const box = layout.boxes[i];
      if (!box) return;
      item.style.left = box.left + 'px';
      item.style.top = box.top + 'px';
      item.style.width = box.width + 'px';
      item.style.height = box.height + 'px';
    });
  }

  if (!gridEl._highlightLayoutBound) {
    gridEl._highlightLayoutBound = true;
    new ResizeObserver(() => runLayout()).observe(gridEl);
  }

  requestAnimationFrame(runLayout);
}

// ── Init on DOM ready ──
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initMobileMenu();
  setActiveNavLink();
  initScrollAnimations();
});
