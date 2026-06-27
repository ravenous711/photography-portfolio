import puppeteer from 'puppeteer';

const URL = 'http://localhost:8080/gallery/italy-2026/venice/';
const VIEWPORT = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

function sample(page) {
  return page.evaluate(() => {
    const grid = document.getElementById('photo-grid');
    const firstThumb = grid?.querySelector('.photo-thumb');
    const toolbar = document.getElementById('album-header-toolbar');
    const sentinel = document.getElementById('album-toolbar-sentinel');
    return {
      scrollY: window.scrollY,
      thumbTop: firstThumb ? firstThumb.getBoundingClientRect().top : null,
      toolbarHeight: toolbar?.getBoundingClientRect().height ?? null,
      toolbarStuck: toolbar?.classList.contains('is-stuck') ?? false,
      sentinelTop: sentinel?.getBoundingClientRect().top ?? null,
    };
  });
}

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport(VIEWPORT);
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForSelector('#photo-grid .photo-thumb', { timeout: 60000 });
await page.waitForFunction(() => {
  const grid = document.getElementById('photo-grid');
  return grid && grid.offsetHeight > 100;
}, { timeout: 60000 });

const samples = [];
samples.push({ phase: 'start', ...(await sample(page)) });

// Simulate incremental scroll like a finger swipe
for (let y = 0; y <= 400; y += 8) {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await new Promise(r => setTimeout(r, 16));
  const s = await sample(page);
  const prev = samples[samples.length - 1];
  const thumbDelta = prev.thumbTop != null && s.thumbTop != null ? s.thumbTop - prev.thumbTop : 0;
  const scrollDelta = s.scrollY - prev.scrollY;
  const jump = Math.abs(thumbDelta + scrollDelta);
  if (jump > 8 || s.toolbarStuck !== prev.toolbarStuck || s.toolbarCompact !== prev.toolbarCompact) {
    samples.push({ phase: `scroll-${y}`, jump, thumbDelta, scrollDelta, ...s });
  }
}

console.log(JSON.stringify(samples, null, 2));

const bigJumps = samples.filter(s => (s.jump ?? 0) > 12);
console.log('\nJumps > 12px:', bigJumps.length);
bigJumps.forEach(j => {
  console.log(`  y=${j.scrollY} stuck=${j.toolbarStuck} compact=${j.toolbarCompact} jump=${j.jump?.toFixed(1)} thumbΔ=${j.thumbDelta?.toFixed(1)} scrollΔ=${j.scrollDelta}`);
});

await browser.close();
