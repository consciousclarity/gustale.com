#!/usr/bin/env node
/**
 * Focused unit tests for U0-B search/nav helpers.
 * Run: node --test scripts/test-search-nav.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  addDishHref,
  clampActiveIndex,
  isDishesIndexPath,
  isPrimaryNavActive,
  resolveSearchHitHref,
  searchErrorBrowseLinks,
  searchHelpLinks,
  searchOptionId,
  seeAllDishesHref,
} from './search-nav-helpers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('resolveSearchHitHref', () => {
  it('rewrites ingredients and dishes index on Atlas', () => {
    assert.equal(
      resolveSearchHitHref('/ingredients/ginger', 'geo'),
      'https://gustale.recipes/ingredients/ginger',
    );
    assert.equal(
      resolveSearchHitHref('/dishes?q=pho', 'geo'),
      'https://gustale.recipes/dishes?q=pho',
    );
    assert.equal(
      resolveSearchHitHref('/dishes', 'geo'),
      'https://gustale.recipes/dishes',
    );
  });

  it('preserves dish detail and query strings on Atlas', () => {
    assert.equal(resolveSearchHitHref('/dishes/vindaloo', 'geo'), '/dishes/vindaloo');
    assert.equal(
      resolveSearchHitHref('/ingredients/salt?x=1', 'geo'),
      'https://gustale.recipes/ingredients/salt?x=1',
    );
  });

  it('leaves relative hrefs alone on Recipes', () => {
    assert.equal(resolveSearchHitHref('/ingredients/ginger', 'recipes'), '/ingredients/ginger');
    assert.equal(resolveSearchHitHref('/dishes?q=pho', 'recipes'), '/dishes?q=pho');
  });
});

describe('seeAllDishesHref', () => {
  it('uses absolute Recipes URL on Atlas and preserves query encoding', () => {
    assert.equal(
      seeAllDishesHref('filled dough', 'geo'),
      'https://gustale.recipes/dishes?q=filled%20dough',
    );
    assert.equal(seeAllDishesHref('pho', 'recipes'), '/dishes?q=pho');
  });
});

describe('searchOptionId', () => {
  it('is placement-specific and stable', () => {
    const a = searchOptionId('header', 'dish', 'vindaloo');
    const b = searchOptionId('drawer', 'dish', 'vindaloo');
    assert.equal(a, 'gs-opt-header-dish-vindaloo');
    assert.equal(b, 'gs-opt-drawer-dish-vindaloo');
    assert.notEqual(a, b);
  });
});

describe('clampActiveIndex', () => {
  it('clamps and resets safely', () => {
    assert.equal(clampActiveIndex(0, 0), 0);
    assert.equal(clampActiveIndex(5, 0), 0);
    assert.equal(clampActiveIndex(-1, 3), 0);
    assert.equal(clampActiveIndex(99, 3), 2);
    assert.equal(clampActiveIndex(1, 3), 1);
  });
});

describe('fallback browse links', () => {
  it('Atlas help + error links are domain-valid', () => {
    const help = searchHelpLinks('geo');
    const err = searchErrorBrowseLinks('geo');
    assert.ok(help.some((l) => l.href === '/'));
    assert.ok(help.some((l) => l.href === '/regions'));
    assert.ok(help.some((l) => l.href === '/families'));
    assert.ok(help.some((l) => l.href === '/lineages'));
    assert.ok(help.some((l) => l.href === 'https://gustale.recipes/dishes'));
    assert.ok(!help.some((l) => l.href === '/dishes'));
    assert.ok(!help.some((l) => l.href === '/ingredients'));

    assert.ok(err.some((l) => l.href === '/regions' && l.label === 'Countries'));
    assert.ok(err.some((l) => l.href === '/families' && l.label === 'Food families'));
    assert.ok(err.some((l) => l.href === '/lineages'));
    assert.ok(err.some((l) => l.href === 'https://gustale.recipes/dishes'));
  });

  it('Recipes help + error links stay local where valid', () => {
    const help = searchHelpLinks('recipes');
    const err = searchErrorBrowseLinks('recipes');
    assert.ok(help.some((l) => l.href === '/dishes'));
    assert.ok(help.some((l) => l.href === '/ingredients'));
    assert.ok(help.some((l) => l.href === 'https://gustale.com/'));
    assert.ok(err.some((l) => l.href === '/dishes'));
    assert.ok(err.some((l) => l.href === '/ingredients'));
  });
});

describe('isPrimaryNavActive', () => {
  it('maps nested routes to primary links', () => {
    assert.equal(isPrimaryNavActive('/families', '/family/dumpling/', 'geo'), true);
    assert.equal(isPrimaryNavActive('/lineages', '/lineages/filled-dough/', 'geo'), true);
    assert.equal(isPrimaryNavActive('/regions', '/regions/japan/', 'geo'), true);
    assert.equal(isPrimaryNavActive('/dishes', '/dishes/vindaloo/', 'recipes'), true);
    assert.equal(isPrimaryNavActive('/', '/regions', 'geo'), false);
  });
});

describe('addDishHref', () => {
  it('is absolute on Atlas and local on Recipes', () => {
    assert.equal(addDishHref('geo'), 'https://gustale.recipes/dishes/new');
    assert.equal(addDishHref('recipes'), '/dishes/new');
  });
});

describe('isDishesIndexPath', () => {
  it('detects list but not detail', () => {
    assert.equal(isDishesIndexPath('/dishes'), true);
    assert.equal(isDishesIndexPath('/dishes/'), true);
    assert.equal(isDishesIndexPath('/dishes?q=x'), true);
    assert.equal(isDishesIndexPath('/dishes/vindaloo'), false);
  });
});

describe('canonical nav files', () => {
  it('SiteHeader.astro remains absent and Nav.astro exists', async () => {
    await assert.rejects(() => access(join(root, 'src/components/SiteHeader.astro')));
    await access(join(root, 'src/components/Nav.astro'));
  });
});
