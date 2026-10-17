// ============================================================
// portfolio.js — public curated portfolio
// ============================================================
// Ordered selects for the public site. Archival albums stay in
// js/albums/*.js. A photo may appear in more than one category.
//
// Public pages render `PORTFOLIO[category]` only. The admin source trace
// for a private photo lives in js/portfolio-admin.js, which public pages
// do not load.
//
// Replacing an Engagements or Portraits placeholder: upload the shoot,
// tag the photographs in admin, then the page fills in on its own.
// ============================================================

const PORTFOLIO_R2_ORIGIN = 'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/';
const PORTFOLIO_SHOWCASE_PREFIX = 'portfolio-showcase/';

const PORTFOLIO_CATEGORIES = [
  {
    id: 'events',
    title: 'Events',
    path: '/photos/events/',
    lede: 'Gatherings and celebrations, starting with Moksha Yoga.',
  },
  {
    id: 'engagements',
    title: 'Engagements',
    path: '/photos/engagements/',
    lede: 'Engagement photographs.',
    placeholder: {
      title: 'Coming soon',
      note: 'An engagement shoot is ready to upload. This page fills in once those photographs are tagged.',
    },
  },
  {
    id: 'portraits',
    title: 'Portraits',
    path: '/photos/portraits/',
    lede: 'Senior portraits and other individual sittings.',
    placeholder: {
      title: 'Coming soon',
      note: 'Portrait sittings fill in here once those photographs are tagged.',
    },
  },
];

const PORTFOLIO = {
  events: [
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Moksha-Yoga/Moksha-Yoga-05.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Moksha-Yoga/Moksha-Yoga-10.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Moksha-Yoga/Moksha-Yoga-14.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Moksha-Yoga/Moksha-Yoga-15.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Moksha-Yoga/Moksha-Yoga-16.jpg',
    'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/Moksha-Yoga/Moksha-Yoga-28.jpg',
  ],
  engagements: [],
  portraits: [],
};

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
