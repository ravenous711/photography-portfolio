// ============================================================
// portfolio.js — public curated portfolio
// ============================================================
// Ordered selects for the public site. Archival albums stay in
// js/albums/*.js. A photo may appear in more than one category.
//
// Public pages render `PORTFOLIO[category]` only. `PORTFOLIO_SHOWCASE`
// is the admin trace for client photos staged or copied to the public
// portfolio-showcase/ prefix. Empty publicUrl means not yet public.
//
// Replacing the Couples placeholder: upload the shoot, then add its
// public image URLs to `couples` and clear `placeholder`.
// ============================================================

const PORTFOLIO_R2_ORIGIN = 'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/';
const PORTFOLIO_SHOWCASE_PREFIX = 'portfolio-showcase/';

const PORTFOLIO_CATEGORIES = [
  {
    id: 'featured',
    title: 'Selected work',
    path: '/',
    lede: 'A short edit across travel, everyday life, and gatherings.',
  },
  {
    id: 'travel',
    title: 'Travel',
    path: '/work/travel/',
    lede: 'Places, from Italy, California, and Red Rock Canyon.',
  },
  {
    id: 'life',
    title: 'Life',
    path: '/work/life/',
    lede: 'Film photographs that are not part of a trip.',
  },
  {
    id: 'events',
    title: 'Events',
    path: '/work/events/',
    lede: 'Gatherings and celebrations, starting with Moksha Yoga.',
  },
  {
    id: 'couples',
    title: 'Couples',
    path: '/work/couples/',
    lede: 'Engagements and portraits of two people.',
    placeholder: {
      title: 'Engagement photos to add',
      note: 'An engagement shoot is ready to upload. This page fills in once those photographs are selected.',
    },
  },
];

const PORTFOLIO = {
  featured: [
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Italy/Venice/Digital/venice_284.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/California/Yosemite/California-404.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Italy/Rome/Digital/rome_208.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Misc-Film-Rolls-2026/Ultramax-0314/ultramax_0314_22.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Red-Rock-Canyon-2026/20260122-_DSF0461-Edit.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Moksha-Yoga/Moksha-Yoga-05.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Italy/Florence/Digital/florence_180.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Misc-Film-Rolls-2026/Tmax-0726/tmax_400_0726_14.jpg',
  ],
  // A few frames from curated sets for Italy, California, and Red Rock.
  travel: [
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Italy/Venice/Digital/venice_042.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Italy/Venice/Digital/venice_284.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Italy/Venice/Digital/venice_485.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Italy/Florence/Digital/florence_006.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Italy/Florence/Digital/florence_180.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Italy/Pisa/Digital/pisa_042.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Italy/Assisi/Digital/assisi_031.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Italy/Rome/Digital/rome_208.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Italy/Rome/Digital/rome_266.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/California/Santa-Cruz-Big-Sur/California-026.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/California/Santa-Cruz-Big-Sur/California-118.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/California/Santa-Cruz-Big-Sur/California-200.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/California/Yosemite/California-404.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/California/Yosemite/California-455.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Red-Rock-Canyon-2026/20260121-_DSF0215.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Red-Rock-Canyon-2026/20260122-_DSF0461-Edit.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Red-Rock-Canyon-2026/20260125-_DSF0972.jpg',
  ],
  // Non-trip film only. Trip rolls (Italy, Red Rock) stay in Travel.
  life: [
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Misc-Film-Rolls-2026/Ultramax-0314/ultramax_0314_22.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Misc-Film-Rolls-2026/Tmax-0726/tmax_400_0726_14.jpg',
  ],
  // Approved Moksha teaser frames. These objects already exist on the public bucket.
  events: [
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Moksha-Yoga/Moksha-Yoga-05.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Moksha-Yoga/Moksha-Yoga-10.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Moksha-Yoga/Moksha-Yoga-14.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Moksha-Yoga/Moksha-Yoga-15.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Moksha-Yoga/Moksha-Yoga-16.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Moksha-Yoga/Moksha-Yoga-28.jpg',
  ],
  couples: [],
};

const PORTFOLIO_SHOWCASE = [
  { sourceAlbumId: 'moksha-yoga', sourceUrl: 'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Moksha-Yoga/Moksha-Yoga-05.jpg', publicUrl: 'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Moksha-Yoga/Moksha-Yoga-05.jpg', published: true },
  { sourceAlbumId: 'moksha-yoga', sourceUrl: 'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Moksha-Yoga/Moksha-Yoga-10.jpg', publicUrl: 'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Moksha-Yoga/Moksha-Yoga-10.jpg', published: true },
  { sourceAlbumId: 'moksha-yoga', sourceUrl: 'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Moksha-Yoga/Moksha-Yoga-14.jpg', publicUrl: 'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Moksha-Yoga/Moksha-Yoga-14.jpg', published: true },
  { sourceAlbumId: 'moksha-yoga', sourceUrl: 'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Moksha-Yoga/Moksha-Yoga-15.jpg', publicUrl: 'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Moksha-Yoga/Moksha-Yoga-15.jpg', published: true },
  { sourceAlbumId: 'moksha-yoga', sourceUrl: 'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Moksha-Yoga/Moksha-Yoga-16.jpg', publicUrl: 'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Moksha-Yoga/Moksha-Yoga-16.jpg', published: true },
  { sourceAlbumId: 'moksha-yoga', sourceUrl: 'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Moksha-Yoga/Moksha-Yoga-28.jpg', publicUrl: 'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Moksha-Yoga/Moksha-Yoga-28.jpg', published: true },
];

function portfolioCategory(id) {
  return PORTFOLIO_CATEGORIES.find(category => category.id === id) || null;
}

function portfolioPhotos(id) {
  const list = PORTFOLIO[id];
  if (!Array.isArray(list)) return [];
  return list.filter(url => typeof url === 'string' && url.startsWith(PORTFOLIO_R2_ORIGIN));
}

function portfolioPlaceholder(id) {
  if (portfolioPhotos(id).length) return null;
  return portfolioCategory(id)?.placeholder || null;
}
