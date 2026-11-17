/**
 * Trip rail — the left-hand navigation shared by a trip page and its city albums.
 *
 * Opt-in per trip group with `layout: 'split'` (see js/albums/greece-2026.js).
 * The same rail renders on /gallery/<trip>/ and on every city album under it, so
 * moving between "the whole trip" and "one place" only swaps the right-hand pane.
 *
 *   TripRail.isSplitTrip(group)            → true when the group opts in
 *   TripRail.build({ trip, activeId, … })  → <aside class="trip-rail">
 *
 * Depends on globals from main.js: ALBUMS, Routes, albumPageUrl, albumCoverUrl,
 * getAlbumPhotoCount, gridUrl. Styles live in css/style.css (.trip-rail*).
 */
(function () {
  'use strict';

  function isSplitTrip(group) {
    return !!group && group.type === 'group' && group.layout === 'split'
      && Array.isArray(group.highlights) && group.highlights.length > 0;
  }

  /** Visible photo albums of the trip, in the group's subAlbums order. */
  function tripCities(trip) {
    return (trip.subAlbums || [])
      .map(id => ALBUMS.find(a => a.id === id))
      .filter(a => a && !a.hidden && a.type !== 'group'
        && a.albumKind !== 'film-roll' && getAlbumPhotoCount(a) > 0);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function linkRow({ href, label, thumbUrl, active, thumbPosition }) {
    const row = document.createElement(active ? 'span' : 'a');
    row.className = 'trip-rail-link' + (active ? ' is-active' : '');
    if (active) row.setAttribute('aria-current', 'page');
    else row.href = href;

    const thumb = el('span', 'trip-rail-thumb');
    if (thumbUrl) {
      const img = document.createElement('img');
      img.src = thumbUrl;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      if (thumbPosition) img.style.objectPosition = thumbPosition;
      thumb.appendChild(img);
    }
    row.append(thumb, el('span', 'trip-rail-label', label));
    return row;
  }

  /**
   * @param {object}  opts
   * @param {object}  opts.trip       group album object (layout: 'split')
   * @param {string}  opts.activeId   'overview' for the trip page, else a city album id
   * @param {boolean} opts.isTripPage true on /gallery/<trip>/ — the rail title is then the page <h1>
   */
  function build({ trip, activeId, isTripPage = false }) {
    const aside = el('aside', 'trip-rail');
    aside.setAttribute('aria-label', `${trip.title} navigation`);

    const backHref = trip.parentId
      ? Routes.group(trip.parentId)
      : (Routes.personalWork || '/personal-work/');
    const back = el('a', 'trip-rail-back');
    back.href = backHref;
    back.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
      + 'stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M19 12H5M5 12l7 7M5 12l7-7"/></svg>';
    back.appendChild(el('span', '', trip.parentId
      ? (ALBUMS.find(a => a.id === trip.parentId)?.title || 'Back')
      : 'Personal'));

    const title = el(isTripPage ? 'h1' : 'p', 'trip-rail-title', trip.title);
    const nav = el('nav', 'trip-rail-nav');
    nav.setAttribute('aria-label', `${trip.title} albums`);

    const overviewThumb = (trip.highlights || [])[0];
    nav.appendChild(linkRow({
      href: Routes.group(trip.id),
      label: 'Highlights',
      thumbUrl: overviewThumb ? gridUrl(overviewThumb) : '',
      active: activeId === 'overview',
    }));
    tripCities(trip).forEach(city => {
      nav.appendChild(linkRow({
        href: albumPageUrl(city),
        label: city.title,
        thumbUrl: albumCoverUrl(city),
        thumbPosition: city.coverPosition,
        active: activeId === city.id,
      }));
    });

    aside.append(back, title, nav);
    return aside;
  }

  window.TripRail = { isSplitTrip, build, tripCities };
})();
