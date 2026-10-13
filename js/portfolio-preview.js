// Local dry-run for portfolio tags and archive carousels.
// On localhost, a saved admin preview overrides the committed selects in this
// browser only. It never runs against the production hostname.

const PORTFOLIO_PREVIEW_KEY = 'rf-portfolio-preview';

function isPortfolioPreviewHost() {
  return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}

function readPortfolioPreview() {
  if (!isPortfolioPreviewHost()) return null;
  try {
    const raw = localStorage.getItem(PORTFOLIO_PREVIEW_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

function writePortfolioPreview(data) {
  if (!isPortfolioPreviewHost()) {
    throw new Error('Portfolio preview saves are only available on localhost');
  }
  localStorage.setItem(PORTFOLIO_PREVIEW_KEY, JSON.stringify(data));
}

function applyPortfolioPreview() {
  const preview = readPortfolioPreview();
  if (!preview) return;

  if (preview.portfolio && typeof PORTFOLIO !== 'undefined') {
    for (const id of ['featured', 'travel', 'life', 'events', 'couples']) {
      if (Array.isArray(preview.portfolio[id])) PORTFOLIO[id] = preview.portfolio[id].filter(Boolean);
    }
  }

  if (Array.isArray(preview.showcase) && typeof PORTFOLIO_SHOWCASE !== 'undefined') {
    PORTFOLIO_SHOWCASE.splice(0, PORTFOLIO_SHOWCASE.length, ...preview.showcase);
  }

  if (preview.highlights && typeof ALBUMS !== 'undefined') {
    for (const [id, urls] of Object.entries(preview.highlights)) {
      if (!Array.isArray(urls)) continue;
      const album = ALBUMS.find(item => item.id === id);
      if (album) album.highlights = urls.filter(Boolean);
    }
  }
}

applyPortfolioPreview();
