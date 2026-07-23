/**
 * ESM twin of src/lib/searchNav.ts for Node tests / validate-build.
 * Keep algorithms in sync with the TypeScript source.
 */

export const ATLAS_ORIGIN = 'https://gustale.com';
export const RECIPES_ORIGIN = 'https://gustale.recipes';

export const RECIPES_ONLY_PATH_PREFIXES = [
  '/dishes/new',
  '/ingredients',
  '/admin',
];

export function isRecipesOnlyPath(path) {
  const p = path.split('?')[0];
  if (p === '/dishes/new' || p.startsWith('/dishes/new/')) return true;
  if (p.startsWith('/ingredients')) return true;
  if (p.startsWith('/admin')) return true;
  if (/^\/dishes\/[^/]+\/edit\/?$/.test(p)) return true;
  return false;
}

export function isDishesIndexPath(path) {
  const bare = (path.split('?')[0] ?? path).replace(/\/+$/, '') || '/';
  return bare === '/dishes';
}

export function resolveSearchHitHref(href, domain) {
  try {
    let pathOnly;
    let qs = '';
    if (href.startsWith('http://') || href.startsWith('https://')) {
      const u = new URL(href);
      pathOnly = u.pathname;
      qs = u.search;
    } else {
      const qIdx = href.indexOf('?');
      pathOnly = qIdx >= 0 ? href.slice(0, qIdx) : href;
      qs = qIdx >= 0 ? href.slice(qIdx) : '';
    }
    if (domain !== 'geo') return href;
    if (isRecipesOnlyPath(pathOnly) || isDishesIndexPath(pathOnly)) {
      const p = pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
      return `${RECIPES_ORIGIN}${p}${qs}`;
    }
    return href;
  } catch {
    return href;
  }
}

export function seeAllDishesHref(query, domain) {
  const qs = `?q=${encodeURIComponent(query)}`;
  if (domain === 'geo') return `${RECIPES_ORIGIN}/dishes${qs}`;
  return `/dishes${qs}`;
}

export function searchOptionId(placement, groupType, slug) {
  const safeType = String(groupType).replace(/[^a-z0-9_-]/gi, '');
  const safeSlug = String(slug).replace(/[^a-z0-9_-]/gi, '-') || 'item';
  return `gs-opt-${placement}-${safeType}-${safeSlug}`;
}

export function clampActiveIndex(activeIdx, count) {
  if (count <= 0) return 0;
  if (!Number.isFinite(activeIdx)) return 0;
  if (activeIdx < 0) return 0;
  if (activeIdx >= count) return count - 1;
  return activeIdx;
}

export function searchHelpLinks(domain) {
  if (domain === 'geo') {
    return [
      { href: '/', label: 'Globe' },
      { href: '/regions', label: 'Countries' },
      { href: '/families', label: 'Food families' },
      { href: '/lineages', label: 'Lineages' },
      { href: `${RECIPES_ORIGIN}/dishes`, label: 'Browse recipes' },
    ];
  }
  return [
    { href: '/dishes', label: 'Recipes' },
    { href: '/ingredients', label: 'Ingredients' },
    { href: '/families', label: 'Food families' },
    { href: '/lineages', label: 'Lineages' },
    { href: `${ATLAS_ORIGIN}/`, label: 'Browse Atlas' },
  ];
}

export function searchErrorBrowseLinks(domain) {
  if (domain === 'geo') {
    return [
      { href: '/regions', label: 'Countries' },
      { href: '/families', label: 'Food families' },
      { href: '/lineages', label: 'Lineages' },
      { href: `${RECIPES_ORIGIN}/dishes`, label: 'Browse recipes' },
    ];
  }
  return [
    { href: '/dishes', label: 'Recipes' },
    { href: '/ingredients', label: 'Ingredients' },
    { href: '/families', label: 'Food families' },
    { href: '/lineages', label: 'Lineages' },
    { href: `${ATLAS_ORIGIN}/`, label: 'Browse Atlas' },
  ];
}

export function isPrimaryNavActive(href, pathname, domain) {
  const p = pathname.endsWith('/') && pathname.length > 1
    ? pathname.slice(0, -1)
    : pathname;

  if (domain === 'geo') {
    if (href === '/') return p === '/' || p === '';
    if (href === '/regions') return p === '/regions' || p.startsWith('/regions/');
    if (href === '/families') {
      return (
        p === '/families'
        || p.startsWith('/families/')
        || p === '/family'
        || p.startsWith('/family/')
      );
    }
    if (href === '/lineages') return p === '/lineages' || p.startsWith('/lineages/');
    if (href === '/about') return p === '/about' || p.startsWith('/about/');
    return p === href || p.startsWith(`${href}/`);
  }

  if (href === '/dishes') return p === '/dishes' || p.startsWith('/dishes/');
  if (href === '/ingredients') {
    return p === '/ingredients' || p.startsWith('/ingredients/');
  }
  if (href === '/families') {
    return (
      p === '/families'
      || p.startsWith('/families/')
      || p === '/family'
      || p.startsWith('/family/')
    );
  }
  if (href === '/lineages') return p === '/lineages' || p.startsWith('/lineages/');
  if (href === '/about') return p === '/about' || p.startsWith('/about/');
  return p === href || p.startsWith(`${href}/`);
}

export function addDishHref(domain) {
  if (domain === 'geo') return `${RECIPES_ORIGIN}/dishes/new`;
  return '/dishes/new';
}
