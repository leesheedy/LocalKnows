/**
 * The repository.
 *
 * Templates import from here and nowhere else. The seed is JSON on disk today;
 * when Supabase comes online the bodies of these functions change and not one
 * .astro file has to be touched. That is the entire point of this module.
 */
import type {
  Category,
  CategoryModifier,
  CuratedList,
  EventRecord,
  Guide,
  Listing,
  Locality,
  Region,
  StateCode,
  ToolPage,
  Vertical,
  WireArticle,
} from './types';
import { POLICY, STATES } from './site';
import { nearestLocalities, distanceKm, type Neighbour } from './geo';
import { path } from './slug';
import { THEMES } from './themes';

import geoNsw from '../data/geo-nsw.json';
import geoVic from '../data/geo-vic.json';
import taxonomy from '../data/categories.json';
import listingsRaw from '../data/listings.json';
import guidesRaw from '../data/guides.json';
import wireRaw from '../data/wire.json';
import toolsRaw from '../data/tools.json';
import eventsRaw from '../data/events.json';
import listsRaw from '../data/lists.json';
import listsGeneratedRaw from '../data/lists-generated.json';
import communityRaw from '../data/community.json';

// ------------------------------------------------------------------ load

export const regions: Region[] = [
  ...(geoNsw.regions as Region[]),
  ...(geoVic.regions as Region[]),
];

export const localities: Locality[] = [
  ...(geoNsw.localities as Locality[]),
  ...(geoVic.localities as Locality[]),
];

export const categories: Category[] = (taxonomy.categories as Category[])
  .slice()
  .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

export const modifiers: CategoryModifier[] = taxonomy.modifiers as CategoryModifier[];
export const listings: Listing[] = listingsRaw as unknown as Listing[];
export const guides: Guide[] = guidesRaw as unknown as Guide[];
export const wire: WireArticle[] = wireRaw as unknown as WireArticle[];
export const tools: ToolPage[] = toolsRaw as unknown as ToolPage[];
export const events: EventRecord[] = eventsRaw as unknown as EventRecord[];
/**
 * Hand written lists first, then the compiled ones. Two files rather than one
 * because scripts/generate-lists.mjs rewrites its own output on every run and
 * must never be able to touch a list somebody wrote.
 */
export const curatedLists: CuratedList[] = [
  ...(listsRaw as unknown as CuratedList[]).map((l) => ({ method: 'written' as const, ...l })),
  ...(listsGeneratedRaw as unknown as CuratedList[]),
];

// ------------------------------------------------------------------ indexes

const indexById = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));
const indexBySlug = <T extends { slug: string }>(rows: T[]) => new Map(rows.map((r) => [r.slug, r]));

const regionById = indexById(regions);
const localityById = indexById(localities);
const categoryById = indexById(categories);
const categoryBySlug = indexBySlug(categories);
const listingBySlug = indexBySlug(listings);
const listingById = indexById(listings);

/** state + slug is the real key. Slugs are only unique within a state. */
const localityByStateSlug = new Map<string, Locality>(
  localities.map((l) => [l.state + '/' + l.slug, l]),
);
const regionByStateSlug = new Map<string, Region>(
  regions.map((r) => [r.state + '/' + r.slug, r]),
);

/**
 * The cross border index. A listing lands on a locality page when it either
 * sits there or services there, so this is a union and not an address lookup.
 */
const listingIdsByLocality = new Map<string, Set<string>>();
for (const l of listings) {
  const areas = new Set<string>([l.localityId, ...l.serviceAreaIds]);
  for (const localityId of areas) {
    let bucket = listingIdsByLocality.get(localityId);
    if (!bucket) {
      bucket = new Set<string>();
      listingIdsByLocality.set(localityId, bucket);
    }
    bucket.add(l.id);
  }
}

const localityListById = new Map<string, Listing[]>();
for (const [localityId, ids] of listingIdsByLocality) {
  const rows: Listing[] = [];
  for (const id of ids) {
    const found = listingById.get(id);
    if (found) rows.push(found);
  }
  localityListById.set(localityId, rows);
}

const listingsByCategory = new Map<string, Listing[]>();
for (const l of listings) {
  for (const c of l.categoryIds) {
    const bucket = listingsByCategory.get(c) ?? [];
    bucket.push(l);
    listingsByCategory.set(c, bucket);
  }
}

const localitiesByRegion = new Map<string, Locality[]>();
for (const l of localities) {
  const bucket = localitiesByRegion.get(l.regionId) ?? [];
  bucket.push(l);
  localitiesByRegion.set(l.regionId, bucket);
}

// ------------------------------------------------------------------ getters

export const getRegion = (id: string) => regionById.get(id);
export const getLocality = (id: string) => localityById.get(id);
export const getCategory = (id: string) => categoryById.get(id);
export const getCategoryBySlug = (slug: string) => categoryBySlug.get(slug);
export const getListingBySlug = (slug: string) => listingBySlug.get(slug);
export const getLocalityByStateSlug = (state: StateCode, slug: string) =>
  localityByStateSlug.get(state + '/' + slug);
export const getRegionByStateSlug = (state: StateCode, slug: string) =>
  regionByStateSlug.get(state + '/' + slug);

export const regionsInState = (state: StateCode) =>
  regions
    .filter((r) => r.state === state)
    .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));

export const localitiesInRegion = (regionId: string) =>
  (localitiesByRegion.get(regionId) ?? [])
    .slice()
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        (b.population ?? 0) - (a.population ?? 0) ||
        a.name.localeCompare(b.name),
    );

export const localitiesInState = (state: StateCode) => localities.filter((l) => l.state === state);

/** Tier 4 localities roll up into a neighbour and never get a page of their own. */
export const pageWorthyLocalities = () => localities.filter((l) => l.tier !== 4);

/**
 * Localities that actually have a page.
 *
 * A locality goes live when it has content, not before. Seeding empty pages
 * ahead of listings is how a directory teaches a crawler that its URL pattern
 * is mostly nothing, and the crawl budget never comes back.
 *
 * Tier deliberately does not appear in this test. Tier drives how much
 * editorial a place gets, not whether it exists: Bonegilla is a tier 4 locality
 * and the Migrant Experience is in it, so a rule that hid tier 4 hid a real
 * business behind a 404.
 *
 * What does appear is where a business is BASED, not where it is inferred to
 * travel. A suburb with one shop and forty trades who merely pass through it is
 * a near duplicate of the town next door, and generating that page is how a
 * directory builds thousands of pages that say the same thing.
 *
 * Every internal link to a locality must come from here, or it links to a page
 * that was never built.
 */
export const liveLocalities = () =>
  localities.filter((l) => listingsBasedIn(l.id).length >= POLICY.minBasedToGoLive);

/** Listings whose registered address is in this locality, not merely servicing it. */
export function listingsBasedIn(localityId: string): Listing[] {
  return listings.filter((l) => l.localityId === localityId && l.status !== 'suspended');
}

export const categoriesInVertical = (v: Vertical) => categories.filter((c) => c.vertical === v);

export const modifiersForCategory = (categoryId: string) =>
  modifiers.filter((m) => m.categoryId === categoryId);

export const getModifier = (categorySlug: string, modifierSlug: string) => {
  const cat = categoryBySlug.get(categorySlug);
  if (!cat) return undefined;
  return modifiers.find((m) => m.categoryId === cat.id && m.slug === modifierSlug);
};

// ------------------------------------------------------------------ queries

export function averageRating(l: Listing): number | undefined {
  if (!l.reviews.length) return undefined;
  const sum = l.reviews.reduce((t, r) => t + r.rating, 0);
  return Math.round((sum / l.reviews.length) * 10) / 10;
}

/** Ranking order. Quality, then rating, then name. Paid placement never enters here. */
function rank(a: Listing, b: Listing): number {
  if (b.qualityScore !== a.qualityScore) return b.qualityScore - a.qualityScore;
  const ra = averageRating(a) ?? 0;
  const rb = averageRating(b) ?? 0;
  if (rb !== ra) return rb - ra;
  return a.name.localeCompare(b.name);
}

export function listingsInLocality(localityId: string): Listing[] {
  return (localityListById.get(localityId) ?? []).filter((l) => l.status !== 'suspended');
}

/**
 * Listings for a money page, businesses actually based in the town first.
 *
 * A plumber based in Jindera outranks an Albury plumber who might drive out,
 * whatever their quality scores say, because that is the answer the person on
 * the page is looking for. Within each group the normal ranking applies.
 */
export function listingsInLocalityCategory(localityId: string, categoryId: string): Listing[] {
  const rows = listingsInLocality(localityId).filter((l) => l.categoryIds.includes(categoryId));
  const here = rows.filter((l) => l.localityId === localityId).sort(rank);
  const travels = rows.filter((l) => l.localityId !== localityId).sort(rank);
  return [...here, ...travels];
}

/** How many of them are actually based in the town. Drives the index gate. */
export function basedCountInLocalityCategory(localityId: string, categoryId: string): number {
  return listingsInLocality(localityId).filter(
    (l) => l.localityId === localityId && l.categoryIds.includes(categoryId),
  ).length;
}

export function listingsForModifier(
  localityId: string,
  categoryId: string,
  m: CategoryModifier,
): Listing[] {
  return listingsInLocalityCategory(localityId, categoryId).filter(
    (l) => l.attributes[m.attributeKey] === m.attributeValue,
  );
}

export function listingsInCategory(categoryId: string): Listing[] {
  return (listingsByCategory.get(categoryId) ?? [])
    .filter((l) => l.status !== 'suspended')
    .sort(rank);
}

/** Categories that actually have listings in a locality, most populous first. */
export function activeCategoriesInLocality(
  localityId: string,
): { category: Category; count: number }[] {
  const rows = listingsInLocality(localityId);
  const counts = new Map<string, number>();
  for (const l of rows) {
    for (const c of l.categoryIds) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return categories
    .filter((c) => counts.has(c.id))
    .map((c) => ({ category: c, count: counts.get(c.id) as number }))
    .sort((a, b) => b.count - a.count || a.category.sortOrder - b.category.sortOrder);
}

/** Nearest localities that have a page. Never returns a link to nothing. */
export function neighboursOf(locality: Locality, limit = POLICY.nearbyLinkCount): Neighbour[] {
  return nearestLocalities(locality, liveLocalities(), limit);
}

/**
 * Nearest localities that have a page FOR THIS CATEGORY.
 *
 * "Cafes in Wodonga" is only a link worth having if that page exists. The
 * category aware version is what the money pages use, because the plain one
 * produced a wall of 404s the first time this was built.
 */
export function neighboursWithCategory(
  locality: Locality,
  categoryId: string,
  limit = POLICY.nearbyLinkCount,
): Neighbour[] {
  const pool = liveLocalities().filter(
    (l) => listingsInLocalityCategory(l.id, categoryId).length > 0,
  );
  return nearestLocalities(locality, pool, limit);
}

export function listsForLocality(localitySlug: string): CuratedList[] {
  return curatedLists.filter((l) => l.localitySlug === localitySlug);
}

export function guidesForCategory(categorySlug: string): Guide[] {
  return guides.filter((g) => g.categorySlugs.includes(categorySlug));
}

export function eventsInLocality(localitySlug: string): EventRecord[] {
  return events
    .filter((e) => e.localitySlug === localitySlug)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ------------------------------------------------------------------ the data block
// Unique statistics per locality and category, computed from listing rows.
// This is the text that keeps thousands of pages out of thin content territory.

export interface LocalityCategoryStats {
  listingCount: number;
  verifiedCount: number;
  licencedCount: number;
  openSaturdayCount: number;
  openSundayCount: number;
  fromOtherLocality: number;
  crossBorderCount: number;
  avgCalloutFee?: number;
  calloutFeeLow?: number;
  calloutFeeHigh?: number;
  avgRating?: number;
  reviewCount: number;
  emergencyCount: number;
  mobileCount: number;
  medianResponseHours?: number;
}

export function localityCategoryStats(
  localityId: string,
  categoryId: string,
): LocalityCategoryStats {
  const rows = listingsInLocalityCategory(localityId, categoryId);
  const locality = localityById.get(localityId);
  const fees: number[] = [];
  const responses: number[] = [];
  let verified = 0;
  let licenced = 0;
  let sat = 0;
  let sun = 0;
  let fromElsewhere = 0;
  let crossBorder = 0;
  let reviewCount = 0;
  let ratingSum = 0;
  let emergency = 0;
  let mobile = 0;

  for (const l of rows) {
    if (l.status === 'verified') verified++;
    if (l.licences.some((x) => x.verificationOk)) licenced++;
    if (l.hours.some((h) => h.day === 6 && !h.closed)) sat++;
    if (l.hours.some((h) => h.day === 0 && !h.closed)) sun++;
    if (l.localityId !== localityId) fromElsewhere++;
    const home = localityById.get(l.localityId);
    if (home && locality && home.state !== locality.state) crossBorder++;
    const fee = Number(l.attributes.callout_fee);
    if (Number.isFinite(fee) && fee > 0) fees.push(fee);
    const resp = Number(l.attributes.median_response_hours);
    if (Number.isFinite(resp) && resp > 0) responses.push(resp);
    if (l.attributes.emergency_callout === 'yes') emergency++;
    if (l.attributes.mobile_service === 'yes' || l.isMobile) mobile++;
    for (const r of l.reviews) {
      reviewCount++;
      ratingSum += r.rating;
    }
  }

  fees.sort((a, b) => a - b);
  responses.sort((a, b) => a - b);

  return {
    listingCount: rows.length,
    verifiedCount: verified,
    licencedCount: licenced,
    openSaturdayCount: sat,
    openSundayCount: sun,
    fromOtherLocality: fromElsewhere,
    crossBorderCount: crossBorder,
    avgCalloutFee: fees.length
      ? Math.round(fees.reduce((a, b) => a + b, 0) / fees.length)
      : undefined,
    calloutFeeLow: fees.length ? fees[0] : undefined,
    calloutFeeHigh: fees.length ? fees[fees.length - 1] : undefined,
    avgRating: reviewCount ? Math.round((ratingSum / reviewCount) * 10) / 10 : undefined,
    reviewCount,
    emergencyCount: emergency,
    mobileCount: mobile,
    medianResponseHours: responses.length ? responses[Math.floor(responses.length / 2)] : undefined,
  };
}

// ------------------------------------------------------------------ urls
// Every internal URL is produced here. No template builds a path by hand.

export const url = {
  home: () => path(),
  state: (state: StateCode) => path(STATES[state].slug),
  region: (r: Region) => path(STATES[r.state].slug, r.slug),
  locality: (l: Locality) => path(STATES[l.state].slug, l.slug),
  localityCategory: (l: Locality, c: Category) => path(STATES[l.state].slug, l.slug, c.slug),
  localityCategoryPage: (l: Locality, c: Category, page: number) =>
    page <= 1
      ? path(STATES[l.state].slug, l.slug, c.slug)
      : path(STATES[l.state].slug, l.slug, c.slug, 'page', page),
  modifier: (l: Locality, c: Category, m: CategoryModifier) =>
    path(STATES[l.state].slug, l.slug, c.slug, m.slug),
  localityEvents: (l: Locality) => path(STATES[l.state].slug, l.slug, 'events'),
  /**
   * Business detail lives under its locality and primary category:
   *   /nsw/albury/cafes/the-hidden-cafe/
   * The short form /business/<slug>/ is kept as a permanent 301 alias, written
   * into _redirects at build time, so a listing always has one stable
   * identifier even if it is recategorised.
   */
  listing: (l: Listing) => {
    const loc = localityById.get(l.localityId);
    const cat = categoryById.get(l.categoryIds[0]);
    if (!loc || !cat) return path('business', l.slug);
    return path(STATES[loc.state].slug, loc.slug, cat.slug, l.slug);
  },
  listingAlias: (l: Listing) => path('business', l.slug),
  categoryIndex: () => path('categories'),
  category: (c: Category) => path('categories', c.slug),
  vertical: (slug: string) => path('categories', 'v', slug),
  guides: () => path('guides'),
  guide: (g: Guide) => path('guides', g.slug),
  lists: () => path('lists'),
  list: (l: CuratedList) => path('lists', l.slug),
  wire: () => path('wire'),
  wireArticle: (w: WireArticle) => path('wire', w.slug),
  tools: () => path('tools'),
  tool: (t: ToolPage) => path('tools', t.slug),
  events: () => path('events'),
  event: (e: EventRecord) => path('events', e.slug),
  search: () => path('search'),
  partners: () => path('partners'),
  claim: () => path('claim'),
  about: () => path('about'),
  contact: () => path('contact'),
  privacy: () => path('privacy'),
  terms: () => path('terms'),
  editorialPolicy: () => path('editorial-policy'),
  advertisingPolicy: () => path('advertising-policy'),
  dataPolicy: () => path('data-and-corrections'),
  sitemapPage: () => path('sitemap'),
  verified: () => path('verified'),
  thanks: () => path('thanks'),
};

export { STATES, POLICY };

// ------------------------------------------------------------------ link guard

const STATIC_PAGES = new Set<string>([
  '/',
  '/about/',
  '/contact/',
  '/claim/',
  '/partners/',
  '/search/',
  '/privacy/',
  '/terms/',
  '/editorial-policy/',
  '/advertising-policy/',
  '/data-and-corrections/',
  '/sitemap/',
  '/categories/',
  '/guides/',
  '/lists/',
  '/wire/',
  '/tools/',
  '/events/',
  '/nsw/',
  '/vic/',
]);

const stateFromSlug = (slug: string): StateCode | undefined =>
  slug === 'nsw' ? 'NSW' : slug === 'vic' ? 'VIC' : undefined;

/**
 * Does this internal path resolve to a page that gets built?
 *
 * Editorial bodies are written by hand and reference money pages that may not
 * exist yet, so `renderMarkdown` is given this predicate and silently unlinks
 * anything that would 404. It mirrors the getStaticPaths logic rather than
 * duplicating a list, so a route change cannot leave it stale.
 */
export function pageExists(href: string): boolean {
  if (!href.startsWith('/')) return false;
  const clean = href.split('#')[0].split('?')[0];
  if (STATIC_PAGES.has(clean)) return true;

  const parts = clean.split('/').filter(Boolean);
  if (!parts.length) return true;

  switch (parts[0]) {
    case 'nsw':
    case 'vic': {
      const state = stateFromSlug(parts[0]) as StateCode;
      if (parts.length === 1) return true;

      const locality = getLocalityByStateSlug(state, parts[1]);
      const region = getRegionByStateSlug(state, parts[1]);

      if (parts.length === 2) {
        if (region) return true;
        return Boolean(locality) && listingsInLocality((locality as Locality).id).length > 0;
      }
      if (!locality || listingsInLocality(locality.id).length === 0) return false;

      if (parts[2] === 'events') return parts.length === 3 && eventsInLocality(locality.slug).length > 0;

      const category = categoryBySlug.get(parts[2]);
      if (!category) return false;
      const rows = listingsInLocalityCategory(locality.id, category.id);
      if (parts.length === 3) return rows.length > 0;
      if (rows.length === 0) return false;

      if (parts[3] === 'page') {
        const page = Number(parts[4]);
        return Number.isInteger(page) && page > 1 && page <= Math.ceil(rows.length / POLICY.perPage);
      }
      const modifier = modifiers.find((m) => m.categoryId === category.id && m.slug === parts[3]);
      if (modifier) {
        return listingsForModifier(locality.id, category.id, modifier).length >= POLICY.minListingsForModifierPage;
      }
      const listing = listingBySlug.get(parts[3]);
      return Boolean(
        listing && listing.localityId === locality.id && listing.categoryIds[0] === category.id,
      );
    }

    case 'categories':
      if (parts.length === 1) return true;
      if (parts[1] === 'v') return parts.length === 3;
      return parts.length === 2 && categoryBySlug.has(parts[1]);

    case 'guides':
      return parts.length === 2 && guides.some((g) => g.slug === parts[1]);
    case 'lists':
      return parts.length === 2 && curatedLists.some((l) => l.slug === parts[1]);
    case 'wire':
      return parts.length === 2 && wire.some((w) => w.slug === parts[1]);
    case 'tools':
      return parts.length === 2 && tools.some((t) => t.slug === parts[1]);
    case 'events':
      return parts.length === 2 && events.some((e) => e.slug === parts[1]);
    case 'business':
      return parts.length === 2 && listingBySlug.has(parts[1]);

    default:
      return false;
  }
}

/**
 * One predicate for "does this locality have a page".
 *
 * Every page that links to a locality has to agree with the route that builds
 * it. When the rule lived in six places it drifted in three of them and the
 * homepage linked to towns that were never generated.
 */
const LIVE_IDS = new Set(liveLocalities().map((l) => l.id));
export const isLiveLocality = (localityId: string): boolean => LIVE_IDS.has(localityId);

/** Does /state/place/events/ get built for this locality? */
export const hasLocalityEvents = (localitySlug: string): boolean =>
  eventsInLocality(localitySlug).length > 0;

// ------------------------------------------------------------------ community

export interface CommunityLink {
  name: string;
  url: string;
  type: 'council' | 'community' | 'buysell' | 'events' | 'news' | 'emergency' | 'tourism';
  note: string;
  covers: string[];
  source: string;
  checkedAt: string;
  private?: boolean;
}

/**
 * Official and community pages, per town.
 *
 * One entry can cover many localities, because a council page genuinely serves
 * its whole LGA and duplicating it per suburb would be noise in the data and a
 * wall of repetition on the page.
 *
 * Every URL was read off the organisation's own website. None were constructed
 * from a name, which is the only way to avoid publishing a link to a page that
 * does not exist or, worse, to somebody squatting the name.
 */
const communityEntries = (communityRaw as { entries: CommunityLink[] }).entries;

const COMMUNITY_ORDER: CommunityLink['type'][] = [
  'council',
  'community',
  'events',
  'news',
  'tourism',
  'buysell',
  'emergency',
];

export function communityFor(localitySlug: string): CommunityLink[] {
  return communityEntries
    .filter((e) => e.covers.includes(localitySlug))
    .sort((a, b) => COMMUNITY_ORDER.indexOf(a.type) - COMMUNITY_ORDER.indexOf(b.type));
}

export const COMMUNITY_TYPE_LABEL: Record<CommunityLink['type'], string> = {
  council: 'Council',
  community: 'Community noticeboard',
  events: 'What is on',
  news: 'Local news',
  tourism: 'Tourism',
  buysell: 'Buy, swap and sell',
  emergency: 'Emergency and alerts',
};

// ------------------------------------------------------------------ themes

/**
 * Which themed pages exist for a locality.
 *
 * Same shape as isLiveLocality and hasTownGuide, and here for the same reason:
 * the route decides existence by a threshold, so anything that links to one has
 * to ask the same question rather than assume.
 */
export function themesFor(localityId: string) {
  const rows = listingsInLocality(localityId);
  return THEMES.filter((t) => {
    const matched = rows.filter((l) => t.matches(l, categoryById.get(l.categoryIds[0])));
    if (matched.length < t.min) return false;
    // At least one of them has to actually be here. Without this,
    // /nsw/west-albury/with-kids/ was five listings and all five were Albury's.
    const here = matched.filter((l) => l.localityId === localityId).length;
    return here >= POLICY.minBasedForThemePage;
  });
}

/** The listings a theme page shows, in page order. Used by the route and the page. */
export function listingsForTheme(localityId: string, themeSlug: string): Listing[] {
  const theme = THEMES.find((t) => t.slug === themeSlug);
  if (!theme) return [];
  return listingsInLocality(localityId)
    .filter((l) => theme.matches(l, categoryById.get(l.categoryIds[0])))
    .sort((a, b) => b.qualityScore - a.qualityScore);
}

/**
 * Everything that makes one town different from the next.
 *
 * The "new in town" and "hidden gems" pages used to be built for twelve
 * localities only, because the earlier versions were assembled from
 * listingsInLocality() — which includes every tradesperson who merely drives
 * through — and for a suburb that produced a page identical to the town next
 * door's. /nsw/west-albury/with-kids/ was five listings and all five were
 * Albury's. The gate was the honest fix at the time.
 *
 * The gate is not needed once the pages stop being lists of borrowed listings.
 * A town is distinguishable from its neighbour by things that are true of it
 * and nothing else: which businesses are actually based there, which council
 * runs it, how far it is to the place people drive for everything else, and
 * what they drive there for. All of that is per town, so all of it is here, in
 * one function that both pages read, rather than each page deciding for itself.
 */
export interface TownHub {
  locality: Locality;
  distanceKm: number;
  crossesBorder: boolean;
  basedCount: number;
}

export interface TownProfile {
  locality: Locality;
  region?: Region;
  /** Businesses with an address here. The part that is genuinely this town. */
  based: Listing[];
  /** Businesses that travel here but are based elsewhere. */
  visiting: Listing[];
  basedCategories: { category: Category; count: number }[];
  /**
   * The bigger place people go for what is not here. Absent for the towns that
   * are themselves the destination, which is how a page knows not to say
   * "for everything else, drive to...".
   */
  hub?: TownHub;
  /** Categories the hub has and this town does not. What you drive there for. */
  goToHubFor: Category[];
  neighbours: Neighbour[];
  community: CommunityLink[];
  events: EventRecord[];
  lists: CuratedList[];
  /** True when a nearby town people use daily is in the other state. */
  bordersOtherState: boolean;
}

/**
 * The hub is chosen on population and tier, never on how many listings we hold.
 *
 * The first version of this ranked by our own listing count and produced advice
 * that was confidently wrong. Rutherglen carries 22 listings because its
 * wineries were researched hard, so a town of 2,600 was being named as the
 * regional centre for its neighbours. Wangaratta is a tier 1 city of 19,500
 * with 2 listings, so it was being told to send its residents to Rutherglen.
 *
 * Listing counts measure how far our research has got. Population and tier are
 * facts about the place. Only the second kind belongs in a sentence telling
 * somebody where to drive, or the site's advice silently changes every time we
 * ingest another town.
 *
 * Tier is ranked before distance so a genuine centre wins over a nearer
 * suburb: Jindera is sent to Albury and not to Lavington, which is closer but
 * is part of Albury anyway.
 */
const HUB_POPULATION_MULTIPLE = 2.5;
const HUB_POPULATION_FLOOR = 5000;
const HUB_MAX_KM = 60;

function hubFor(locality: Locality): TownHub | undefined {
  // Enough bigger to be worth the drive. Without the multiple, Wodonga at
  // 43,000 would be named as the hub for Wangaratta at 19,500, and Wangaratta
  // is nobody's satellite.
  const need = Math.max(HUB_POPULATION_FLOOR, (locality.population ?? 0) * HUB_POPULATION_MULTIPLE);

  const best = liveLocalities()
    .filter((l) => l.id !== locality.id && l.tier <= 2 && (l.population ?? 0) >= need)
    .map((l) => ({ locality: l, distanceKm: distanceKm(locality, l) }))
    .filter((c) => c.distanceKm <= HUB_MAX_KM)
    .sort((a, b) => a.locality.tier - b.locality.tier || a.distanceKm - b.distanceKm)[0];

  if (!best) return undefined;
  return {
    locality: best.locality,
    distanceKm: best.distanceKm,
    crossesBorder: best.locality.state !== locality.state,
    basedCount: listingsBasedIn(best.locality.id).length,
  };
}

export function townProfile(locality: Locality): TownProfile {
  const based = listingsBasedIn(locality.id).sort((a, b) => b.qualityScore - a.qualityScore);
  const basedIds = new Set(based.map((l) => l.id));
  const visiting = listingsInLocality(locality.id)
    .filter((l) => !basedIds.has(l.id))
    .sort((a, b) => b.qualityScore - a.qualityScore);

  const counts = new Map<string, number>();
  for (const l of based) {
    const primary = l.categoryIds[0];
    if (primary) counts.set(primary, (counts.get(primary) ?? 0) + 1);
  }
  const basedCategories = categories
    .filter((c) => counts.has(c.id))
    .map((c) => ({ category: c, count: counts.get(c.id) as number }))
    .sort((a, b) => b.count - a.count || a.category.sortOrder - b.category.sortOrder);

  const hub = hubFor(locality);

  // Categories the hub has and this town does not, most useful first. Capped,
  // because a list of forty things you cannot get locally reads as an insult
  // to the town rather than as help.
  const hereCats = new Set(basedCategories.map((c) => c.category.id));
  const goToHubFor = hub
    ? Array.from(
        new Map(
          listingsBasedIn(hub.locality.id)
            .map((l) => categoryById.get(l.categoryIds[0]))
            .filter((c): c is Category => Boolean(c) && !hereCats.has((c as Category).id))
            .map((c) => [c.id, c]),
        ).values(),
      )
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .slice(0, 10)
    : [];

  const neighbours = neighboursOf(locality, 8);

  return {
    locality,
    region: getRegion(locality.regionId),
    based,
    visiting,
    basedCategories,
    hub,
    goToHubFor,
    neighbours,
    community: communityFor(locality.slug),
    events: eventsInLocality(locality.slug),
    lists: listsForLocality(locality.slug),
    bordersOtherState: neighbours.some((nb) => nb.crossesBorder),
  };
}

/**
 * Localities that get a "new in town" and "hidden gems" page: every live one.
 *
 * Deliberately not hasGuidePages(). Those pages are now built from what is
 * true of the town rather than from listings borrowed off its neighbour, so
 * the duplication that justified the narrower gate cannot happen: the cards
 * are businesses based here, and everywhere else is linked to rather than
 * copied in.
 */
export const townGuideLocalities = () => liveLocalities();

export const hasTownGuide = (localityId: string): boolean => isLiveLocality(localityId);

/**
 * Hidden gems: the rules, in one place.
 *
 * The page prints these rules in its standfirst, and a "hidden gems" list that
 * will not say how it chose is an advertorial. So the rules live here rather
 * than in the template, which also means the route, the links pointing at it
 * and the page itself all answer "does this town have gems" identically.
 *
 * Everything is judged on businesses actually BASED in the town. The earlier
 * version drew from listingsInLocality(), which includes every tradesperson
 * who drives through, and the result for a suburb was a page of the next
 * town's businesses under a different heading.
 */
export interface Gem {
  listing: Listing;
  reason: string;
}

/**
 * Below this many businesses based in a town, being the only one of your kind
 * is a fact about the town. Above it, it is a fact about our category tree,
 * and every sole trader in Albury would qualify.
 */
const GEM_SMALL_TOWN = 15;

const gemIsFree = (l: Listing) => l.attributes?.free_entry === 'yes';
const gemIsClub = (l: Listing) => l.vertical === 'clubs_hobbies';
const gemIsThinCategory = (l: Listing) => listingsInCategory(l.categoryIds[0]).length < 4;
const gemIsIndependentRetail = (l: Listing) => {
  const c = categoryById.get(l.categoryIds[0]);
  if (!c || c.vertical !== 'trades') return false;
  return /shops?$|stores?$|butchers|greengrocers|delis|florists|nurseries|jewellers|op-shops|produce|bookshops/.test(
    c.slug,
  );
};

export function hiddenGemsIn(localityId: string): Gem[] {
  const here = listingsBasedIn(localityId);
  const smallTown = here.length < GEM_SMALL_TOWN;

  const soleOfItsKind = (l: Listing) =>
    smallTown && here.filter((x) => x.categoryIds[0] === l.categoryIds[0]).length === 1;

  return here
    .map((listing) => {
      // Order matters: the first rule that fits is the one shown, so the most
      // specific reason wins rather than whichever happens to be checked last.
      let reason: string | null = null;
      if (gemIsFree(listing)) reason = 'Free, so nobody advertises it';
      else if (gemIsClub(listing)) reason = 'A club, and clubs are invisible on every other directory';
      else if (gemIsIndependentRetail(listing))
        reason = 'Independent retail, which loses every search to the chains';
      else if (gemIsThinCategory(listing))
        reason = 'In a category too small to rank, so it never surfaces';
      else if (soleOfItsKind(listing)) reason = 'The only one of its kind based in town';
      return reason ? { listing, reason } : null;
    })
    .filter((g): g is Gem => g !== null)
    .sort((a, b) => b.listing.qualityScore - a.listing.qualityScore);
}

export const hasHiddenGems = (localityId: string): boolean => hiddenGemsIn(localityId).length > 0;

export const hiddenGemLocalities = () => liveLocalities().filter((l) => hasHiddenGems(l.id));
