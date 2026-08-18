/**
 * LocalsKnow data contracts.
 *
 * Every template reads through `src/lib/repo.ts`, never from these modules
 * directly. Swapping the file-backed seed for Supabase means reimplementing
 * the repository, not touching a single page.
 */

export type StateCode = 'NSW' | 'VIC';

export type Vertical =
  | 'trades'
  | 'eat_drink'
  | 'pubs_clubs'
  | 'stay'
  | 'things_to_do'
  | 'clubs_hobbies';

export type ListingStatus =
  | 'draft'
  | 'scraped'
  | 'claimed'
  | 'verified'
  | 'suspended'
  | 'closed';

/** 1 = full build, 4 = rolls up into a neighbour and gets no page of its own. */
export type LocalityTier = 1 | 2 | 3 | 4;

export interface StateRecord {
  code: StateCode;
  name: string;
  slug: string;
  /** Australian timezone identifier — NSW and VIC share one, but do not assume. */
  timezone: string;
  blurb: string;
}

export interface Region {
  id: string;
  state: StateCode;
  name: string;
  slug: string;
  /** Short editorial description used on the region hub and in meta. */
  blurb: string;
  tier: 1 | 2 | 3;
}

export interface Locality {
  id: string;
  regionId: string;
  state: StateCode;
  name: string;
  slug: string;
  postcode: string;
  lat: number;
  lng: number;
  tier: LocalityTier;
  population?: number;
  /** Tier 4 localities roll up into this locality id and get no page. */
  rollsUpTo?: string;
  /** Free text used verbatim in the locality hub intro. Must be specific. */
  blurb: string;
}

export interface Category {
  id: string;
  vertical: Vertical;
  name: string;
  nameSingular: string;
  slug: string;
  /** schema.org type used for listings in this category. */
  schemaType: string;
  description: string;
  /** Words a searcher actually uses. Powers on-page copy and internal anchors. */
  synonyms: string[];
  sortOrder: number;
}

/** Long tail page: /nsw/albury/plumbers/emergency/ */
export interface CategoryModifier {
  id: string;
  categoryId: string;
  slug: string;
  label: string;
  /** Matches a key in Listing.attributes. */
  attributeKey: string;
  attributeValue: string;
  /** Below this listing count the page is not generated at all. */
  minListings: number;
  intro: string;
}

export interface Licence {
  state: StateCode | 'NATIONAL';
  number: string;
  class: string;
  expiresOn?: string;
  registerUrl: string;
  lastVerifiedAt?: string;
  verificationOk: boolean;
}

export interface OpeningHour {
  /** 0 = Sunday. */
  day: number;
  opens?: string;
  closes?: string;
  closed: boolean;
  note?: string;
}

export interface Review {
  id: string;
  author: string;
  rating: 1 | 2 | 3 | 4 | 5;
  body: string;
  jobType?: string;
  publishedAt: string;
  ownerReply?: string;
}

export interface Listing {
  id: string;
  slug: string;
  name: string;
  legalName?: string;
  abn?: string;
  status: ListingStatus;
  vertical: Vertical;
  /** First entry is the primary category. */
  categoryIds: string[];
  description: string;
  phone?: string;
  email?: string;
  website?: string;
  bookingUrl?: string;

  addressLine?: string;
  localityId: string;
  postcode: string;
  lat?: number;
  lng?: number;
  /** No shopfront — service area only. Suppresses the address in schema. */
  isMobile: boolean;

  /** Locality ids this business will travel to. Drives cross border coverage. */
  serviceAreaIds: string[];
  /**
   * True when the service area was derived from distance rather than stated by
   * the business. The page has to say so, because "we think they probably come
   * here" and "they told us they come here" are not the same claim.
   */
  serviceAreaInferred?: boolean;

  logoText: string;
  logoTheme: 'a' | 'b' | 'c' | 'd' | 'e' | 'f';

  attributes: Record<string, string>;
  licences: Licence[];
  hours: OpeningHour[];
  reviews: Review[];

  claimedAt?: string;
  verifiedAt?: string;
  abnVerifiedAt?: string;

  /** 0..100. Computed, never authored. Drives ordering and link rel. */
  qualityScore: number;

  /**
   * Seeded sample record rather than a real trading business.
   * Sample records are labelled in the UI and excluded from indexing.
   */
  isSample: boolean;

  // ---------------------------------------------------------------- provenance
  /**
   * Where the details came from. Every field on a real listing was read off one
   * of these URLs. Published on the page, because a directory that will not say
   * where its facts came from is asking to be trusted for no reason.
   */
  sources: string[];
  /** high = seen on the business's own site or an official register. */
  confidence: 'high' | 'medium';
  /** ISO date the details were last read from a source. */
  lastCheckedAt: string;
  /**
   * Slugs of duplicate records merged into this one. Two research clusters
   * finding the same business is normal; the loser's URL still has to resolve,
   * so postbuild turns each of these into a 301.
   */
  mergedFrom?: string[];

  // ---------------------------------------------------------------- external
  googleMapsUrl?: string;
  /** Set once a Places API lookup has run. Never authored by hand. */
  googlePlaceId?: string;
  facebook?: string;
  instagram?: string;

  /** Short factual bullets pulled from the sources. */
  highlights: string[];
  priceBand?: '$' | '$$' | '$$$' | '$$$$';

  /**
   * Live Google ratings, written only by scripts/fetch-places.mjs from the
   * Places API. Absent means we do not know, and the page says so rather than
   * showing a number nobody can trace.
   */
  google?: {
    rating: number;
    reviewCount: number;
    fetchedAt: string;
    url: string;
  };
}

export interface Guide {
  slug: string;
  title: string;
  description: string;
  author: string;
  authorRole: string;
  publishedAt: string;
  reviewedAt: string;
  /** Category slugs this guide supports. Drives the guide <-> money page loop. */
  categorySlugs: string[];
  stateScope: StateCode[] | 'both';
  /** Markdown-ish body. Rendered by `src/lib/markdown.ts`. */
  body: string;
  faqs: Faq[];
}

export interface Faq {
  q: string;
  a: string;
}

export interface CuratedList {
  slug: string;
  title: string;
  intro: string;
  localitySlug: string;
  state: StateCode;
  categorySlug: string;
  author: string;
  publishedAt: string;
  reviewedAt: string;
  items: { listingSlug: string; blurb: string }[];
}

export interface WireArticle {
  slug: string;
  title: string;
  description: string;
  author: string;
  publishedAt: string;
  state: StateCode | 'both';
  localitySlug?: string;
  body: string;
}

export interface ToolPage {
  slug: string;
  title: string;
  description: string;
  /** Short line under the H1. */
  standfirst: string;
  body: string;
  faqs: Faq[];
  /** Rendered as a WebApplication in structured data when true. */
  isApplication: boolean;
  status: 'live' | 'planned';
}

export interface EventRecord {
  slug: string;
  title: string;
  description: string;
  startDate: string;
  endDate?: string;
  localitySlug: string;
  state: StateCode;
  venueName: string;
  address: string;
  eventType: string;
  isFree: boolean;
  price?: string;
  url?: string;
}
