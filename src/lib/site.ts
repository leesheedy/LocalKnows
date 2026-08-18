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
