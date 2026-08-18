/**
 * Structured data and head metadata.
 *
 * Every page builds its JSON-LD through these helpers so the @id graph stays
 * consistent site wide. Two rules are enforced here rather than left to
 * judgement in a template:
 *
 *   1. aggregateRating is only ever emitted when the reviews are rendered on
 *      the same page. Anything else is a manual action waiting to happen.
 *   2. Sample records never claim a verified credential.
 */
import type {
  Category,
  CuratedList,
  EventRecord,
  Faq,
  Guide,
  Listing,
  Locality,
  Region,
  StateCode,
  WireArticle,
} from './types';
import { SITE, STATES } from './site';
import { averageRating, url } from './repo';

export const abs = (p: string): string => new URL(p, SITE.url).toString();

const ORG_ID = abs('/') + '#organisation';
const SITE_ID = abs('/') + '#website';

export interface Crumb {
  name: string;
  href: string;
}

// ------------------------------------------------------------------ site wide

export function organisationNode() {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE.name,
    url: abs('/'),
    description:
      'An independent business and places directory for New South Wales and Victoria, built around service areas rather than state borders.',
    logo: {
      '@type': 'ImageObject',
      '@id': abs('/') + '#logo',
      url: abs('/brand/localknows-logo.png'),
      width: 512,
      height: 512,
      caption: SITE.name,
    },
    image: { '@id': abs('/') + '#logo' },
    email: SITE.email,
    areaServed: [
      { '@type': 'State', name: 'New South Wales' },
      { '@type': 'State', name: 'Victoria' },
    ],
    parentOrganization: {
      '@type': 'Organization',
      name: SITE.publisher.name,
      url: SITE.publisher.url,
    },
    publishingPrinciples: abs(url.editorialPolicy()),
  };
}

export function websiteNode() {
  return {
    '@type': 'WebSite',
    '@id': SITE_ID,
    url: abs('/'),
    name: SITE.name,
    description: SITE.tagline,
    inLanguage: SITE.language,
    publisher: { '@id': ORG_ID },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: abs('/search/') + '?q={search_term_string}',
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function breadcrumbNode(crumbs: Crumb[], pageUrl: string) {
  return {
    '@type': 'BreadcrumbList',
    '@id': abs(pageUrl) + '#breadcrumb',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: abs(c.href),
    })),
  };
}

export function webPageNode(opts: {
  pageUrl: string;
  title: string;
  description: string;
  crumbs?: Crumb[];
  type?: string;
  datePublished?: string;
  dateModified?: string;
}) {
  const node: Record<string, unknown> = {
    '@type': opts.type ?? 'WebPage',
    '@id': abs(opts.pageUrl) + '#webpage',
    url: abs(opts.pageUrl),
    name: opts.title,
    description: opts.description,
    isPartOf: { '@id': SITE_ID },
    inLanguage: SITE.language,
    about: { '@id': ORG_ID },
  };
  if (opts.crumbs?.length) node.breadcrumb = { '@id': abs(opts.pageUrl) + '#breadcrumb' };
  if (opts.datePublished) node.datePublished = opts.datePublished;
  if (opts.dateModified) node.dateModified = opts.dateModified;
  return node;
}

export function faqNode(faqs: Faq[], pageUrl: string) {
  return {
    '@type': 'FAQPage',
    '@id': abs(pageUrl) + '#faq',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

// ------------------------------------------------------------------ places

export function placeNode(locality: Locality, region?: Region) {
  return {
    '@type': 'Place',
    '@id': abs(url.locality(locality)) + '#place',
    name: locality.name,
    address: {
      '@type': 'PostalAddress',
      addressLocality: locality.name,
      addressRegion: locality.state,
      postalCode: locality.postcode,
      addressCountry: 'AU',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: locality.lat,
      longitude: locality.lng,
    },
    containedInPlace: region
      ? {
          '@type': 'AdministrativeArea',
          name: region.name + ', ' + STATES[locality.state].name,
          url: abs(url.region(region)),
        }
      : undefined,
  };
}

// ------------------------------------------------------------------ listings

/**
 * A listing as a schema.org LocalBusiness subtype.
 *
 * `withReviews` must only be true on the listing detail page, where the review
 * text is actually rendered. Category pages pass false and therefore emit no
 * aggregateRating at all.
 */
export function listingNode(
  l: Listing,
  ctx: { locality: Locality; category?: Category; withReviews: boolean; position?: number },
) {
  const rating = averageRating(l);
  const type = ctx.category?.schemaType || 'LocalBusiness';
  const node: Record<string, unknown> = {
    '@type': type,
    '@id': abs(url.listing(l)) + '#business',
    name: l.name,
    url: abs(url.listing(l)),
    description: l.description,
  };

  if (l.legalName) node.legalName = l.legalName;
  if (l.phone) node.telephone = l.phone;
  if (l.email) node.email = l.email;
  if (l.website) node.sameAs = [l.website];

  // A mobile trade has no shopfront. Emitting a street address for one is a lie
  // that Google can check against the map pack, so it is omitted.
  if (!l.isMobile && l.addressLine) {
    node.address = {
      '@type': 'PostalAddress',
      streetAddress: l.addressLine,
      addressLocality: ctx.locality.name,
      // The state does not depend on whether we have a postcode. This read
      // `l.postcode ? state : undefined`, which would have emitted an address
      // with no region for any listing missing a postcode. None currently are,
      // so it never fired, but the condition was meaningless either way.
      addressRegion: ctx.locality.state,
      postalCode: l.postcode,
      addressCountry: 'AU',
    };
  } else {
    node.address = {
      '@type': 'PostalAddress',
      addressLocality: ctx.locality.name,
      addressRegion: ctx.locality.state,
      postalCode: l.postcode,
      addressCountry: 'AU',
    };
  }

  if (l.lat && l.lng && !l.isMobile) {
    node.geo = { '@type': 'GeoCoordinates', latitude: l.lat, longitude: l.lng };
  }

  // areaServed is only asserted when the business actually told us its service
  // area. An area we derived from distance is useful on the page as an estimate
  // and is clearly labelled there, but it is not a fact to put in the graph.
  if (l.serviceAreaIds.length > 1 && !l.serviceAreaInferred) {
    node.areaServed = {
      '@type': 'GeoCircle',
      geoMidpoint: {
        '@type': 'GeoCoordinates',
        latitude: ctx.locality.lat,
        longitude: ctx.locality.lng,
      },
      geoRadius: 40000,
    };
  }

  const openingHours = l.hours
    .filter((h) => !h.closed && h.opens && h.closes)
    .map((h) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: DAY_SCHEMA[h.day],
      opens: h.opens,
      closes: h.closes,
    }));
  if (openingHours.length) node.openingHoursSpecification = openingHours;

  // Only a licence we actually checked against a state register becomes a credential.
  const verified = l.licences.filter((x) => x.verificationOk && !l.isSample);
  if (verified.length) {
    node.hasCredential = verified.map((lic) => ({
      '@type': 'EducationalOccupationalCredential',
      credentialCategory: 'licence',
      name: lic.class + ' licence (' + lic.state + ')',
      identifier: lic.number,
      recognizedBy: {
        '@type': 'Organization',
        name: lic.state === 'NSW' ? 'NSW Fair Trading' : 'Victorian Building Authority',
        url: lic.registerUrl,
      },
    }));
  }

  if (ctx.withReviews && rating && l.reviews.length) {
    node.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: rating,
      reviewCount: l.reviews.length,
      bestRating: 5,
      worstRating: 1,
    };
    node.review = l.reviews.slice(0, 10).map((r) => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: r.author },
      datePublished: r.publishedAt,
      reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
      reviewBody: r.body,
    }));
  }

  if (typeof ctx.position === 'number') node.position = ctx.position;
  return node;
}

const DAY_SCHEMA = [
  'https://schema.org/Sunday',
  'https://schema.org/Monday',
  'https://schema.org/Tuesday',
  'https://schema.org/Wednesday',
  'https://schema.org/Thursday',
  'https://schema.org/Friday',
  'https://schema.org/Saturday',
];

/** ItemList for a category page. Positions are the on page order, not a guess. */
export function itemListNode(opts: {
  pageUrl: string;
  name: string;
  items: { url: string; name: string }[];
}) {
  return {
    '@type': 'ItemList',
    '@id': abs(opts.pageUrl) + '#listings',
    name: opts.name,
    numberOfItems: opts.items.length,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    itemListElement: opts.items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: abs(it.url),
      name: it.name,
    })),
  };
}

// ------------------------------------------------------------------ editorial

export function articleNode(opts: {
  pageUrl: string;
  headline: string;
  description: string;
  author: string;
  datePublished: string;
  dateModified?: string;
  type?: 'Article' | 'NewsArticle' | 'BlogPosting';
  section?: string;
}) {
  return {
    '@type': opts.type ?? 'Article',
    '@id': abs(opts.pageUrl) + '#article',
    headline: opts.headline,
    description: opts.description,
    mainEntityOfPage: { '@id': abs(opts.pageUrl) + '#webpage' },
    author: { '@type': 'Organization', name: opts.author, url: abs(url.about()) },
    publisher: { '@id': ORG_ID },
    datePublished: opts.datePublished,
    dateModified: opts.dateModified ?? opts.datePublished,
    inLanguage: SITE.language,
    isAccessibleForFree: true,
    articleSection: opts.section,
  };
}

export function guideGraph(g: Guide, crumbs: Crumb[]) {
  const pageUrl = url.guide(g);
  const nodes: unknown[] = [
    organisationNode(),
    websiteNode(),
    breadcrumbNode(crumbs, pageUrl),
    webPageNode({
      pageUrl,
      title: g.title,
      description: g.description,
      crumbs,
      datePublished: g.publishedAt,
      dateModified: g.reviewedAt,
    }),
    articleNode({
      pageUrl,
      headline: g.title,
      description: g.description,
      author: g.author,
      datePublished: g.publishedAt,
      dateModified: g.reviewedAt,
      section: 'Guides',
    }),
  ];
  if (g.faqs.length) nodes.push(faqNode(g.faqs, pageUrl));
  return graph(nodes);
}

export function wireGraph(w: WireArticle, crumbs: Crumb[]) {
  const pageUrl = url.wireArticle(w);
  return graph([
    organisationNode(),
    websiteNode(),
    breadcrumbNode(crumbs, pageUrl),
    webPageNode({
      pageUrl,
      title: w.title,
      description: w.description,
      crumbs,
      datePublished: w.publishedAt,
    }),
    articleNode({
      pageUrl,
      headline: w.title,
      description: w.description,
      author: w.author,
      datePublished: w.publishedAt,
      type: 'NewsArticle',
      section: 'The wire',
    }),
  ]);
}

export function listGraph(
  list: CuratedList,
  crumbs: Crumb[],
  items: { url: string; name: string }[],
) {
  const pageUrl = url.list(list);
  return graph([
    organisationNode(),
    websiteNode(),
    breadcrumbNode(crumbs, pageUrl),
    webPageNode({
      pageUrl,
      title: list.title,
      description: list.intro.slice(0, 300),
      crumbs,
      datePublished: list.publishedAt,
      dateModified: list.reviewedAt,
    }),
    articleNode({
      pageUrl,
      headline: list.title,
      description: list.intro.slice(0, 300),
      author: list.author,
      datePublished: list.publishedAt,
      dateModified: list.reviewedAt,
      section: 'Lists',
    }),
    itemListNode({ pageUrl, name: list.title, items }),
  ]);
}

export function eventNode(e: EventRecord, locality: Locality) {
  return {
    '@type': 'Event',
    '@id': abs(url.event(e)) + '#event',
    name: e.title,
    description: e.description,
    startDate: e.startDate,
    endDate: e.endDate ?? e.startDate,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: e.venueName,
      address: {
        '@type': 'PostalAddress',
        streetAddress: e.address,
        addressLocality: locality.name,
        addressRegion: e.state,
        postalCode: locality.postcode,
        addressCountry: 'AU',
      },
    },
    organizer: { '@id': ORG_ID },
    offers: {
      '@type': 'Offer',
      price: e.isFree ? '0' : (e.price ?? '0').replace(/[^0-9.]/g, '') || '0',
      priceCurrency: 'AUD',
      availability: 'https://schema.org/InStock',
      url: abs(url.event(e)),
      validFrom: e.startDate.slice(0, 10),
    },
    isAccessibleForFree: e.isFree,
  };
}

export function toolNode(opts: {
  pageUrl: string;
  name: string;
  description: string;
  live: boolean;
}) {
  return {
    '@type': 'WebApplication',
    '@id': abs(opts.pageUrl) + '#app',
    name: opts.name,
    description: opts.description,
    url: abs(opts.pageUrl),
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Any',
    browserRequirements: 'Requires JavaScript',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'AUD' },
    publisher: { '@id': ORG_ID },
  };
}

// ------------------------------------------------------------------ assembly

export function graph(nodes: unknown[]) {
  return { '@context': 'https://schema.org', '@graph': nodes.filter(Boolean) };
}

/** Title guard. Long titles get rewritten by Google, which loses the keyword. */
export function title(main: string, withBrand = true): string {
  const brand = ' | ' + SITE.name;
  const budget = 62;
  if (!withBrand) return main.slice(0, budget);
  if (main.length + brand.length <= budget) return main + brand;
  return main.length <= budget ? main : main.slice(0, budget - 1).trimEnd() + '…';
}

/**
 * Descriptions, clipped where a reader would not notice.
 *
 * Order of preference: it already fits, then the last full sentence inside the
 * budget, then a word boundary with an ellipsis. Six hundred pages were ending
 * mid clause because only the third case existed, and a snippet that stops at
 * "so operators who cross the…" reads as broken rather than as truncated.
 */
export function description(text: string, max = 158): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;

  const window = clean.slice(0, max);
  const lastStop = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '));
  // Only take the sentence break if it leaves a description worth having. The
  // floor started at 90 and that was too generous: the homepage has a 93
  // character opening sentence, so it threw away the half that carried the
  // listing count. 110 is the compromise: long enough to be worth showing,
  // short enough that most real descriptions land on a full stop rather than
  // an ellipsis.
  if (lastStop >= 110) return window.slice(0, lastStop + 1).trim();

  const cut = clean.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,.;:]$/, '') + '…';
}

/**
 * Open Graph image for a page, by vertical or state. Generated by scripts/og.mjs.
 * There is no per page image: at this page count that is thousands of files for
 * a preview nobody sees twice.
 */
const OG_BY_VERTICAL: Record<string, string> = {
  trades: '/og/trades.png',
  eat_drink: '/og/eat-drink.png',
  pubs_clubs: '/og/pubs-clubs.png',
  stay: '/og/stay.png',
  things_to_do: '/og/things-to-do.png',
  clubs_hobbies: '/og/clubs-hobbies.png',
};

export const ogForVertical = (v?: string): string =>
  (v && OG_BY_VERTICAL[v]) || '/og/default.png';

export const ogForState = (code: StateCode): string =>
  code === 'NSW' ? '/og/nsw.png' : '/og/vic.png';

export function stateName(code: StateCode): string {
  return STATES[code].name;
}
