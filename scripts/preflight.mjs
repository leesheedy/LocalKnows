/**
 * Preflight. Runs before astro build and fails it on a broken invariant.
 *
 * The point is that a data problem stops the build rather than shipping as a
 * 404, a duplicate URL or a page that contradicts its own sitemap. Everything
 * checked here is something that has silently broken a directory before.
 */
import fs from 'node:fs';
import path from 'node:path';

const DATA = path.join(process.cwd(), 'src', 'data');
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const REQUIRED = [
  'geo-nsw.json',
  'geo-vic.json',
  'categories.json',
  'listings.json',
  'guides.json',
  'wire.json',
  'tools.json',
  'events.json',
  'lists.json',
];

for (const f of REQUIRED) {
  const p = path.join(DATA, f);
  if (!fs.existsSync(p)) {
    fail('missing data file: src/data/' + f);
    continue;
  }
  try {
    JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    fail('src/data/' + f + ' is not valid JSON: ' + e.message);
  }
}

if (errors.length) {
  console.error('\nPREFLIGHT FAILED\n');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}

const geo = { NSW: read('geo-nsw.json'), VIC: read('geo-vic.json') };
const taxonomy = read('categories.json');
const listings = read('listings.json');
const guides = read('guides.json');
const events = read('events.json');
const tools = read('tools.json');
const wire = read('wire.json');
const lists = read('lists.json');

const regions = [...geo.NSW.regions, ...geo.VIC.regions];
const localities = [...geo.NSW.localities, ...geo.VIC.localities];
const categories = taxonomy.categories;
const modifiers = taxonomy.modifiers ?? [];

// ---------------------------------------------------------------- geography

for (const state of ['NSW', 'VIC']) {
  const rs = new Set(regions.filter((r) => r.state === state).map((r) => r.slug));
  const seen = new Set();
  for (const l of localities.filter((l) => l.state === state)) {
    // Regions and localities share the /state/<slug>/ namespace by design.
    // A collision would silently drop one of the two pages.
    if (rs.has(l.slug)) fail('slug collision in ' + state + ': "' + l.slug + '" is both a region and a locality');
    if (seen.has(l.slug)) fail('duplicate locality slug in ' + state + ': ' + l.slug);
    seen.add(l.slug);
  }
}

const localityById = new Map(localities.map((l) => [l.id, l]));
const regionById = new Map(regions.map((r) => [r.id, r]));

for (const l of localities) {
  const r = regionById.get(l.regionId);
  if (!r) fail('locality ' + l.slug + ' points at missing region ' + l.regionId);
  else if (r.state !== l.state) fail('locality ' + l.slug + ' (' + l.state + ') sits in a ' + r.state + ' region');
  if (typeof l.lat !== 'number' || l.lat < -39.6 || l.lat > -27.8) fail('locality ' + l.slug + ' has an implausible latitude: ' + l.lat);
  if (typeof l.lng !== 'number' || l.lng < 140.7 || l.lng > 154.1) fail('locality ' + l.slug + ' has an implausible longitude: ' + l.lng);
  if (!/^\d{4}$/.test(String(l.postcode))) fail('locality ' + l.slug + ' has a malformed postcode: ' + l.postcode);
  if (l.tier === 4 && !localityById.has(l.rollsUpTo)) fail('tier 4 locality ' + l.slug + ' has no valid rollsUpTo');
  if (!l.blurb || l.blurb.length < 40) warn('locality ' + l.slug + ' has a thin blurb');
}

const blurbs = new Map();
for (const l of localities) {
  const key = (l.blurb || '').trim();
  if (!key) continue;
  if (blurbs.has(key)) warn('duplicate locality blurb: ' + l.slug + ' and ' + blurbs.get(key));
  else blurbs.set(key, l.slug);
}

// ---------------------------------------------------------------- taxonomy

const catBySlug = new Map();
const catById = new Map();
const VERTICALS = new Set(['trades', 'eat_drink', 'pubs_clubs', 'stay', 'things_to_do', 'clubs_hobbies']);
// Segments that already exist as static routes at the same depth. A slug that
// matches one of these silently loses to the static file and the page vanishes.
const RESERVED = new Set([
  'events',
  'page',
  'business',
  'search',
  'about',
  'contact',
  'claim',
  'partners',
  'v',
  'guides',
  'lists',
  'wire',
  'tools',
  'categories',
  'sitemap',
  'verified',
]);

for (const c of categories) {
  if (catBySlug.has(c.slug)) fail('duplicate category slug: ' + c.slug);
  if (catById.has(c.id)) fail('duplicate category id: ' + c.id);
  if (!VERTICALS.has(c.vertical)) fail('category ' + c.slug + ' has an unknown vertical: ' + c.vertical);
  // /nsw/albury/events/ is a real route. A category called "events" would eat it.
  if (RESERVED.has(c.slug)) fail('category slug "' + c.slug + '" collides with a reserved route segment');
  if (!c.schemaType) fail('category ' + c.slug + ' has no schemaType');
  catBySlug.set(c.slug, c);
  catById.set(c.id, c);
}

for (const m of modifiers) {
  if (!catById.has(m.categoryId)) fail('modifier ' + m.id + ' points at missing category ' + m.categoryId);
  if (RESERVED.has(m.slug)) fail('modifier slug "' + m.slug + '" collides with a reserved route segment');
}

// ---------------------------------------------------------------- listings

const listingSlugs = new Set();
const byLocalityCategory = new Map();

for (const l of listings) {
  if (listingSlugs.has(l.slug)) fail('duplicate listing slug: ' + l.slug);
  listingSlugs.add(l.slug);
  if (RESERVED.has(l.slug)) fail('listing slug "' + l.slug + '" collides with a reserved route segment');

  if (!localityById.has(l.localityId)) fail('listing ' + l.slug + ' points at missing locality ' + l.localityId);
  for (const cid of l.categoryIds) {
    if (!catById.has(cid)) fail('listing ' + l.slug + ' points at missing category ' + cid);
  }
  for (const sid of l.serviceAreaIds || []) {
    if (!localityById.has(sid)) fail('listing ' + l.slug + ' services missing locality ' + sid);
  }
  if (!Array.isArray(l.sources) || l.sources.length === 0) {
    warn('listing ' + l.slug + ' has no sources recorded');
  }
  if (!l.lastCheckedAt) fail('listing ' + l.slug + ' has no lastCheckedAt');
  if (l.reviews?.length && !l.isSample) {
    for (const r of l.reviews) {
      if (!r.author || !r.body || !r.publishedAt) fail('listing ' + l.slug + ' has a malformed review');
    }
  }
  // A verified credential without a check date is the exact claim we must not make.
  for (const lic of l.licences || []) {
    if (lic.verificationOk && !lic.lastVerifiedAt) {
      fail('listing ' + l.slug + ' claims a verified licence with no verification date');
    }
  }

  const key = l.localityId + '|' + l.categoryIds[0];
  const bucket = byLocalityCategory.get(key) ?? new Set();
  bucket.add(l.slug);
  byLocalityCategory.set(key, bucket);
}

// A business slug and a modifier slug share the /state/place/category/<slug>/ space.
for (const [key, slugs] of byLocalityCategory) {
  const categoryId = key.split('|')[1];
  for (const m of modifiers.filter((m) => m.categoryId === categoryId)) {
    if (slugs.has(m.slug)) {
      fail('slug collision: business "' + m.slug + '" clashes with the modifier of the same name in ' + key);
    }
  }
}

// ---------------------------------------------------------------- editorial

for (const g of guides) {
  for (const cs of g.categorySlugs || []) {
    if (!catBySlug.has(cs)) warn('guide ' + g.slug + ' references unknown category ' + cs);
  }
  if (g.reviewedAt < g.publishedAt) fail('guide ' + g.slug + ' was reviewed before it was published');
  if (!g.author) fail('guide ' + g.slug + ' has no author');
}

const localitySlugsByState = new Set(localities.map((l) => l.state + '|' + l.slug));
for (const e of events) {
  if (!localitySlugsByState.has(e.state + '|' + e.localitySlug)) {
    fail('event ' + e.slug + ' references unknown locality ' + e.localitySlug + ' (' + e.state + ')');
  }
  if (!/^\d{4}-\d{2}-\d{2}/.test(e.startDate)) fail('event ' + e.slug + ' has a malformed startDate');
}

for (const l of lists) {
  for (const item of l.items || []) {
    if (!listingSlugs.has(item.listingSlug)) warn('curated list ' + l.slug + ' references missing listing ' + item.listingSlug);
  }
}

for (const t of tools) {
  if (!['live', 'planned'].includes(t.status)) fail('tool ' + t.slug + ' has an invalid status');
}

// ---------------------------------------------------------------- coverage

const withListings = new Set(listings.map((l) => l.localityId));
const orphanCategories = categories.filter(
  (c) => !listings.some((l) => l.categoryIds.includes(c.id)),
);

console.log('');
console.log('PREFLIGHT');
console.log('  regions      ' + regions.length + '  (NSW ' + geo.NSW.regions.length + ', VIC ' + geo.VIC.regions.length + ')');
console.log('  localities   ' + localities.length + '  (' + withListings.size + ' with listings)');
console.log('  categories   ' + categories.length + '  (' + orphanCategories.length + ' with no listings yet)');
console.log('  modifiers    ' + modifiers.length);
console.log('  listings     ' + listings.length);
console.log('  guides       ' + guides.length + '   wire ' + wire.length + '   tools ' + tools.length + '   events ' + events.length + '   lists ' + lists.length);

if (warnings.length) {
  console.log('');
  console.log('  ' + warnings.length + ' warnings');
  for (const w of warnings.slice(0, 25)) console.log('    ' + w);
  if (warnings.length > 25) console.log('    ...and ' + (warnings.length - 25) + ' more');
}

if (errors.length) {
  console.error('');
  console.error('PREFLIGHT FAILED with ' + errors.length + ' errors');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}

console.log('');
console.log('  preflight clean');
