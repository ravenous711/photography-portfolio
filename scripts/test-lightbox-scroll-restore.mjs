/**
 * Closing the album lightbox must restore window.scrollY to the position from
 * before the photo opened (within 1px). Run against the local dev server:
 *
 *   node scripts/test-lightbox-scroll-restore.mjs
 */
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const BASE = process.env.ALBUM_URL || 'http://localhost:8080/gallery/italy-2026/venice/';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function expect(actual) {
  return {
    toBeLessThanOrEqual(limit) {
      assert.ok(
        actual <= limit,
        `expected ${actual} to be <= ${limit}`,
      );
    },
  };
}

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'phone', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
];

async function waitForStableHeight(page, selector) {
  let last = -1;
  let stable = 0;
  for (let i = 0; i < 40; i++) {
    const height = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return el ? el.offsetHeight : 0;
    }, selector);
    if (height > 120 && height === last) stable += 1;
    else stable = 0;
    last = height;
    if (stable >= 3) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`layout did not settle for ${selector}`);
}

async function scrollSettled(page) {
  let last = null;
  let stable = 0;
  for (let i = 0; i < 40; i++) {
    const y = await page.evaluate(() => window.scrollY);
    if (last != null && Math.abs(y - last) <= 0.5) stable += 1;
    else stable = 0;
    last = y;
    if (stable >= 3) return y;
    await new Promise((r) => setTimeout(r, 80));
  }
  return last;
}

async function prepare(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#photo-grid .photo-thumb', { timeout: 60000 });
  await waitForStableHeight(page, '#photo-grid');
  if (await page.$('#film-section .photo-thumb')) {
    await waitForStableHeight(page, '#film-section');
  }
}

async function centerThumb(page, root, index) {
  const placed = await page.evaluate((root, index) => {
    const thumbs = [...document.querySelectorAll(`${root} .photo-thumb`)];
    const thumb = thumbs[index];
    if (!thumb) return false;
    const rect = thumb.getBoundingClientRect();
    const top = rect.top + window.scrollY + rect.height / 2 - window.innerHeight / 2;
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
    return true;
  }, root, index);
  assert.ok(placed, `missing thumbnail ${index} in ${root}`);
  await scrollSettled(page);
}

async function openThumb(page, root, index) {
  await page.evaluate((root, index) => {
    const thumb = [...document.querySelectorAll(`${root} .photo-thumb`)][index];
    thumb.click();
  }, root, index);
  await page.waitForSelector('#lightbox.open', { timeout: 5000 });
}

async function assertScrollHeld(page, before) {
  const samples = [];
  for (let i = 0; i < 6; i++) {
    samples.push(await page.evaluate(() => window.scrollY));
    await new Promise((r) => setTimeout(r, 80));
  }
  const after = samples[samples.length - 1];
  const drift = Math.max(...samples.map((y) => Math.abs(y - before)));
  expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
  expect(drift).toBeLessThanOrEqual(1);
  return after;
}

async function closeVia(page, how) {
  if (how === 'button') {
    await page.evaluate(() => document.getElementById('lightbox-close').click());
    return;
  }
  if (how === 'escape') {
    await page.keyboard.press('Escape');
    return;
  }
  if (how === 'backdrop') {
    await page.waitForFunction(() => {
      const img = document.querySelector('#lightbox-stage .lightbox-layer.active');
      return !!(img && img.naturalWidth);
    }, { timeout: 20000 });
    const point = await page.evaluate(() => {
      const img = document.querySelector('#lightbox-stage .lightbox-layer.active');
      const stage = document.getElementById('lightbox-stage').getBoundingClientRect();
      const ar = img.naturalWidth / img.naturalHeight;
      const wide = stage.width / stage.height > ar;
      const width = wide ? stage.height * ar : stage.width;
      const height = wide ? stage.height : stage.width / ar;
      const photo = {
        left: stage.left + (stage.width - width) / 2,
        top: stage.top + (stage.height - height) / 2,
        right: 0,
        bottom: 0,
      };
      photo.right = photo.left + width;
      photo.bottom = photo.top + height;
      const interactive = '.lightbox-action-btn, .lightbox-nav, .lightbox-zoom, .lb-dl-wrap, .dl-size-dropdown, .lightbox-tap-prev, .lightbox-tap-next';
      const candidates = [
        { x: stage.left + stage.width / 2, y: stage.top + 8 },
        { x: stage.left + stage.width / 2, y: stage.bottom - 8 },
        { x: stage.left + 8, y: stage.top + stage.height / 2 },
        { x: stage.right - 8, y: stage.top + stage.height / 2 },
        { x: 3, y: window.innerHeight - 3 },
      ];
      for (const candidate of candidates) {
        const onPhoto = candidate.x >= photo.left && candidate.x <= photo.right
          && candidate.y >= photo.top && candidate.y <= photo.bottom;
        if (onPhoto) continue;
        const el = document.elementFromPoint(candidate.x, candidate.y);
        if (!el || !el.closest('#lightbox')) continue;
        if (el.closest(interactive)) continue;
        return candidate;
      }
      return null;
    });
    assert.ok(point, 'no letterbox point to dismiss the lightbox');
    await page.mouse.click(point.x, point.y);
    return;
  }
  throw new Error(`unknown close method ${how}`);
}

async function openAndClose(page, { root, index, how, navigate = false }) {
  await centerThumb(page, root, index);
  const before = await page.evaluate(() => window.scrollY);
  assert.ok(before > 200, `scroll position ${before} is too close to the top to catch a jump`);
  await openThumb(page, root, index);

  if (navigate) {
    const lockedTop = await page.evaluate(() => document.body.style.top);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await new Promise((r) => setTimeout(r, 50));
    const stillLocked = await page.evaluate(() => document.body.style.top);
    assert.equal(stillLocked, lockedTop, 'navigating photos moved the locked page');
  }

  await closeVia(page, how);
  await page.waitForFunction(() => !document.getElementById('lightbox').classList.contains('open'));
  const after = await assertScrollHeld(page, before);
  console.log(`  ${how}${navigate ? ' after nav' : ''}  before=${before} after=${after}`);
}

async function runViewport(browser, viewport) {
  console.log(`\n${viewport.name} ${viewport.width}×${viewport.height}`);
  const page = await browser.newPage();
  await page.setViewport(viewport);

  await prepare(page, BASE);
  const curated = await page.evaluate(() => document.body.classList.contains('full-album-mode') === false);
  assert.ok(curated, 'expected the curated view by default');

  console.log(' curated digital');
  await openAndClose(page, { root: '#photo-grid', index: 8, how: 'button' });
  await openAndClose(page, { root: '#photo-grid', index: 5, how: 'escape' });
  await openAndClose(page, { root: '#photo-grid', index: 12, how: 'backdrop' });
  await openAndClose(page, { root: '#photo-grid', index: 10, how: 'button', navigate: true });

  console.log(' curated film');
  await openAndClose(page, { root: '#film-section', index: 4, how: 'escape' });

  console.log(' full album');
  await page.evaluate(() => document.getElementById('album-view-toggle-bottom').click());
  await page.waitForFunction(() => document.body.classList.contains('full-album-mode'));
  await waitForStableHeight(page, '#photo-grid');
  await waitForStableHeight(page, '#film-section');
  await scrollSettled(page);
  await openAndClose(page, { root: '#photo-grid', index: 20, how: 'button' });
  await openAndClose(page, { root: '#film-section', index: 6, how: 'backdrop' });

  await page.close();
}

async function runDeepLink(browser, viewport) {
  console.log(`\ndeep link ${viewport.name}`);
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const url = new URL(BASE);
  url.searchParams.set('photo', 'venice_284.jpg');
  url.searchParams.set('grid', '1');
  await prepare(page, url.toString());
  await page.waitForFunction(() => {
    const thumb = document.querySelector('.photo-thumb.photo-thumb--focused');
    return !!thumb;
  }, { timeout: 5000 });
  // Let the focus settle loop finish so a late re-center is not still running.
  await new Promise((r) => setTimeout(r, 1600));
  const placement = await page.evaluate(() => {
    const thumb = [...document.querySelectorAll('.photo-thumb')].find((el) =>
      (el.dataset.photoUrl || '').includes('venice_284.jpg'));
    if (!thumb) return null;
    const rect = thumb.getBoundingClientRect();
    const center = rect.top + rect.height / 2;
    return {
      focused: thumb.classList.contains('photo-thumb--focused'),
      centerDelta: Math.abs(center - window.innerHeight / 2),
      inView: rect.bottom > 0 && rect.top < window.innerHeight,
    };
  });
  assert.ok(placement, 'deep link did not find venice_284.jpg');
  assert.ok(placement.inView, 'deep-linked thumbnail is outside the viewport');
  expect(placement.centerDelta).toBeLessThanOrEqual(48);
  console.log(`  focused thumb center Δ ${placement.centerDelta.toFixed(1)}px`);
  await page.close();
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--disable-smooth-scrolling'],
});

try {
  for (const viewport of VIEWPORTS) {
    await runViewport(browser, viewport);
    await runDeepLink(browser, viewport);
  }
  console.log('\nlightbox scroll restore: ok');
} finally {
  await browser.close();
}
