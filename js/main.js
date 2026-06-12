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
    items.push({
      id: `album-section-film-${index}`,
      label: section.navLabel || (filmSections.length > 1 ? `Film Roll ${index + 1}` : (section.label || 'Film')),
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

// Preload full-res images for instant lightbox navigation
const ImagePreload = {
  _cache: new Map(),

  load(url) {
    if (!url || this._cache.has(url)) return this._cache.get(url);
    const p = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    this._cache.set(url, p);
    return p;
  },

  preloadAdjacent(urls, index, radius = 3) {
    for (let o = -radius; o <= radius; o++) {
      const i = index + o;
      if (i >= 0 && i < urls.length) {
        const u = urls[i];
        this.load(u).catch(() => {});
        this.load(gridUrl(u)).catch(() => {});
      }
    }
  },

  async apply(imgEl, src) {
    await this.load(src);
    imgEl.src = src;
    if (!imgEl.complete) {
      await new Promise((resolve, reject) => {
        imgEl.onload = () => resolve();
        imgEl.onerror = reject;
      });
    }
    try { await imgEl.decode(); } catch (_) {}
  },
};

// ── Site-wide password gate ──
const SiteAuth = {
  key: 'site_unlocked',

  isUnlocked() {
    return sessionStorage.getItem(this.key) === 'true';
  },

  unlock() {
    sessionStorage.setItem(this.key, 'true');
  },

  // Call on every protected page — redirects to login.html if not unlocked
  guard() {
    if (!this.isUnlocked()) {
      const returnTo = encodeURIComponent(window.location.href);
      window.location.replace(`login.html?return=${returnTo}`);
    }
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
