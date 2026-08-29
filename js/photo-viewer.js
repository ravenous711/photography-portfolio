// ── Shared lightweight photo viewer ──
// Opens carousel frames on pages that have no album lightbox of their own
// (group pages, professional work). The album page keeps its own full lightbox
// with zoom, downloads and favorites; this one is deliberately just the photo,
// navigation, and a way through to the album the photo came from.
//
// Requires /js/main.js (ImagePreload, gridUrl, viewUrl, findAlbumForPhoto) and
// /js/routes.js to be loaded first.

// eslint-disable-next-line no-unused-vars
const PhotoViewer = (() => {
  const CHROME_IDLE_MS = 2600;
  const SWIPE_MIN_PX = 45;

  let root = null;
  let stage = null;
  let layers = [];
  let counterEl = null;
  let albumLink = null;
  let prevBtn = null;
  let nextBtn = null;

  let photos = [];
  let index = 0;
  let activeLayer = 0;
  let generation = 0;
  let options = {};
  let isOpen = false;
  let scrollLockY = 0;
  let chromeTimer = null;

  function svg(paths, size = 16) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">${paths}</svg>`;
  }

  function build() {
    if (root) return;

    root = document.createElement('div');
    root.id = 'photo-viewer';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Photo viewer');
    root.innerHTML = `
      <div class="pv-meta">
        <span class="pv-counter" id="pv-counter"></span>
      </div>
      <div class="pv-actions">
        <a class="pv-album-link" id="pv-album-link" hidden></a>
        <button type="button" class="lightbox-action-btn" id="pv-close" aria-label="Close viewer">
          ${svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>')}
        </button>
      </div>
      <div class="pv-shell">
        <div class="pv-stage" id="pv-stage">
          <img class="pv-layer" alt="" />
          <img class="pv-layer" alt="" />
        </div>
        <div class="lightbox-tap-prev" id="pv-tap-prev" aria-hidden="true"></div>
        <div class="lightbox-tap-next" id="pv-tap-next" aria-hidden="true"></div>
        <button type="button" class="lightbox-nav lightbox-nav--desktop" id="pv-prev" aria-label="Previous photo">
          ${svg('<path d="M15 18l-6-6 6-6"/>')}
        </button>
        <button type="button" class="lightbox-nav lightbox-nav--desktop" id="pv-next" aria-label="Next photo">
          ${svg('<path d="M9 18l6-6-6-6"/>')}
        </button>
      </div>
    `;
    document.body.appendChild(root);

    stage = root.querySelector('#pv-stage');
    layers = Array.from(root.querySelectorAll('.pv-layer'));
    counterEl = root.querySelector('#pv-counter');
    albumLink = root.querySelector('#pv-album-link');
    prevBtn = root.querySelector('#pv-prev');
    nextBtn = root.querySelector('#pv-next');

    root.querySelector('#pv-close').addEventListener('click', close);
    prevBtn.addEventListener('click', () => nav(-1));
    nextBtn.addEventListener('click', () => nav(1));
    root.querySelector('#pv-tap-prev').addEventListener('click', () => nav(-1));
    root.querySelector('#pv-tap-next').addEventListener('click', () => nav(1));

    // Click the letterboxed area around the photo to dismiss. The layers are
    // pointer-events: none, so anything that reaches the shell is empty space.
    root.addEventListener('click', (e) => {
      if (e.target.closest('.lightbox-action-btn, .lightbox-nav, .pv-album-link, .lightbox-tap-prev, .lightbox-tap-next')) return;
      if (isPointOnPhoto(e.clientX, e.clientY)) return;
      close();
    });

    bindSwipe();

    ['pointermove', 'pointerdown', 'touchstart', 'wheel'].forEach(type => {
      root.addEventListener(type, wakeChrome, { passive: true });
    });

    document.addEventListener('keydown', onKeydown, true);
  }

  // Hit-test the painted photo so clicks on the empty margin can close, while
  // clicks on the picture itself do nothing.
  function isPointOnPhoto(x, y) {
    const img = layers[activeLayer];
    if (!img || !img.naturalWidth) return false;
    const box = img.getBoundingClientRect();
    const scale = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    const left = box.left + (box.width - w) / 2;
    const top = box.top + (box.height - h) / 2;
    return x >= left && x <= left + w && y >= top && y <= top + h;
  }

  function bindSwipe() {
    let startX = 0;
    let startY = 0;
    let tracking = false;

    stage.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) { tracking = false; return; }
      tracking = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });

    stage.addEventListener('touchend', (e) => {
      if (!tracking) return;
      tracking = false;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy)) return;
      nav(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  function onKeydown(e) {
    if (!isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      nav(e.key === 'ArrowRight' ? 1 : -1);
      return;
    }
    wakeChrome();
  }

  function wakeChrome() {
    if (!root) return;
    root.classList.remove('chrome-hidden');
    clearTimeout(chromeTimer);
    chromeTimer = setTimeout(() => {
      if (isOpen) root.classList.add('chrome-hidden');
    }, CHROME_IDLE_MS);
  }

  function lockScroll() {
    scrollLockY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollLockY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
  }

  function unlockScroll() {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    window.scrollTo(0, scrollLockY);
  }

  /** Where the current photo lives, and whether this visitor may follow it. */
  function resolveTarget(url) {
    if (options.resolveTarget) return options.resolveTarget(url);
    if (typeof findAlbumForPhoto !== 'function' || typeof Routes === 'undefined') return null;

    const album = findAlbumForPhoto(url, {
      preferParentId: options.preferParentId,
      preferAlbumId: options.preferAlbumId,
    });
    if (!album || album.id === options.currentAlbumId) return null;
    if (typeof canOpenAlbum === 'function' && !canOpenAlbum(album)) return null;

    const title = (typeof albumDisplayTitle === 'function') ? albumDisplayTitle(album) : album.title;
    return {
      href: Routes.albumPhotoGridUrl(album, url),
      label: title ? `View in ${title}` : 'View in album',
    };
  }

  function updateAlbumLink(url) {
    if (!albumLink) return;
    const target = resolveTarget(url);
    if (!target) {
      albumLink.hidden = true;
      albumLink.removeAttribute('href');
      return;
    }
    albumLink.hidden = false;
    albumLink.href = target.href;
    albumLink.innerHTML = `<span>${target.label}</span>${svg('<path d="M5 12h14M12 5l7 7-7 7"/>', 14)}`;
  }

  function syncUrl(i) {
    if (!options.syncUrl || typeof Routes === 'undefined') return;
    const url = new URL(window.location.href);
    if (i >= 0 && i < photos.length) {
      url.searchParams.set('photo', Routes.photoFilename(photos[i]));
    } else {
      url.searchParams.delete('photo');
    }
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  async function paint(i, gen) {
    const url = photos[i];
    if (!url) return;

    const small = (typeof gridUrl === 'function') ? gridUrl(url) : url;
    const large = (typeof viewUrl === 'function') ? viewUrl(url) : url;
    const nextLayerIndex = 1 - activeLayer;
    const nextImg = layers[nextLayerIndex];
    const currentImg = layers[activeLayer];
    const stillCurrent = () => isOpen && index === i && gen === generation;

    const instantSrc = ImagePreload.isLoaded(large) ? large : small;

    await ImagePreload.prepareLayer(nextImg, instantSrc);
    if (!stillCurrent()) return;

    nextImg.classList.add('active');
    currentImg.classList.remove('active');
    currentImg.src = '';
    activeLayer = nextLayerIndex;

    if (instantSrc !== large) {
      ImagePreload.load(large).then(async () => {
        if (!stillCurrent()) return;
        await ImagePreload.apply(layers[activeLayer], large);
      }).catch(() => {});
    }

    ImagePreload.preloadAdjacent(photos, i, 2);
  }

  function show(i) {
    index = i;
    generation += 1;

    const alt = options.alt ? `${options.alt} — photo ${i + 1}` : `Photo ${i + 1}`;
    layers.forEach(layer => { layer.alt = alt; });
    counterEl.textContent = `${i + 1}/${photos.length}`;
    prevBtn.classList.toggle('is-unavailable', i === 0);
    nextBtn.classList.toggle('is-unavailable', i === photos.length - 1);

    updateAlbumLink(photos[i]);
    syncUrl(i);
    paint(i, generation);
  }

  function nav(dir) {
    const next = index + dir;
    if (next < 0 || next >= photos.length) return;
    wakeChrome();
    show(next);
  }

  function open({ photos: list, index: start = 0, ...rest } = {}) {
    const urls = (list || []).filter(Boolean);
    if (!urls.length) return;

    build();
    photos = urls;
    options = rest;
    isOpen = true;

    document.activeElement?.blur();
    root.classList.add('open');
    lockScroll();
    wakeChrome();
    show(Math.min(Math.max(start, 0), photos.length - 1));
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    generation += 1;
    clearTimeout(chromeTimer);
    root.classList.remove('open', 'chrome-hidden');
    layers.forEach(layer => {
      layer.classList.remove('active');
      layer.src = '';
    });
    activeLayer = 0;
    syncUrl(-1);
    unlockScroll();
  }

  return {
    open,
    close,
    isOpen: () => isOpen,
  };
})();
