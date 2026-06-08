// ============================================================
// SITE CONFIGURATION
// ============================================================

const SITE_CONFIG = {
  photographerName: 'Raveen Fernando',
  // ── Site-wide preview password (SHA-256 hash of the password) ──
  // Default password: preview2026
  // To change: run: python3 -c "import hashlib; print(hashlib.sha256(b'yourpassword').hexdigest())"
  sitePasswordHash: '36e11b86750178bc2d659d7779dbfdf28cee8c60a6a804e47d3ef1ae85f4a70c',
  tagline: 'Capturing light, emotion, and the quiet beauty of the world.',
  // ── R2: Upload your hero image and set the full URL below ──
  // Example: 'https://pub-xxxx.r2.dev/hero.jpg'
  heroImage: 'https://picsum.photos/seed/hero/1920/1080',

  // ── R2: Upload your about/profile photo and set the URL below ──
  aboutPhoto: 'https://picsum.photos/seed/about-portrait/800/1000',
  aboutBio: `I'm a photographer based in Detroit, Michigan.`,
  email: 'hello@raveenfernando.com',
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

// ============================================================
// ALBUM CONFIGURATION
//
// Each album object:
//   id          – unique slug used in URLs (?id=landscapes)
//   title       – display name
//   description – short caption shown on gallery card
//   protected   – true = password required
//   passwordHash– SHA-256 hash of the album password (protected only)
//                 Generate: open browser console and run:
//                   hashPassword('your-password').then(h => console.log(h))
//                 (hashPassword is defined in js/main.js)
//   coverImage  – path relative to R2_BASE_URL, or full URL for placeholders
//   photos      – array of photo URLs inside the album
//
// PASSWORD-PROTECTED DEMO CREDENTIALS:
//   Family album       → password: "family2024"
//   Nieces & Nephews   → password: "sunshine"
// ============================================================
const ALBUMS = [

  // ── R2-CONNECTED ALBUMS ───────────────────────────────────
  //
  // Dynamic albums: photos are loaded at runtime by fetching
  // an index.json file stored in the same R2 folder.
  //
  // To set up a dynamic album:
  //   1. Upload your photos to R2 at:  portfolio-images/Film-Test/
  //   2. Upload an index.json to:      portfolio-images/Film-Test/index.json
  //
  //   index.json format (just a JSON array of filenames):
  //   ["IMG_001.jpg", "IMG_002.jpg", "DSC_0042.jpg", ...]
  //
  //   To regenerate index.json locally from a folder of images, run:
  //   ls portfolio-images/Film-Test/ | grep -E '\.(jpg|jpeg|png|webp)$' \
  //     | sort | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().split()))" \
  //     > index.json
  //
  {
    id: 'film-test',
    title: 'Film Test',
    description: 'Analog film test shots.',
    protected: true,
    // Password: "film-test"
    passwordHash: '78cc5547668122fb80386a825330fe2c2361662299ae2cde105062fafa2b2317',
    coverImage: `${R2_BASE_URL}/Film-Test/ultramax_01.jpg`,
    photos: [
      `${R2_BASE_URL}/Film-Test/ultramax_01.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_02.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_03.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_04.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_05.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_06.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_07.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_08.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_09.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_10.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_11.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_12.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_13.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_14.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_15.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_16.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_17.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_18.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_19.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_20.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_21.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_22.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_23.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_24.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_25.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_26.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_27.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_28.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_29.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_30.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_31.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_32.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_33.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_34.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_35.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_36.jpg`,
      `${R2_BASE_URL}/Film-Test/ultramax_37.jpg`,
    ]
  },

  // ── GROUP ALBUMS ──────────────────────────────────────────
  // type: 'group' albums show a sub-album index page instead of photos.
  // Add photo URLs to each sub-album's photos array once uploaded to R2.
  {
    id: 'italy-2026',
    title: 'Italy 2026',
    description: 'Venice, Florence, Assisi, and Rome.',
    type: 'group',
    protected: false,
    subAlbums: ['italy-venice', 'italy-florence', 'italy-assisi', 'italy-rome'],
    // R2: set to first sub-album cover once photos are uploaded
    coverImage: 'https://picsum.photos/seed/italy-cover/800/600',
  },

  {
    id: 'italy-venice',
    title: 'Venice',
    parentId: 'italy-2026',
    description: 'Canals, gondolas, and golden light.',
    protected: false,
    coverImage: 'https://picsum.photos/seed/venice-cover/800/600',
    photos: [
      // R2: `${R2_BASE_URL}/Italy-2026/Venice/filename.jpg`
    ],
  },

  {
    id: 'italy-florence',
    title: 'Florence',
    parentId: 'italy-2026',
    description: 'Renaissance architecture and Tuscan light.',
    protected: false,
    coverImage: 'https://picsum.photos/seed/florence-cover/800/600',
    photos: [
      // R2: `${R2_BASE_URL}/Italy-2026/Florence/filename.jpg`
    ],
  },

  {
    id: 'italy-assisi',
    title: 'Assisi',
    parentId: 'italy-2026',
    description: 'Stone streets and hilltop views.',
    protected: false,
    coverImage: 'https://picsum.photos/seed/assisi-cover/800/600',
    photos: [
      // R2: `${R2_BASE_URL}/Italy-2026/Assisi/filename.jpg`
    ],
  },

  {
    id: 'italy-rome',
    title: 'Rome',
    parentId: 'italy-2026',
    description: 'Ancient ruins, piazzas, and the eternal city.',
    protected: false,
    coverImage: 'https://picsum.photos/seed/rome-cover/800/600',
    photos: [
      // R2: `${R2_BASE_URL}/Italy-2026/Rome/filename.jpg`
    ],
  },

];
