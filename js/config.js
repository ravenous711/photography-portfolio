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

  // ── ITALY FILM GROUP ─────────────────────────────────────
  {
    id: 'italy-film',
    title: 'Italy Film',
    description: 'Film photography from Italy, 2026.',
    type: 'group',
    protected: true,
    // Password: "film-test"
    passwordHash: '78cc5547668122fb80386a825330fe2c2361662299ae2cde105062fafa2b2317',
    subAlbums: ['film-1', 'film-2', 'film-3', 'film-4'],
    coverImage: `${R2_BASE_URL}/Film-Test/ultramax_01.jpg`,
  },

  {
    id: 'film-1',
    title: 'Film 1',
    description: 'Kodak Ultramax 400 — Roll 1.',
    parentId: 'italy-film',
    protected: false,
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

  {
    id: 'film-2',
    title: 'Film 2',
    description: 'FP4 — Roll 2.',
    parentId: 'italy-film',
    protected: false,
    coverImage: `${R2_BASE_URL}/Film2/Fernando000799-R1-E001.jpg`,
    photos: [
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E001.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E002.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E003.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E004.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E005.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E006.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E007.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E008.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E009.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E010.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E011.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E012.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E013.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E014.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E015.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E016.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E017.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E018.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E019.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E020.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E021.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E022.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E023.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E024.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E025.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E026.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E027.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E028.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E029.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E030.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E031.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E032.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E033.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E034.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E035.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E036.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E037.jpg`,
      `${R2_BASE_URL}/Film2/Fernando000799-R1-E038.jpg`,
    ]
  },

  {
    id: 'film-3',
    title: 'Film 3',
    description: 'Kodak T-MAX — Roll 3.',
    parentId: 'italy-film',
    protected: false,
    coverImage: `${R2_BASE_URL}/Film3/Fernando000800-R1-E001.jpg`,
    photos: [
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E001.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E002.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E003.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E004.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E005.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E006.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E007.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E008.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E009.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E010.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E011.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E012.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E013.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E014.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E015.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E016.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E017.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E018.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E019.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E020.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E021.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E022.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E023.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E024.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E025.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E026.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E027.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E028.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E029.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E030.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E031.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E032.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E033.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E034.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E035.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E036.jpg`,
      `${R2_BASE_URL}/Film3/Fernando000800-R1-E037.jpg`,
    ]
  },

  {
    id: 'film-4',
    title: 'Film 4',
    description: 'Kodak Portra — Roll 4.',
    parentId: 'italy-film',
    protected: false,
    coverImage: `${R2_BASE_URL}/Film4/Raveen_portra_01.jpg`,
    photos: [
      `${R2_BASE_URL}/Film4/Raveen_portra_01.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_02.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_03.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_04.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_05.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_06.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_07.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_08.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_09.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_10.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_11.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_12.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_13.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_14.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_15.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_16.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_17.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_18.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_19.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_20.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_21.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_22.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_23.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_24.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_25.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_26.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_27.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_28.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_29.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_30.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_31.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_32.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_33.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_34.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_35.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_36.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_37.jpg`,
      `${R2_BASE_URL}/Film4/Raveen_portra_38.jpg`,
    ]
  },

  // ── GROUP ALBUMS ──────────────────────────────────────────
  // type: 'group' albums show a sub-album index page instead of photos.
  // Add photo URLs to each sub-album's photos array once uploaded to R2.
  {
    id: 'italy-2026',
    title: 'Italy 2026 — Coming Soon',
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
