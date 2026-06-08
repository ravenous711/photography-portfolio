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

  // ── PUBLIC ALBUMS ─────────────────────────────────────────
  {
    id: 'landscapes',
    title: 'Landscapes',
    description: 'Mountains, valleys, and open skies across Australia and beyond.',
    protected: false,
    photoCount: 12,
    // R2: Replace with `${R2_BASE_URL}/landscapes/cover.jpg`
    coverImage: 'https://picsum.photos/seed/land-cover/800/600',
    photos: [
      // R2: Replace each URL with `${R2_BASE_URL}/landscapes/01.jpg`, etc.
      // Mix of landscape (1200×800), portrait (800×1200), and some square-ish
      'https://picsum.photos/seed/land01/1200/800',   // landscape
      'https://picsum.photos/seed/land02/800/1200',   // portrait
      'https://picsum.photos/seed/land03/1200/800',   // landscape
      'https://picsum.photos/seed/land04/800/1200',   // portrait
      'https://picsum.photos/seed/land05/1200/800',   // landscape
      'https://picsum.photos/seed/land06/800/1200',   // portrait
      'https://picsum.photos/seed/land07/1200/900',   // landscape (4×3)
      'https://picsum.photos/seed/land08/800/1200',   // portrait
      'https://picsum.photos/seed/land09/1200/800',   // landscape
      'https://picsum.photos/seed/land10/800/1200',   // portrait
      'https://picsum.photos/seed/land11/1200/800',   // landscape
      'https://picsum.photos/seed/land12/800/1200',   // portrait
    ],
  },

  {
    id: 'street',
    title: 'Street',
    description: 'Life on the move — strangers, shadows, and city light.',
    protected: false,
    photoCount: 10,
    // R2: Replace with `${R2_BASE_URL}/street/cover.jpg`
    coverImage: 'https://picsum.photos/seed/street-cover/800/600',
    photos: [
      // R2: Replace each URL with `${R2_BASE_URL}/street/01.jpg`, etc.
      'https://picsum.photos/seed/str01/1200/800',
      'https://picsum.photos/seed/str02/800/1200',
      'https://picsum.photos/seed/str03/1200/800',
      'https://picsum.photos/seed/str04/1200/800',
      'https://picsum.photos/seed/str05/800/1000',
      'https://picsum.photos/seed/str06/1200/800',
      'https://picsum.photos/seed/str07/1000/1200',
      'https://picsum.photos/seed/str08/1200/800',
      'https://picsum.photos/seed/str09/1200/800',
      'https://picsum.photos/seed/str10/800/1200',
    ],
  },

  {
    id: 'travel',
    title: 'Travel',
    description: 'Places that changed how I see — Japan, Iceland, Morocco, and more.',
    protected: false,
    photoCount: 14,
    // R2: Replace with `${R2_BASE_URL}/travel/cover.jpg`
    coverImage: 'https://picsum.photos/seed/travel-cover/800/600',
    photos: [
      // R2: Replace each URL with `${R2_BASE_URL}/travel/01.jpg`, etc.
      'https://picsum.photos/seed/trav01/1200/800',
      'https://picsum.photos/seed/trav02/800/1200',
      'https://picsum.photos/seed/trav03/1200/800',
      'https://picsum.photos/seed/trav04/1200/900',
      'https://picsum.photos/seed/trav05/900/1200',
      'https://picsum.photos/seed/trav06/1200/800',
      'https://picsum.photos/seed/trav07/1200/800',
      'https://picsum.photos/seed/trav08/800/1200',
      'https://picsum.photos/seed/trav09/1200/800',
      'https://picsum.photos/seed/trav10/1000/800',
      'https://picsum.photos/seed/trav11/1200/800',
      'https://picsum.photos/seed/trav12/800/800',
      'https://picsum.photos/seed/trav13/1200/800',
      'https://picsum.photos/seed/trav14/800/1200',
    ],
  },

  // ── PASSWORD-PROTECTED ALBUMS ─────────────────────────────
  //
  // ⚠️  NOTE ON SECURITY:
  //     Passwords are hashed client-side (SHA-256). This is a
  //     UX-level deterrent, NOT server-side security. Anyone
  //     who inspects the page source or network requests can
  //     still access the image URLs directly. For true access
  //     control, serve protected albums through a backend API
  //     that validates credentials before returning image URLs.
  //
  {
    id: 'family',
    title: 'Family',
    description: 'Private moments with the people who matter most.',
    protected: true,
    // Demo password: "family2024"
    // To change: generate hash with hashPassword('new-password').then(h => console.log(h))
    passwordHash: '071c00fa66449df33ffca0f3b71da9f9375eaf8feef471f348c9bac19e6f4914',
    photoCount: 10,
    // R2: Replace with `${R2_BASE_URL}/family/cover.jpg`
    coverImage: 'https://picsum.photos/seed/fam-cover/800/600',
    photos: [
      // R2: Replace each URL with `${R2_BASE_URL}/family/01.jpg`, etc.
      // Numbered 4×6 test images — sequence chosen so that Masonry fills
      // gaps naturally: 1-5 are portraits (fill all 3 cols), then 6+7
      // (landscapes) drop into the shortest column (under 3), showing
      // exactly the "7 fits under 6" gap-filling the user requested.
      'https://placehold.co/800x1200/1a1a1a/c9a96e?text=1',   // portrait
      'https://placehold.co/800x1200/1a1a1a/c9a96e?text=2',   // portrait
      'https://placehold.co/800x1200/1a1a1a/c9a96e?text=3',   // portrait
      'https://placehold.co/800x1200/1a1a1a/c9a96e?text=4',   // portrait
      'https://placehold.co/800x1200/1a1a1a/c9a96e?text=5',   // portrait
      'https://placehold.co/1200x800/1a1a1a/c9a96e?text=6',   // landscape → fills shortest col
      'https://placehold.co/1200x800/1a1a1a/c9a96e?text=7',   // landscape → fills under 6
      'https://placehold.co/800x1200/1a1a1a/c9a96e?text=8',   // portrait
      'https://placehold.co/1200x800/1a1a1a/c9a96e?text=9',   // landscape
      'https://placehold.co/800x1200/1a1a1a/c9a96e?text=10',  // portrait
    ],
  },

  {
    id: 'nieces-nephews',
    title: 'Nieces & Nephews',
    description: 'Growing up too fast — captured frame by frame.',
    protected: true,
    // Demo password: "sunshine"
    // To change: generate hash with hashPassword('new-password').then(h => console.log(h))
    passwordHash: 'a941a4c4fd0c01cddef61b8be963bf4c1e2b0811c037ce3f1835fddf6ef6c223',
    photoCount: 9,
    // R2: Replace with `${R2_BASE_URL}/nieces-nephews/cover.jpg`
    coverImage: 'https://picsum.photos/seed/kids-cover/800/600',
    photos: [
      // R2: Replace each URL with `${R2_BASE_URL}/nieces-nephews/01.jpg`, etc.
      'https://picsum.photos/seed/kids01/1200/800',
      'https://picsum.photos/seed/kids02/800/1200',
      'https://picsum.photos/seed/kids03/1200/800',
      'https://picsum.photos/seed/kids04/1200/900',
      'https://picsum.photos/seed/kids05/900/1200',
      'https://picsum.photos/seed/kids06/1200/800',
      'https://picsum.photos/seed/kids07/1200/800',
      'https://picsum.photos/seed/kids08/800/1200',
      'https://picsum.photos/seed/kids09/1200/800',
    ],
  },
];
