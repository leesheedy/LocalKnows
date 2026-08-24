/**
 * Indexation policy, in one place.
 *
 * The robots meta tag, the sitemap and the internal link graph all read this
 * module, so a page can never be noindex in the head and present in the sitemap
 * at the same time. That mismatch is the most common way a directory of this
 * size quietly loses its crawl budget.
 *
 * Rule that overrides everything: never delete, never 404 a page that once
 * ranked. Thin pages go noindex, follow and keep their links.
 */
import { POLICY, SITE } from './site';

export type PageKind =
  | 'home'
  | 'state'
  | 'region'
  | 'locality'
  | 'townGuide'
  | 'localityCategory'
  | 'modifier'
  | 'listing'
  | 'categoryIndex'
  | 'category'
  | 'vertical'
  | 'guide'
  | 'list'
  | 'wire'
  | 'tool'
  | 'event'
  | 'eventIndex'
  | 'static'
  | 'utility';

export interface IndexDecision {
  index: boolean;
  follow: boolean;
  inSitemap: boolean;
  /** Relative weight inside its own sitemap file. Honest, not all 1.0. */
  priority: number;
  reason: string;
}

export interface IndexInput {
  kind: PageKind;
  /** Listings on the page, for the count based gates. */
  listingCount?: number;
  /** Listing quality score, for listing detail pages. */
  qualityScore?: number;
  /** Paginated pages past the first are indexable but lower priority. */
  page?: number;
  /** Search, claim and filter views are always noindex, follow. */
  utility?: boolean;
  /** Events that have finished. */
  isPast?: boolean;
  /** Listings actually based in the locality, as opposed to servicing it. */
  basedCount?: number;
}

/**
 * A town guide is indexed once this many businesses are based in the town.
 * Below it the page is mostly furniture, which is the same number that used to
 * decide whether the page was built at all.
 */
const TOWN_GUIDE_INDEX_FLOOR = 5;

/** Upcoming events a calendar needs before it is worth indexing as a calendar. */
const EVENT_INDEX_FLOOR = 3;

const NOINDEX_FOLLOW = (reason: string, priority = 0): IndexDecision => ({
  index: false,
  follow: true,
  inSitemap: false,
  priority,
  reason,
});

export function decide(input: IndexInput): IndexDecision {
  const { kind, listingCount = 0, qualityScore = 0, page = 1, isPast = false } = input;

  if (input.utility || kind === 'utility') {
    return NOINDEX_FOLLOW('utility view, no standalone search value');
  }

  switch (kind) {
    case 'home':
      return { index: true, follow: true, inSitemap: true, priority: 1.0, reason: 'root' };

    case 'state':
      return { index: true, follow: true, inSitemap: true, priority: 0.9, reason: 'state hub' };

    case 'region':
      return listingCount > 0
        ? { index: true, follow: true, inSitemap: true, priority: 0.7, reason: 'region hub with content' }
        : NOINDEX_FOLLOW('region has no live towns yet, kept as a crawl path');

    case 'locality':
      return listingCount > 0
        ? { index: true, follow: true, inSitemap: true, priority: 0.8, reason: 'locality with listings' }
        : NOINDEX_FOLLOW('locality has no listings yet');

    /*
     * "New in town" and "hidden gems" now exist for every live locality,
     * because the questions they answer — which council, which state, what is
     * actually based here, where you drive for the rest — have a different
     * answer in every town however small.
     *
     * Existing and being indexed are separate decisions. Measured on the built
     * output, the prose of two one-business suburbs is only about 15% identical,
     * but there is so little of it that page furniture dominates the rest. That
     * is thin, not duplicated, and thin pages are better kept out of the index
     * and left as crawl paths than either published into it or withheld from
     * the people who want them.
     */
    case 'townGuide':
      return (input.basedCount ?? 0) >= TOWN_GUIDE_INDEX_FLOOR
        ? { index: true, follow: true, inSitemap: true, priority: 0.6, reason: 'town guide with enough of its own' }
        : NOINDEX_FOLLOW(
            'fewer than ' +
              TOWN_GUIDE_INDEX_FLOOR +
              ' businesses based here, so the page is thin however true it is',
          );

    case 'localityCategory':
      if (listingCount < POLICY.minListingsToIndex) {
        return NOINDEX_FOLLOW(
          'below the ' + POLICY.minListingsToIndex + ' listing threshold, flips to index automatically once it crosses',
        );
      }
      // A page made entirely of businesses from the next town is a duplicate of
      // the next town's page wearing a different H1. It is worth having, because
      // somebody in that village genuinely wants to know who will drive out. It
      // is not worth putting in an index.
      if ((input.basedCount ?? 1) < 1) {
        return NOINDEX_FOLLOW('nobody in this category is based here, only travels here');
      }
      return {
        index: true,
        follow: true,
        inSitemap: true,
        priority: page > 1 ? 0.4 : 0.9,
        reason: 'money page above the listing threshold',
      };

    case 'modifier':
      if (listingCount < POLICY.minListingsForModifierPage) {
        return NOINDEX_FOLLOW('modifier page below threshold and should not have been generated');
      }
      return { index: true, follow: true, inSitemap: true, priority: 0.6, reason: 'long tail modifier' };

    case 'listing':
      if (qualityScore < POLICY.minListingQualityToIndex) {
        return NOINDEX_FOLLOW('listing quality below ' + POLICY.minListingQualityToIndex);
      }
      return { index: true, follow: true, inSitemap: true, priority: 0.6, reason: 'listing detail' };

    case 'categoryIndex':
    case 'vertical':
      return { index: true, follow: true, inSitemap: true, priority: 0.7, reason: 'category hub' };

    /*
     * A category hub with nothing in it says so on its own face: "Nothing listed
     * in this category yet." That sentence is the page telling you it should not
     * be in an index. Forty three of them were, and the taxonomy is meant to run
     * ahead of the data, so this will keep happening every time a category is
     * defined before it is filled. The page is still worth having and still
     * worth crawling, because it carries the definition, the synonyms and the
     * link to add the first business, and it flips to indexed the build after
     * somebody does.
     */
    case 'category':
      return listingCount > 0
        ? { index: true, follow: true, inSitemap: true, priority: 0.7, reason: 'category hub' }
        : NOINDEX_FOLLOW('category defined but nothing listed in it yet');

    case 'guide':
    case 'tool':
      return { index: true, follow: true, inSitemap: true, priority: 0.8, reason: 'editorial and tools earn links' };

    case 'list':
      return { index: true, follow: true, inSitemap: true, priority: 0.7, reason: 'curated list' };

    case 'wire':
      return { index: true, follow: true, inSitemap: true, priority: 0.6, reason: 'wire article' };

    case 'event':
      return isPast
        ? NOINDEX_FOLLOW('event has passed, page kept with a pointer to the next one')
        : { index: true, follow: true, inSitemap: true, priority: 0.5, reason: 'upcoming event' };

    /*
     * A town calendar holding one event is a page about one event, and the
     * event already has its own page. Eighteen of the nineteen town calendars
     * were sitting in the index under 300 words, all of them furniture around a
     * single row, which is the same thinness the town guide floor exists to
     * catch. Three upcoming events is a calendar. Below that the page stays,
     * keeps its links to the events and to the town, and stays out of the index
     * until the town fills it. Callers pass listingCount as the number of
     * UPCOMING events, so a calendar comes back on its own the build after a
     * third one is added.
     */
    case 'eventIndex':
      return listingCount >= EVENT_INDEX_FLOOR
        ? { index: true, follow: true, inSitemap: true, priority: 0.6, reason: 'events index' }
        : NOINDEX_FOLLOW(
            'fewer than ' + EVENT_INDEX_FLOOR + ' upcoming events, so the calendar is furniture around a row',
          );

    case 'static':
      return { index: true, follow: true, inSitemap: true, priority: 0.3, reason: 'policy and about pages' };

    default:
      return NOINDEX_FOLLOW('unclassified');
  }
}

/**
 * Robots content string.
 *
 * `max-image-preview:large` and `max-snippet:-1` are set deliberately. A
 * directory wants to be quoted at length by answer engines, not truncated.
 */
export function robotsContent(d: IndexDecision): string {
  const base = [d.index ? 'index' : 'noindex', d.follow ? 'follow' : 'nofollow'];
  if (d.index) base.push('max-snippet:-1', 'max-image-preview:large', 'max-video-preview:-1');
  return base.join(', ');
}

/**
 * Outbound rel for a business website link.
 *
 * Dofollow is earned by verification, never by a link back. See
 * docs/ARCHITECTURE.md section 6 for why the reciprocal version is not built.
 */
export function outboundRel(opts: {
  status: string;
  qualityScore: number;
  isSample: boolean;
}): string {
  if (opts.isSample) return 'nofollow noopener';
  if (opts.status === 'verified' && opts.qualityScore >= POLICY.dofollowQualityFloor) {
    return 'noopener';
  }
  if (opts.status === 'claimed' && opts.qualityScore >= 80) return 'noopener';
  return 'nofollow noopener';
}

/**
 * Sample data is held out of the index at the deployment boundary, not here.
 *
 * `scripts/postbuild.mjs` writes `Disallow: /` into robots.txt and Netlify adds
 * an `X-Robots-Tag: noindex` header on any non production context while
 * SITE.usingSampleData is true. The per page policy above still renders
 * truthfully so the SEO layer can be inspected and tested on the demo build.
 */
export const sampleDataHeldOut = () => SITE.usingSampleData;
