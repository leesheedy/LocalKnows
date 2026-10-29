/**
 * Everything a quote form needs from the directory, computed at build time.
 *
 * The form recommends businesses in the browser once the person has said where
 * the job is, so the page carries a compact copy of two things: every locality
 * (to turn "Wodonga" or "3690" into a place) and the businesses that could do
 * this kind of job. Order is the directory's own: whether the business covers
 * the town, then distance, then the quality score. Nothing a payment writes to
 * is in either array, the same rule as `rank()` in repo.ts.
 */
import type { Listing } from './types';
import { localities, getLocality, getCategoryBySlug, listingsInCategory, url } from './repo';
import { QUOTE_SERVICES, type QuoteService } from './quote-services';

export { QUOTE_SERVICES };

/** [name, state, postcode, lat, lng] by index. The index is the id the candidates use. */
export type QuotePlace = [string, string, string, number, number];

export interface QuoteCandidate {
  /** Name, listing URL, phone, home town, state. */
  n: string;
  u: string;
  p: string;
  t: string;
  s: string;
  la: number;
  lo: number;
  /** Quality score, for the final tie break. */
  q: number;
  /** Verified licence. */
  v: 0 | 1;
  /**
   * Position of the business's best matching category in the service's list:
   * 0 is a solar installer on the solar form, 1 an electrician who also does it.
   * A specialist who covers the town is recommended before a generalist who does.
   */
  c: number;
  /** Indexes into the places array of every locality the business services. */
  a: number[];
}

const PLACE_INDEX = new Map(localities.map((l, i) => [l.id, i]));

export function quotePlaces(): QuotePlace[] {
  return localities.map((l) => [l.name, l.state, l.postcode, round(l.lat), round(l.lng)]);
}

const round = (x: number) => Math.round(x * 10000) / 10000;

const usable = (l: Listing) => l.status !== 'suspended' && l.status !== 'closed';

/** Every business in the service's categories, de-duplicated, best category first. */
export function quoteListings(service: QuoteService): Listing[] {
  const seen = new Set<string>();
  const out: Listing[] = [];
  for (const slug of service.categorySlugs) {
    const cat = getCategoryBySlug(slug);
    if (!cat) continue;
    for (const l of listingsInCategory(cat.id)) {
      if (!usable(l) || seen.has(l.id)) continue;
      seen.add(l.id);
      out.push(l);
    }
  }
  return out;
}

export function quoteCandidates(service: QuoteService): QuoteCandidate[] {
  const catIds = service.categorySlugs.map((s) => getCategoryBySlug(s)?.id);
  return quoteListings(service).flatMap((l) => {
    const home = getLocality(l.localityId);
    if (!home) return [];
    const areas = new Set([l.localityId, ...l.serviceAreaIds]);
    const c = catIds.findIndex((id) => id !== undefined && l.categoryIds.includes(id));
    return [
      {
        n: l.name,
        u: url.listing(l),
        p: l.phone ?? '',
        t: home.name,
        s: home.state,
        la: round(l.lat ?? home.lat),
        lo: round(l.lng ?? home.lng),
        q: l.qualityScore,
        v: l.status === 'verified' ? 1 : 0,
        c: c < 0 ? catIds.length : c,
        a: [...areas].map((id) => PLACE_INDEX.get(id)).filter((i): i is number => i !== undefined),
      },
    ];
  });
}

/** Services grouped for the hub page, in the order the groups are declared. */
export function servicesByGroup() {
  const groups = new Map<string, QuoteService[]>();
  for (const s of QUOTE_SERVICES) {
    const list = groups.get(s.group) ?? [];
    list.push(s);
    groups.set(s.group, list);
  }
  return [...groups.entries()];
}

/**
 * How many businesses are in the service's main category. This is the number
 * printed beside "local solar installers", so it must not include the
 * electricians the form also recommends from: they are not solar installers.
 */
export function quotePrimaryCount(service: QuoteService): number {
  const cat = getCategoryBySlug(service.categorySlugs[0]);
  return cat ? listingsInCategory(cat.id).filter(usable).length : 0;
}
