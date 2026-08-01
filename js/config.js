// ============================================================
// SITE CONFIGURATION
// ============================================================

const SITE_CONFIG = {
  photographerName: 'Raveen Fernando',
  tagline: 'Capturing light, emotion, and the quiet beauty of the world.',
  // ── Hero background (home page) — served from /images/ for same-origin preload ──
  heroImage: '/images/hero.jpg',
  heroPosition: '50% 50%',
  heroPositionMobile: '50% 40%',

  aboutPhoto: `https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/about/portrait.jpg`,
  email: '',
};

// ============================================================
// CLOUDFLARE R2 CONFIGURATION
// ── Replace R2_BASE_URL with your R2 public bucket URL ──
// Format 1 (R2 public URL):   https://pub-XXXX.r2.dev
// Format 2 (custom domain):   https://photos.yourdomain.com
//
// ⚠️  Ensure your R2 bucket has CORS configured to allow GET
//     requests from your domain (needed for the ZIP download).
// ============================================================
const R2_BASE_URL = 'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev';

// ── Worker base URL (ZIP downloads, and future private-image serving) ──
// Override for local dev: set window.WORKER_BASE_URL before loading this file,
// or set localStorage.workerBaseUrl = 'http://localhost:8787' in the console.
const WORKER_BASE_URL = (() => {
  try {
    return localStorage.getItem('workerBaseUrl') || 'https://portfolio-zip-download.raveenfernando.workers.dev';
  } catch {
    return 'https://portfolio-zip-download.raveenfernando.workers.dev';
  }
})();

// ── Access tier system ──────────────────────────────────────────────────────
//
// audience — who can see an album's full content:
//   'public'             everyone; curated[] is the default view, "See full album" toggles the rest
//   'family'             family password — private R2 albums, via Worker
//   'client:<name>'      client access code — private R2, via Worker
//
// (Legacy `friends` tier removed Aug 2026 — city albums are public; curated + full both open.)
//
// PASSWORD_TIERS maps SHA-256(password) → array of audiences granted.
// Passwords themselves are NEVER stored here — only their hashes.
// Change a password by replacing its hash; add new clients via admin Access codes (D1), not here.
//
// To generate a hash: open browser console and run:
//   hashPassword('your-password').then(h => console.log(h))
// Or: python3 -c "import hashlib; print(hashlib.sha256(b'your-password').hexdigest())"

const PASSWORD_TIERS = {
  // Hashes only — plaintext passwords are in 1Password.
  // Family password:
  'c403bc24f61b121c4bb12f2455f4e2f6559d17742df491913bc7e6914014a8fb': ['family'],
};

// Homepage Selected Work — full-res R2 URLs (curate via admin lightbox → Copy URL)
SITE_CONFIG.featuredPhotos = [
  `${R2_BASE_URL}/Red-Rock-Canyon-2026/20260125-_DSF0972.jpg`,
  `${R2_BASE_URL}/Italy/Venice/Digital/venice_284.jpg`,
  `${R2_BASE_URL}/Italy/Florence/Digital/florence_400.jpg`,
  `${R2_BASE_URL}/Italy/Rome/Digital/rome_495.jpg`,
  `${R2_BASE_URL}/California/Santa-Cruz-Big-Sur/California-188.jpg`,
  `${R2_BASE_URL}/California/Yosemite/California-346.jpg`,
  `${R2_BASE_URL}/California/Yosemite/California-404.jpg`,
  `${R2_BASE_URL}/Italy/Pisa/Digital/pisa_097-Edit.jpg`,
  `${R2_BASE_URL}/Italy/Assisi/Digital/assisi_034.jpg`,
  `${R2_BASE_URL}/California/Santa-Cruz-Big-Sur/California-324.jpg`,
];

// ============================================================
// ALBUMS — see js/albums.js (assembled from js/albums/*.js)
// ============================================================
