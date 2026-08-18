import type { StateCode } from './types';

/**
 * One place for anything that appears in more than one <head>.
 * Nothing below should ever be re-typed inside a page.
 */
export const SITE = {
  name: 'LocalKnows',
  legalName: 'LocalKnows',
  tagline: 'The border directory for New South Wales and Victoria',
  url: (import.meta.env?.SITE_URL as string) || 'https://localsknow.com.au',
  locale: 'en-AU',
  language: 'en-AU',
  publisher: {
    name: 'Automatrix Digital',
    url: 'https://automatrix.au',
  },
  email: 'hello@localsknow.com.au',
  /** Sample data ships with the repo so every template renders. See /about/. */
  usingSampleData: true,
} as const;

export const STATES: Record<StateCode, { code: StateCode; name: string; slug: string; timezone: string; blurb: string }> = {
  NSW: {
    code: 'NSW',
    name: 'New South Wales',
    slug: 'nsw',
    timezone: 'Australia/Sydney',
    blurb:
      'From the Murray to the Tweed. Trades, food, pubs, places to stay and things to do across regional New South Wales, with service areas that do not stop at the state line.',
  },
  VIC: {
    code: 'VIC',
    name: 'Victoria',
    slug: 'vic',
    timezone: 'Australia/Melbourne',
    blurb:
      'Gippsland to the Mallee. Victorian businesses listed with verified licences, real opening hours, and the New South Wales operators who cross the river to work here.',
  },
};

export const VERTICALS = [
  {
    key: 'trades',
    name: 'Trades and services',
    slug: 'trades-and-services',
    blurb: 'Licensed trades, checked against the state registers.',
  },
  {
    key: 'eat_drink',
    name: 'Eat and drink',
    slug: 'eat-and-drink',
    blurb: 'Cafes, bakeries, restaurants and takeaway.',
  },
  {
    key: 'pubs_clubs',
    name: 'Pubs and clubs',
    slug: 'pubs-and-clubs',
    blurb: 'Beer gardens, counter meals, live music and courtesy buses.',
  },
  {
    key: 'stay',
    name: 'Stay',
    slug: 'stay',
    blurb: 'Motels, cabins, campgrounds and farm stays.',
  },
  {
    key: 'things_to_do',
    name: 'Things to do',
    slug: 'things-to-do',
    blurb: 'Parks, wineries, galleries and days out.',
  },
  {
    key: 'clubs_hobbies',
    name: 'Clubs and hobbies',
    slug: 'clubs-and-hobbies',
    blurb: 'Sporting clubs, hobby groups and community organisations.',
  },
] as const;

/**
 * The paid tier.
 *
 * A deliberate line runs through this. What is for sale is the verification
 * WORK: pulling the licence, checking it against the state register, re-checking
 * it every month, and warning the owner before it expires. The badge itself is
 * not for sale, and a subscription that fails the check does not get one. If a
 * licence lapses mid subscription the badge goes and the money keeps coming,
 * which is the wrong way round for us and the right way round for the reader.
 *
 * Nothing in this object is an input to ranking. See src/lib/repo.ts rank().
 *
 * Prices are a business decision, not a code decision. Set them here and they
 * change everywhere at once.
 */
export const PLANS = {
  /** Set to true once Stripe is wired up and the page stops saying "opening soon". */
  live: false,
  free: {
    name: 'Free',
    price: 0,
    period: 'forever',
    blurb: 'Everything a listing needs to be found and to be right.',
    features: [
      'Claim the listing and correct every detail',
      'Full week of opening hours, including the closed days',
      'Logo, description, features and service area',
      'Reply to reviews',
      'See how many people looked you up',
      'Outbound link to your site',
    ],
  },
  verified: {
    name: 'Verified',
    /** Indicative. Confirm before the page goes live. */
    price: 29,
    priceAnnual: 290,
    period: 'month',
    blurb: 'We check your licence against the state register, and keep checking it.',
    features: [
      'Licence checked against NSW Fair Trading or the Victorian Building Authority',
      'Re-checked every month, with the date shown publicly',
      'Verified badge on your listing and on every results page you appear on',
      'Warning by email 60 days before your licence expires',
      'Dofollow link to your website',
      'Enquiries routed to you by email and SMS',
      'Up to five locations on one account',
      'Photo gallery',
    ],
    excludes: [
      'A higher position in any results list',
      'Removal or demotion of a competitor',
      'A badge if the licence does not check out',
      'Anything at all in the structured data that a free listing does not get',
    ],
  },
} as const;

/**
 * Indexation policy, in one place, applied by `src/lib/indexability.ts`.
 * Changing a threshold here changes the sitemap, the robots meta and the
 * internal link graph together. That coupling is deliberate.
 */
export const POLICY = {
  /** Locality x category pages below this count are noindex, follow. */
  minListingsToIndex: 5,
  /** Modifier pages below this count are not generated at all. */
  minListingsForModifierPage: 5,
  /** Listings below this quality score are noindex, follow. */
  minListingQualityToIndex: 40,
  /** Outbound website links go dofollow at or above this score, verified only. */
  dofollowQualityFloor: 70,
  /** Listing cards per page before pagination kicks in. */
  perPage: 20,
  /** Nearby locality links rendered on a locality or category page. */
  nearbyLinkCount: 8,
  /**
   * A locality gets its own pages once this many businesses are actually based
   * there. Businesses that only travel in still appear on the page; they just
   * do not bring it into existence, because a page made entirely of the town
   * next door's tradespeople is a duplicate of the town next door.
   */
  minBasedToGoLive: 1,
} as const;
