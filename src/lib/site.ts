import type { StateCode } from './types';

/**
 * One place for anything that appears in more than one <head>.
 * Nothing below should ever be re-typed inside a page.
 */
export const SITE = {
  name: 'LocalsKnow',
  legalName: 'LocalsKnow',
  /**
   * The other ways the name gets written.
   *
   * Searched as two words, "localsknow" is read as the phrase "locals know" and
   * the site does not come back for its own name. Google builds the site name
   * it shows from the WebSite node's name and alternateName, and reconciles an
   * entity partly on the spellings it is told belong to it, so every spelling a
   * person actually types goes here and nowhere else.
   */
  alternateNames: ['Locals Know', 'LocalsKnow.com.au', 'localsknow'],
  tagline: 'The border directory for New South Wales and Victoria',
  /** One sentence, used by the Organization node. Says what, where and by whom. */
  description:
    'An independent directory of businesses, clubs and places in the New South Wales and Victoria border country, published by Automatrix in Albury NSW. Service areas are recorded separately from addresses, so a business that works across the Murray appears on both sides of it.',
  url: (import.meta.env?.SITE_URL as string) || 'https://localsknow.com.au',
  locale: 'en-AU',
  language: 'en-AU',
  /**
   * The month the directory was built, from the repository history: the first
   * commit is 18 August 2026 and Search Console was verified on the 26th. A
   * month rather than a day, because the first commit is when the code started
   * and not a launch anybody announced.
   */
  foundingDate: '2026-08',
  /** An existing file in public/brand, 512 x 512. */
  logo: { path: '/brand/localknows-logo.png', width: 512, height: 512 },
  /**
   * The business that runs the site.
   *
   * `name` is the trading name the policy pages already use in prose, so it is
   * left as it was. Everything else is copied from the Organization node
   * automatrix.au publishes about itself, including its @id, so the two graphs
   * describe one company rather than two that happen to share a name. Nothing
   * here was inferred: if automatrix.au changes, change it here.
   */
  publisher: {
    id: 'https://automatrix.au/#organization',
    name: 'Automatrix Digital',
    brand: 'Automatrix',
    legalName: 'Automatrix Digital Pty Ltd',
    abn: '89 700 072 608',
    url: 'https://automatrix.au',
    email: 'info@automatrix.au',
    address: { locality: 'Albury', region: 'NSW', postcode: '2640', country: 'AU' },
    /** The profiles automatrix.au lists in its own sameAs. */
    sameAs: ['https://www.linkedin.com/company/automatrixau/', 'https://www.instagram.com/automatrix.au/'],
  },
  email: 'hello@localsknow.com.au',
  /** Sample data ships with the repo so every template renders. See /about/. */
  usingSampleData: true,
} as const;

/**
 * LocalsKnow's own profiles on other sites, for Organization.sameAs.
 *
 * Empty on purpose. sameAs tells a search engine "this other page is us", and
 * a URL that is not ours, or that does not exist, is worse than none: it either
 * merges the site with a stranger or points the entity at a 404. There is no
 * LocalsKnow profile anywhere yet, automatrix.au does not mention the site, and
 * an online-only directory cannot hold a Google Business Profile.
 *
 * TODO(Lee): add each profile here as it is created and goes live, copied from
 * the browser address bar, e.g. a LinkedIn showcase page under Automatrix, a
 * Facebook page, or an automatrix.au case study page about LocalsKnow. The
 * Organization node picks them up on the next build and nothing else changes.
 */
export const BRAND_PROFILES: readonly string[] = [];

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
  /**
   * Locality x category pages below this count are noindex, follow.
   *
   * Three, not five. At five, 38 of the 1,516 locality x category pages were
   * indexed and 1,478 were held back, which meant the highest intent pages on
   * the site — the ones that answer "plumbers in Wagga Wagga" — were almost all
   * invisible. Three named businesses with addresses, phone numbers and hours is
   * a real comparison set and a real answer to that query.
   *
   * It stops at three deliberately. The 273 two-listing and 1,113 one-listing
   * pages stay out: a page holding one business is a worse version of that
   * business's own page, and eleven hundred of them is a pattern rather than an
   * oversight. They keep their links and flip to indexed on their own as
   * listings are added.
   */
  minListingsToIndex: 3,
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
  /**
   * A themed page needs at least one qualifying business based in the town.
   * /nsw/west-albury/with-kids/ was five listings, all five of them Albury's,
   * which is a copy of the Albury page and nothing else.
   */
  minBasedForThemePage: 1,
} as const;
