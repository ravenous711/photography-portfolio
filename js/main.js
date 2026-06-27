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
}

// ── Mobile menu toggle ──
function initMobileMenu() {
  const toggle = document.getElementById('menu-toggle');
  const mobileMenu = document.getElementById('mobile-menu');
  if (!toggle || !mobileMenu) return;

  toggle.addEventListener('click', () => {
    const isOpen = mobileMenu.classList.contains('open');
    mobileMenu.classList.toggle('open', !isOpen);
    toggle.setAttribute('aria-expanded', String(!isOpen));

    // Toggle hamburger ↔ close icon
    const bars = toggle.querySelectorAll('.bar');
    bars.forEach(b => b.classList.toggle('active'));
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!toggle.contains(e.target) && !mobileMenu.contains(e.target)) {
      mobileMenu.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.querySelectorAll('.bar').forEach(b => b.classList.remove('active'));
    }
  });
}

// ── Set active nav link based on current page ──
function setActiveNavLink() {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('[data-nav-link]').forEach(link => {
    const href = link.getAttribute('href');
    if (href && (href === page || (page === '' && href === 'index.html'))) {
      link.classList.add('nav-active');
    }
  });
}

// ── Intersection observer for fade-in animations ──
function initScrollAnimations() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );

  document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
}

// ── R2 image URL helpers ──
// grid/ = 1200px for album grid, admin, and curate previews (lightbox uses full-res)
const R2_URL_RE = /^https:\/\/pub-[a-f0-9]+\.r2\.dev\/(.+)$/;

function gridUrl(fullUrl) {
  const m = fullUrl.match(/^(https:\/\/pub-[a-f0-9]+\.r2\.dev\/)(.+)$/);
  return m ? `${m[1]}grid/${m[2]}` : fullUrl;
}

// alias kept for admin/curate call sites
function thumbUrl(fullUrl) { return gridUrl(fullUrl); }

// Journal-style dateline: "Venice · May 2026 · 95 frames"
function locationMatchesTitle(album) {
  if (!album.location || !album.title) return false;
  const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  return norm(album.location) === norm(album.title);
}

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
    // Inside a city album, label film sections by their film stock (section.label,
    // e.g. "Kodak Portra 160") so the jump-nav is self-explanatory. Trip-wide roll
    // numbers (navLabel, "Film Roll 3") only make sense on the group film index,
    // not within a single city. The trailing ISO is dropped to keep the chips
    // compact ("Kodak Ultramax 400" -> "Kodak Ultramax").
    items.push({
      id: `album-section-film-${index}`,
      label: section.label
        ? condenseFilmStock(section.label)
        : (section.navLabel || (filmSections.length > 1 ? `Film Roll ${index + 1}` : 'Film')),
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

function albumDateline(album, { withDesc = false } = {}) {
  if (album.dateline) return album.dateline;

  if (isEmptyAlbum(album)) {
    return withDesc ? '' : '(TBD)';
  }

  const parts = [];
  // Skip location when the title already names the place (e.g. "Venice", "Italy 2026")
  if (album.type !== 'group' && album.location && !locationMatchesTitle(album)) {
    parts.push(album.location);
  }
  if (album.date) parts.push(album.date);

  if (album.type === 'group' && album.subAlbums?.length) {
    parts.push(`${album.subAlbums.length} albums`);
  } else {
    const count = getAlbumPhotoCount(album);
    if (count) parts.push(`${count} frames`);
  }

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

function getNextAlbum(album) {
  if (!isItalyAlbum(album)) return null;
  const sequence = getItalyNavSequence();
  const index = sequence.findIndex(a => a.id === album.id);
  if (index === -1 || index >= sequence.length - 1) return null;
  return sequence[index + 1];
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

// Preload images for lightbox — grid first on slow links, full-res upgrades in background
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
      if (!slow) this.load(u).catch(() => {});
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

  // Show grid immediately, then swap to full-res once it finishes downloading.
  async showProgressive(imgEl, fullResUrl, gridSrc, { isCurrent } = {}) {
    const stillCurrent = () => !isCurrent || isCurrent();

    if (this.isLoaded(fullResUrl)) {
      await this.apply(imgEl, fullResUrl);
      return 'full';
    }

    try {
      await this.apply(imgEl, gridSrc);
    } catch {
      try {
        await this.apply(imgEl, fullResUrl);
        return 'full';
      } catch {
        return 'error';
      }
    }

    if (!stillCurrent()) return 'grid';

    this.load(fullResUrl).then(async () => {
      if (!stillCurrent()) return;
      await this.apply(imgEl, fullResUrl);
    }).catch(() => {});

    return 'grid';
  },
};

// ── Session-based album unlock store ──
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

// ── Init on DOM ready ──
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initMobileMenu();
  setActiveNavLink();
  initScrollAnimations();
});
