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
    case 'category':
    case 'vertical':
      return { index: true, follow: true, inSitemap: true, priority: 0.7, reason: 'category hub' };

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

    case 'eventIndex':
      return { index: true, follow: true, inSitemap: true, priority: 0.6, reason: 'events index' };

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
