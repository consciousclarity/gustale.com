#!/usr/bin/env node
/**
 * Focused unit tests for U0-C browse helpers.
 * Run: node --test scripts/test-browse.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  absoluteDishesIndexHref,
  appendDishes,
  applyBrowseFilter,
  applyLineageFilter,
  buildBrowseQuery,
  buildCountryDirectory,
  buildFamilyDirectory,
  buildLineageQuery,
  clearBrowseFilters,
  clearLineageFilters,
  countryAlphaIndex,
  filterChipsFor,
  filterCountryDirectory,
  filterFamilyDirectory,
  hasMorePages,
  mapBrowseHref,
  pageOffset,
  parseBrowseState,
  parseLineageFilters,
  parseStructuredTokens,
  recoveryLinks,
  removeBrowseChip,
  removeLineageChip,
  safeQueryEncode,
  serializeBrowseState,
} from './browse-helpers.mjs';

describe('parse/serialize browse state', () => {
  it('round-trips query + filters and drops empties', () => {
    const state = parseBrowseState({ q: ' pho ', country: 'Japan', page: '2', junk: 'x' });
    assert.equal(state.q, 'pho');
    assert.equal(state.country, 'Japan');
    assert.equal(state.page, 2);
    const sp = serializeBrowseState(state);
    assert.equal(sp.get('q'), 'pho');
    assert.equal(sp.get('country'), 'Japan');
    assert.equal(sp.get('page'), '2');
    assert.equal(buildBrowseQuery(state), '?q=pho&country=Japan&page=2');
  });

  it('restores defaults safely', () => {
    const state = parseBrowseState({});
    assert.equal(state.page, 1);
    assert.equal(buildBrowseQuery(state), '');
  });
});

describe('structured tokens + filter removal', () => {
  it('parses legacy structured tokens without dominating free text', () => {
    const partial = parseStructuredTokens('ramen country:Italy technique:grilling');
    assert.equal(partial.q, 'ramen');
    assert.equal(partial.country, 'Italy');
    assert.equal(partial.technique, 'grilling');
  });

  it('removes chips and clears all', () => {
    const base = parseBrowseState({ q: 'x', country: 'Japan', page: '3' });
    const next = removeBrowseChip(base, 'country');
    assert.equal(next.country, null);
    assert.equal(next.page, 1);
    assert.equal(next.q, 'x');
    assert.ok(filterChipsFor(base).some((c) => c.stateKey === 'country'));
    assert.equal(clearBrowseFilters().page, 1);
  });
});

describe('result filtering', () => {
  const dishes = [
    { id: '1', slug: 'vindaloo', canonicalName: 'Vindaloo', originName: 'India', familySlug: 'stew', familyName: 'Stews', shortDescription: 'Hot curry' },
    { id: '2', slug: 'sushi', canonicalName: 'Sushi', originName: 'Japan', familySlug: 'rice-dish', familyName: 'Rice dishes', shortDescription: 'Vinegared rice' },
  ];

  it('filters by free text and structured country', () => {
    assert.equal(applyBrowseFilter(dishes, parseBrowseState({ q: 'sushi' })).length, 1);
    assert.equal(applyBrowseFilter(dishes, parseBrowseState({ country: 'india' })).length, 1);
  });
});

describe('pagination append/dedupe/offset', () => {
  it('computes offsets and appends without duplicates', () => {
    assert.equal(pageOffset(1, 24), 0);
    assert.equal(pageOffset(2, 24), 24);
    const merged = appendDishes([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]);
    assert.deepEqual(merged.map((d) => d.id), ['a', 'b', 'c']);
    assert.equal(hasMorePages(24, 24), true);
    assert.equal(hasMorePages(10, 24), false);
  });
});

describe('safe encoding + domain recovery', () => {
  it('encodes queries and keeps Atlas recovery absolute', () => {
    assert.equal(safeQueryEncode('filled dough'), 'filled%20dough');
    assert.equal(absoluteDishesIndexHref('geo', 'pho'), 'https://gustale.recipes/dishes?q=pho');
    assert.equal(absoluteDishesIndexHref('recipes', 'pho'), '/dishes?q=pho');
    const geo = recoveryLinks('geo');
    assert.ok(geo.primary.some((l) => l.href === '/regions' && l.label === 'Countries'));
    assert.equal(geo.altBrowse?.href, 'https://gustale.recipes/dishes');
    assert.equal(mapBrowseHref('recipes'), 'https://gustale.com/map');
    assert.equal(mapBrowseHref('geo'), '/map');
  });
});

describe('family + country directories', () => {
  const dishes = [
    { slug: 'a', canonicalName: 'Pierogi', familySlug: 'dumpling', familyName: 'Dumplings', originName: 'Poland' },
    { slug: 'b', canonicalName: 'Gyoza', familySlug: 'dumpling', familyName: 'Dumplings', originName: 'Japan' },
    { slug: 'c', canonicalName: 'Pho', familySlug: 'noodle-soup', familyName: 'Noodle soups', originName: 'Vietnam' },
  ];

  it('builds searchable family directory', () => {
    const fams = buildFamilyDirectory(dishes);
    assert.equal(fams.length, 2);
    assert.equal(fams.find((f) => f.slug === 'dumpling').count, 2);
    assert.ok(filterFamilyDirectory(fams, 'gyoza').some((f) => f.slug === 'dumpling'));
  });

  it('builds country directory with alpha index', () => {
    const countries = buildCountryDirectory(dishes);
    assert.ok(countries.some((c) => c.name === 'Japan'));
    assert.ok(filterCountryDirectory(countries, 'pierogi').some((c) => c.name === 'Poland'));
    assert.ok(countryAlphaIndex(countries).includes('J'));
  });
});

describe('lineage filters URL + matching', () => {
  it('serializes lineage filters and filters results', () => {
    const state = parseLineageFilters({ q: 'dough', region: 'china', confidence: 'documented' });
    assert.equal(buildLineageQuery(state), '?q=dough&region=china&confidence=documented');
    assert.equal(removeLineageChip(state, 'region').region, null);
    assert.equal(clearLineageFilters().q, '');

    const lineages = [
      {
        name: 'Filled dough',
        slug: 'filled-dough',
        originRegions: ['China'],
        relatedRegions: [],
        techniques: ['Boiling'],
        historicalForces: ['trade_route'],
        confidenceLevel: 'documented',
        representativeDishes: ['Jiaozi'],
        conceptSummary: 'Wrapped dough parcels',
      },
      {
        name: 'Noodle soup',
        slug: 'noodle-soup',
        originRegions: ['Japan'],
        relatedRegions: [],
        techniques: ['Simmering'],
        historicalForces: ['migration'],
        confidenceLevel: 'likely',
        representativeDishes: ['Ramen'],
      },
    ];
    assert.equal(applyLineageFilter(lineages, state).length, 1);
  });
});
