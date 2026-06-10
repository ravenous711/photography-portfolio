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

// ── Navigation: transparent → opaque on scroll ──
function initNav() {
  const nav = document.getElementById('main-nav');
  if (!nav) return;

  const updateNav = () => {
    if (window.scrollY > 60) {
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
