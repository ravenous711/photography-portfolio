// ============================================================
// layout-editor.js — on-site layout editor (admin only)
// ============================================================
// Lets the logged-in admin drag, star and remove photos while looking at the
// real trip / location page. Save -> POST /api/admin-layout -> one GitHub commit
// (or a local file write in dev). Visitors never see any of this: the Edit button
// only mounts when GET /api/admin-verify returns 200.
//
// Stars (derived from list membership, see api/_layout-core.js):
//   4  trip highlights   (GREECE_LAYOUT.highlights)
//   3  location default grid   (GREECE_LAYOUT.<loc>.curated)
//   2  location View all       (GREECE_LAYOUT.<loc>.photos)
//   1  only in the unlisted All Frames album
//   removed: dropped from every list (file stays in R2)
// ============================================================
(function () {
  'use strict';

  const HINT_KEY = 'portfolio_admin_hint'; // set by /admin/ after login; avoids a 401 for every visitor
  const BUDGET_KEY = 'portfolio_layout_budgets';

  const TRIPS = {
    'greece-2026': {
      groupId: 'greece-2026',
      title: 'Greece 2026',
      getLayout: () => (typeof GREECE_LAYOUT !== 'undefined' ? GREECE_LAYOUT : null),
      budgets: { highlights: 12, curated: 18 }, // placeholders; click a counter to change
      locations: [
        { key: 'kalymnos', title: 'Kalymnos', publicId: 'greece-public-kalymnos', allId: 'greece-kalymnos' },
        { key: 'naxos', title: 'Naxos', publicId: 'greece-public-naxos', allId: 'greece-naxos' },
        { key: 'athens', title: 'Athens', publicId: 'greece-public-athens', allId: 'greece-athens' },
      ],
    },
  };

  const TIER_LABEL = {
    4: 'Trip highlights',
    3: 'Location default grid',
    2: 'Location View all',
    1: 'All frames only',
  };

  let adminPromise = null;
  function isAdmin() {
    if (!adminPromise) {
      adminPromise = (async () => {
        try {
          if (!localStorage.getItem(HINT_KEY)) return false;
          const r = await fetch('/api/admin-verify', { credentials: 'same-origin' });
          if (!r.ok) localStorage.removeItem(HINT_KEY);
          return r.ok;
        } catch {
          return false;
        }
      })();
    }
    return adminPromise;
  }

  function findContext(kind, item) {
    for (const [tripId, trip] of Object.entries(TRIPS)) {
      if (kind === 'group' && item.id === trip.groupId) return { tripId, trip, kind, item, loc: null };
      if (kind === 'album') {
        const loc = trip.locations.find((l) => l.publicId === item.id);
        if (loc) return { tripId, trip, kind, item, loc };
      }
    }
    return null;
  }

  // ── tiny DOM helper ─────────────────────────────────────────
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  const shortName = (url) => decodeURIComponent(url.split('/').slice(-2).join('/'));
  const thumb = (url) => (typeof gridUrl === 'function' ? gridUrl(url) : url);
  const full = (url) => (typeof viewUrl === 'function' ? viewUrl(url) : url);

  const CSS = `
  .le-fab{position:fixed;right:20px;bottom:20px;z-index:9000;padding:10px 18px;border-radius:999px;border:1px solid #c9a45c;background:#111;color:#e8d9b5;font:500 13px/1 system-ui,sans-serif;letter-spacing:.04em;cursor:pointer;box-shadow:0 4px 18px rgba(0,0,0,.35)}
  .le-fab:hover{background:#1b1b1b}
  .le-overlay{position:fixed;inset:0;z-index:9500;background:#0d0d0d;color:#eee;display:flex;flex-direction:column;font:14px/1.4 system-ui,sans-serif}
  .le-bar{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;padding:12px 18px;border-bottom:1px solid #2a2a2a;background:#141414}
  .le-title{font-weight:600;font-size:15px;margin-right:6px}
  .le-tabs{display:flex;gap:6px;flex-wrap:wrap}
  .le-tab{background:#1d1d1d;border:1px solid #333;color:#bbb;padding:6px 12px;border-radius:6px;cursor:pointer;font:inherit;font-size:13px}
  .le-tab.is-active{border-color:#c9a45c;color:#fff;background:#262116}
  .le-chips{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}
  .le-chip{font-size:12px;padding:4px 9px;border-radius:999px;border:1px solid #333;color:#aaa;background:#181818;cursor:pointer}
  .le-chip.is-current{border-color:#6b5a2e;color:#e8d9b5}
  .le-chip.is-over{border-color:#a33;color:#ff9b9b}
  .le-btn{background:#1d1d1d;border:1px solid #444;color:#eee;padding:7px 14px;border-radius:6px;cursor:pointer;font:inherit;font-size:13px}
  .le-btn:disabled{opacity:.4;cursor:default}
  .le-btn.primary{background:#c9a45c;border-color:#c9a45c;color:#111;font-weight:600}
  .le-banner{padding:9px 18px;font-size:13px;border-bottom:1px solid #222;background:#16201a;color:#9ad29a}
  .le-banner[hidden]{display:none}
  .le-banner.is-info{background:#1a1a1a;color:#ddd}
  .le-banner.is-error{background:#2a1515;color:#ffb3b3}
  .le-hint{padding:8px 18px;font-size:12px;color:#888;border-bottom:1px solid #1f1f1f}
  .le-tile.is-recent{outline:2px solid #5ac8fa;outline-offset:-2px}
  .le-new-badge{position:absolute;left:4px;bottom:30px;font-size:10px;background:#5ac8fa;color:#06222e;padding:1px 6px;border-radius:3px;font-weight:600}
  .le-grid-wrap{flex:1;overflow:auto;padding:16px 18px 60px}
  .le-section-title{margin:18px 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#999}
  .le-section-title:first-child{margin-top:0}
  .le-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
  .le-empty{color:#777;padding:30px 0}
  .le-tile{position:relative;aspect-ratio:1;background:#000;border:2px solid transparent;border-radius:4px;overflow:hidden}
  .le-tile img{width:100%;height:100%;object-fit:contain;display:block;background:#050505}
  .le-tile.is-draggable{cursor:grab}
  .le-tile.is-dragging{opacity:.35}
  .le-tile.drop-before{box-shadow:-4px 0 0 #c9a45c}
  .le-tile.drop-after{box-shadow:4px 0 0 #c9a45c}
  .le-tile.is-t4{border-color:#c9a45c}
  .le-pos{position:absolute;top:4px;left:4px;font-size:11px;background:rgba(0,0,0,.65);padding:1px 6px;border-radius:3px}
  .le-tools{position:absolute;top:4px;right:4px;display:flex;gap:4px;opacity:0;transition:opacity .12s}
  .le-tile:hover .le-tools,.le-tile:focus-within .le-tools{opacity:1}
  .le-icon{width:24px;height:24px;border-radius:4px;border:0;background:rgba(0,0,0,.7);color:#eee;cursor:pointer;font-size:13px;line-height:24px;padding:0}
  .le-icon:hover{background:#000}
  .le-icon.danger:hover{background:#7a1f1f}
  .le-stars{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:center;gap:2px;padding:4px;background:linear-gradient(transparent,rgba(0,0,0,.8));opacity:0;transition:opacity .12s}
  .le-tile:hover .le-stars,.le-tile:focus-within .le-stars,.le-tile.is-t4 .le-stars,.le-tile.is-t3 .le-stars{opacity:1}
  .le-star{background:none;border:0;color:#555;font-size:17px;line-height:1;cursor:pointer;padding:0 2px}
  .le-star.on{color:#e0b648}
  .le-star:hover{color:#ffd966}
  .le-tile.is-removed img{opacity:.35;filter:grayscale(1)}
  .le-tile.is-removed .le-stars{opacity:0}
  .le-zoom{position:fixed;inset:0;z-index:9800;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;cursor:zoom-out}
  .le-zoom img{max-width:94vw;max-height:94vh;object-fit:contain}
  `;

  function mount(ctx) {
    const found = findContext(ctx.kind, ctx.item);
    if (!found) return;
    isAdmin().then((ok) => {
      if (!ok) return;
      if (document.querySelector('.le-fab')) return;
      document.head.append(h('style', { id: 'le-style' }, CSS));
      document.body.append(
        h('button', { class: 'le-fab', type: 'button', onclick: () => open({ ...found, refresh: ctx.refresh }) }, 'Edit layout'),
      );
    });
  }

  // ── editor ──────────────────────────────────────────────────
  function open(ctx) {
    const { trip, tripId, kind, loc: pageLoc } = ctx;
    const L = trip.getLayout();
    if (!L) return alert('Layout data is not loaded on this page.');

    const allAlbum = (key) => ALBUMS.find((a) => a.id === trip.locations.find((l) => l.key === key).allId);
    const lists = { highlights: [...(L.highlights || [])], loc: {} };
    const universe = {};
    const locOf = new Map();
    trip.locations.forEach((l) => {
      const src = L[l.key] || { curated: [], photos: [] };
      lists.loc[l.key] = { curated: [...src.curated], photos: [...src.photos] };
      const all = (allAlbum(l.key)?.photos || []).filter(Boolean);
      universe[l.key] = [...new Set([...all, ...lists.loc[l.key].photos, ...lists.loc[l.key].curated])];
      universe[l.key].forEach((u) => { if (!locOf.has(u)) locOf.set(u, l.key); });
    });
    const removed = new Map(); // url -> { tier, loc }

    let budgets = { ...trip.budgets };
    try { Object.assign(budgets, JSON.parse(localStorage.getItem(BUDGET_KEY) || '{}')); } catch { /* ignore */ }

    const snapshot = () => JSON.stringify([lists, [...removed.keys()]]);
    let saved = snapshot();
    const dirty = () => snapshot() !== saved;

    const tierOf = (url) => {
      if (lists.highlights.includes(url)) return 4;
      const key = locOf.get(url);
      if (key) {
        if (lists.loc[key].curated.includes(url)) return 3;
        if (lists.loc[key].photos.includes(url)) return 2;
      }
      return 1;
    };
    const without = (arr, url) => { const i = arr.indexOf(url); if (i >= 0) arr.splice(i, 1); };

    // Shoot order for the whole trip: locations in trip order, frames in each location's order.
    const tripOrder = trip.locations.flatMap((l) => universe[l.key]);

    // Insert `url` into `list` right after the nearest earlier frame (in `order`) that is already in
    // the list, so new photos land where they belong chronologically instead of at the end.
    // If you have hand-ordered the list, it still goes next to its chronological neighbour.
    function insertInOrder(list, url, order) {
      if (list.includes(url)) return;
      const idx = order.indexOf(url);
      let at = 0;
      for (let i = idx - 1; i >= 0; i--) {
        const p = list.indexOf(order[i]);
        if (p >= 0) { at = p + 1; break; }
      }
      list.splice(at, 0, url);
    }

    function setTier(url, tier) {
      const key = locOf.get(url);
      if (tier >= 4) insertInOrder(lists.highlights, url, tripOrder); else without(lists.highlights, url);
      if (!key) return;
      const loc = lists.loc[key];
      if (tier >= 3) insertInOrder(loc.curated, url, universe[key]); else without(loc.curated, url);
      if (tier >= 2) insertInOrder(loc.photos, url, universe[key]); else without(loc.photos, url);
    }

    function removePhoto(url) {
      removed.set(url, { tier: tierOf(url) });
      without(lists.highlights, url);
      const key = locOf.get(url);
      if (key) { without(lists.loc[key].curated, url); without(lists.loc[key].photos, url); }
    }
    function restorePhoto(url) {
      const info = removed.get(url);
      removed.delete(url);
      setTier(url, Math.max(1, info?.tier || 1));
    }

    // ── tab definitions ──
    const tabs = [];
    if (kind === 'group') {
      tabs.push({
        id: 'highlights', label: () => `4\u2605 Trip highlights (${lists.highlights.length})`, ordered: true,
        sections: () => [{ items: lists.highlights, list: lists.highlights }],
      });
      tabs.push({
        id: 'candidates', label: () => `3\u2605 Candidates (${trip.locations.reduce((n, l) => n + candidates(l.key).length, 0)})`,
        sections: () => trip.locations.map((l) => ({ title: l.title, items: candidates(l.key) })),
      });
    } else {
      const key = pageLoc.key;
      tabs.push({
        id: 'curated', label: () => `3\u2605+ Default grid (${lists.loc[key].curated.length})`, ordered: true,
        sections: () => [{ items: lists.loc[key].curated, list: lists.loc[key].curated }],
      });
      tabs.push({
        id: 'four', label: () => `4\u2605 Trip highlights (${fours(key).length})`,
        sections: () => [{ items: fours(key) }],
      });
      tabs.push({
        id: 'two', label: () => `2\u2605 View all (${twoOnly(key).length})`,
        sections: () => [{ items: twoOnly(key) }],
      });
      tabs.push({
        id: 'one', label: () => `1\u2605 All frames (${oneOnly(key).length})`,
        sections: () => [{ items: oneOnly(key) }],
      });
    }
    tabs.push({
      id: 'removed', label: () => `Removed (${removed.size})`, removedTab: true,
      sections: () => [{ items: [...removed.keys()] }],
    });
    // 4-star photos from one location (their order is set on the trip page).
    function fours(key) { return lists.highlights.filter((u) => locOf.get(u) === key); }
    function candidates(key) { return lists.loc[key].curated.filter((u) => !lists.highlights.includes(u)); }
    function twoOnly(key) {
      const l = lists.loc[key];
      return l.photos.filter((u) => !l.curated.includes(u) && !lists.highlights.includes(u));
    }
    function oneOnly(key) {
      const l = lists.loc[key];
      return universe[key].filter((u) => !l.photos.includes(u) && !l.curated.includes(u)
        && !lists.highlights.includes(u) && !removed.has(u));
    }

    let activeTab = tabs[0].id;
    let hoverUrl = null;
    let dragUrl = null;
    const recent = []; // urls changed this session, newest first

    // Where does a photo at a given star level show up in this editor?
    function tabForTier(tier) {
      if (kind === 'group') return tier >= 4 ? 'highlights' : (tier === 3 ? 'candidates' : null);
      return tier >= 4 ? 'four' : (tier === 3 ? 'curated' : (tier === 2 ? 'two' : 'one'));
    }
    const tabLabelText = (id) => tabs.find((t) => t.id === id)?.label().replace(/\s*\(\d+\)$/, '');

    // Single entry point for star changes from the UI (click or key).
    function changeTier(url, tier) {
      const from = tierOf(url);
      if (from === tier) return;
      setTier(url, tier);
      const at = recent.indexOf(url);
      if (at >= 0) recent.splice(at, 1);
      recent.unshift(url);
      const id = tabForTier(tier);
      const dest = id
        ? `now under \u201C${tabLabelText(id)}\u201D (marked in blue)`
        : (kind === 'group'
          ? `now only on its location page (${tier}\u2605 ${TIER_LABEL[tier]})`
          : '');
      setStatus(`${from}\u2605 \u2192 ${tier}\u2605${dest ? `: ${dest}` : ''}`, 'info', 5000);
    }

    // ── chrome ──
    const banner = h('div', { class: 'le-banner', hidden: true, role: 'status' });
    const saveBtn = h('button', { class: 'le-btn primary', type: 'button', onclick: save }, 'Save');
    const tabBar = h('div', { class: 'le-tabs' });
    const chips = h('div', { class: 'le-chips' });
    const gridWrap = h('div', { class: 'le-grid-wrap' });
    const overlay = h('div', { class: 'le-overlay', role: 'dialog', 'aria-label': 'Edit layout' },
      h('div', { class: 'le-bar' },
        h('span', { class: 'le-title' }, kind === 'group' ? `Edit layout \u2014 ${ctx.item.title}` : `Edit layout \u2014 ${pageLoc.title}`),
        tabBar,
        chips,
        saveBtn,
        h('button', { class: 'le-btn', type: 'button', onclick: close }, 'Close'),
      ),
      banner,
      h('div', { class: 'le-hint' },
        'Drag to reorder (ordered tabs). Hover a photo: 1\u20134 sets stars, X removes from the manifest (file stays in R2), F moves to front. Nothing is published until Save.'),
      gridWrap,
    );

    function counters() {
      const out = [];
      out.push({ label: `Trip 4\u2605 ${lists.highlights.length}/${budgets.highlights}`, over: lists.highlights.length > budgets.highlights, current: kind === 'group', budget: 'highlights' });
      trip.locations.forEach((l) => {
        const n = lists.loc[l.key].curated.length;
        out.push({ label: `${l.title} 3\u2605 ${n}/${budgets.curated}`, over: n > budgets.curated, current: pageLoc?.key === l.key, budget: 'curated' });
      });
      return out;
    }

    function renderChrome() {
      tabBar.replaceChildren(...tabs.map((t) => h('button', {
        class: 'le-tab' + (t.id === activeTab ? ' is-active' : ''), type: 'button',
        onclick: () => { activeTab = t.id; render(); revealRecent(); },
      }, t.label())));
      chips.replaceChildren(...counters().map((c) => h('span', {
        class: 'le-chip' + (c.over ? ' is-over' : '') + (c.current ? ' is-current' : ''),
        title: 'Click to change the budget (a target, not a hard limit)',
        onclick: () => {
          const next = parseInt(prompt('Target number of photos:', budgets[c.budget]), 10);
          if (next > 0) {
            budgets[c.budget] = next;
            localStorage.setItem(BUDGET_KEY, JSON.stringify(budgets));
            renderChrome();
          }
        },
      }, c.label)));
      saveBtn.disabled = !dirty();
    }

    function tile(url, section, tab, index) {
      const t = removed.has(url) ? 0 : tierOf(url);
      const ordered = tab.ordered && section.list;
      const el = h('div', {
        class: `le-tile is-t${t}` + (ordered ? ' is-draggable' : '') + (tab.removedTab ? ' is-removed' : '')
          + (!tab.removedTab && recent.includes(url) ? ' is-recent' : ''),
        draggable: ordered ? 'true' : null,
        title: shortName(url),
        'data-url': url,
        onmouseenter: () => { hoverUrl = url; },
        onmouseleave: () => { if (hoverUrl === url) hoverUrl = null; },
      },
      h('img', { src: thumb(url), alt: shortName(url), loading: 'lazy', decoding: 'async', draggable: 'false' }),
      ordered && h('span', { class: 'le-pos' }, index + 1),
      !tab.removedTab && recent.includes(url) && h('span', { class: 'le-new-badge' }, 'moved'),
      h('div', { class: 'le-tools' },
        h('button', { class: 'le-icon', type: 'button', title: 'Zoom', onclick: () => zoom(url) }, '\u2315'),
        tab.removedTab
          ? h('button', { class: 'le-icon', type: 'button', title: 'Restore', onclick: () => { restorePhoto(url); render(); } }, '\u21A9')
          : h('button', { class: 'le-icon danger', type: 'button', title: 'Remove from manifest (file stays in R2)', onclick: () => { removePhoto(url); render(); } }, '\u2715'),
        ordered && h('button', { class: 'le-icon', type: 'button', title: 'Move to front (F)', onclick: () => { moveToFront(section.list, url); render(); } }, '\u21E4'),
      ),
      !tab.removedTab && h('div', { class: 'le-stars' }, [1, 2, 3, 4].map((n) => h('button', {
        class: 'le-star' + (n <= t ? ' on' : ''), type: 'button',
        title: `${n}\u2605 ${TIER_LABEL[n]}`,
        onclick: () => { changeTier(url, n); render(); },
      }, '\u2605'))));

      if (ordered) wireDrag(el, section.list, url);
      return el;
    }

    function moveToFront(list, url) {
      const i = list.indexOf(url);
      if (i > 0) { list.splice(i, 1); list.unshift(url); }
    }

    function wireDrag(el, list, url) {
      el.addEventListener('dragstart', (e) => {
        dragUrl = url;
        el.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', url);
      });
      el.addEventListener('dragend', () => {
        dragUrl = null;
        el.classList.remove('is-dragging');
        gridWrap.querySelectorAll('.drop-before,.drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after'));
      });
      el.addEventListener('dragover', (e) => {
        if (!dragUrl || dragUrl === url || !list.includes(dragUrl)) return;
        e.preventDefault();
        const r = el.getBoundingClientRect();
        const after = e.clientX > r.left + r.width / 2;
        el.classList.toggle('drop-after', after);
        el.classList.toggle('drop-before', !after);
      });
      el.addEventListener('dragleave', () => el.classList.remove('drop-before', 'drop-after'));
      el.addEventListener('drop', (e) => {
        if (!dragUrl || dragUrl === url || !list.includes(dragUrl)) return;
        e.preventDefault();
        const r = el.getBoundingClientRect();
        const after = e.clientX > r.left + r.width / 2;
        const moving = dragUrl;
        without(list, moving);
        const target = list.indexOf(url);
        list.splice(after ? target + 1 : target, 0, moving);
        render();
      });
    }

    function render() {
      const scroll = gridWrap.scrollTop;
      renderChrome();
      const tab = tabs.find((t) => t.id === activeTab);
      const nodes = [];
      let total = 0;
      tab.sections().forEach((section) => {
        if (section.title) nodes.push(h('div', { class: 'le-section-title' }, `${section.title} (${section.items.length})`));
        if (!section.items.length) return;
        total += section.items.length;
        nodes.push(h('div', { class: 'le-grid' }, section.items.map((u, i) => tile(u, section, tab, i))));
      });
      if (!total) nodes.push(h('div', { class: 'le-empty' }, tab.removedTab ? 'Nothing removed in this session.' : 'No photos at this level.'));
      gridWrap.replaceChildren(...nodes);
      gridWrap.scrollTop = scroll;
    }

    // After switching tabs, scroll to the most recently moved photo if it is on this tab
    // (a promoted photo can land far down a long list).
    function revealRecent() {
      const el = gridWrap.querySelector('.le-tile.is-recent');
      if (el) el.scrollIntoView({ block: 'center' });
    }

    function zoom(url) {
      const z = h('div', { class: 'le-zoom', onclick: () => z.remove() }, h('img', { src: full(url), alt: shortName(url) }));
      document.body.append(z);
    }

    // kind: 'ok' (green), 'info' (grey, auto-clears), 'error' (red, stays until the next message)
    let bannerTimer = null;
    function setStatus(msg, type, clearAfterMs) {
      clearTimeout(bannerTimer);
      banner.textContent = msg || '';
      banner.hidden = !msg;
      banner.className = 'le-banner' + (type === 'error' ? ' is-error' : type === 'info' ? ' is-info' : '');
      if (msg && clearAfterMs) bannerTimer = setTimeout(() => { banner.hidden = true; }, clearAfterMs);
    }

    async function save() {
      const newRemoved = [...removed.keys()];
      if (newRemoved.length && !confirm(`Remove ${newRemoved.length} photo(s) from the site manifest?\nThe files stay in R2, and the commit can be reverted.`)) return;
      const over = counters().filter((c) => c.over).map((c) => c.label);
      if (over.length && !confirm(`Over target: ${over.join(', ')}.\nSave anyway?`)) return;

      saveBtn.disabled = true;
      setStatus('Saving\u2026');
      const layout = { highlights: lists.highlights };
      trip.locations.forEach((l) => { layout[l.key] = lists.loc[l.key]; });
      try {
        const res = await fetch('/api/admin-layout', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trip: tripId, layout, removed: newRemoved }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          localStorage.removeItem(HINT_KEY);
          throw new Error('Session expired. Log in again at /admin/ and retry.');
        }
        if (!res.ok) {
          const extra = data.blockers?.map((b) => `${b.file}:${b.line} ${b.text}`).join(' | ');
          throw new Error([data.error || `Save failed (${res.status})`, extra].filter(Boolean).join(' \u2014 '));
        }
        applyToPage(newRemoved);
        saved = snapshot();
        const where = data.commit
          ? `Committed ${data.commit.slice(0, 7)} on ${data.branch}. Live after the deploy finishes.`
          : (data.changed === false ? 'No changes to save.' : (data.message || 'Saved.'));
        setStatus([where, ...(data.warnings || [])].join(' '));
      } catch (err) {
        setStatus(`Save failed: ${err.message}`, 'error');
      }
      renderChrome();
    }

    // Mirror the saved lists into the in-memory page data so the page behind the editor updates.
    function applyToPage(newRemoved) {
      const gone = new Set(newRemoved);
      removed.clear();
      L.highlights.splice(0, L.highlights.length, ...lists.highlights);
      const group = ALBUMS.find((a) => a.id === trip.groupId);
      if (group) group.highlights = L.highlights;
      trip.locations.forEach((l) => {
        const dst = L[l.key];
        dst.curated.splice(0, dst.curated.length, ...lists.loc[l.key].curated);
        dst.photos.splice(0, dst.photos.length, ...lists.loc[l.key].photos);
        const pub = ALBUMS.find((a) => a.id === l.publicId);
        if (pub) { pub.curated = dst.curated; pub.photos = dst.photos; }
        const all = ALBUMS.find((a) => a.id === l.allId);
        if (all && gone.size) all.photos = (all.photos || []).filter((u) => !gone.has(u));
      });
      if (gone.size) L.removed.push(...newRemoved.filter((u) => !L.removed.includes(u)));
      try { ctx.refresh?.(); } catch (e) { console.warn('layout-editor refresh failed', e); }
    }

    function onKey(e) {
      if (zoomOpen()) { if (e.key === 'Escape') document.querySelector('.le-zoom')?.remove(); return; }
      if (e.key === 'Escape') { close(); return; }
      if (!hoverUrl || e.metaKey || e.ctrlKey || e.altKey) return;
      const tab = tabs.find((t) => t.id === activeTab);
      if (['1', '2', '3', '4'].includes(e.key) && !tab.removedTab) { changeTier(hoverUrl, Number(e.key)); render(); }
      else if ((e.key === 'x' || e.key === 'X') && !tab.removedTab) { removePhoto(hoverUrl); hoverUrl = null; render(); }
      else if ((e.key === 'f' || e.key === 'F') && tab.ordered) {
        const list = tab.sections()[0].list;
        moveToFront(list, hoverUrl); render();
      }
    }
    const zoomOpen = () => !!document.querySelector('.le-zoom');
    const beforeUnload = (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } };

    function close() {
      if (dirty() && !confirm('Discard unsaved layout changes?')) return;
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', beforeUnload);
      document.body.style.overflow = '';
      overlay.remove();
    }

    document.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', beforeUnload);
    document.body.style.overflow = 'hidden';
    document.body.append(overlay);
    render();
  }

  window.LayoutEditor = { mount };
})();
