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
import { listingMedia } from './media';

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

  // Google's LocalBusiness guidance asks for image, and a result carrying a
  // photograph is far likelier to be surfaced with one. Emitted only when a
  // real file resolves: an image property pointing at the site's own generic
  // OG card would be worse than having no image property at all, because it
  // asserts something about the business that is not about the business.
  const media = listingMedia(l);
  const images = [...media.photos, ...(media.logo ? [media.logo] : [])];
  if (images.length > 0) node.image = images.map((i) => abs(i.src));
  if (media.logo) node.logo = abs(media.logo.src);

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
      description: description(list.intro, 300),
      crumbs,
      datePublished: list.publishedAt,
      dateModified: list.reviewedAt,
    }),
    articleNode({
      pageUrl,
      headline: list.title,
      description: description(list.intro, 300),
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

/**
 * Title guard, written as a ladder rather than as a truncation.
 *
 * Long titles get rewritten by Google, and a hard cut is the worst way to get
 * under the limit: "Johnsons MME Accountants and Advisors — Accountant in
 * Albury…" spends its last eight characters on an ellipsis and throws away the
 * word the page is trying to rank for. So a page may pass several candidates,
 * most informative first, and the first one that fits wins.
 *
 * The brand suffix is garnish. A candidate that keeps the category but loses
 * " | LocalsKnow" beats a shorter one that keeps the brand, because on a
 * directory the category and the town are the words a reader is scanning for
 * and the brand is already shown beside the favicon.
 */
export function title(main: string | string[], withBrand = true): string {
  const brand = ' | ' + SITE.name;
  const budget = 62;
  const ladder = (Array.isArray(main) ? main : [main])
    .map((s) => (s ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (!ladder.length) return SITE.name;

  for (const c of ladder) {
    if (withBrand && c.length + brand.length <= budget) return c + brand;
    if (c.length <= budget) return c;
  }

  // Every rung overflowed, which means the shortest one is a single long name.
  // Cut it at a word boundary: mid word is unreadable, and it is the name that
  // is long rather than the template, so there is nothing left to drop.
  const shortest = ladder[ladder.length - 1];
  const cut = shortest.slice(0, budget - 1);
  const space = cut.lastIndexOf(' ');
  return (space > budget / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:—–-]+$/, '') + '…';
}

/**
 * Abbreviations whose full stop does not end a sentence, plus initials.
 *
 * The trailing `\b[A-Z]\.` catches "D.N." and "L.J.", where the word boundary
 * sits between the previous full stop and the letter.
 */
const ABBREVIATION =
  /(?:\b(?:Co|Pty|Ltd|Inc|Corp|St|Mt|Mr|Mrs|Ms|Dr|Prof|Rd|Ave|Hwy|No|Est|Dept|approx|vs)|\b[A-Z])\.$/;

/**
 * The opening sentence, with the full stops that are not sentence endings left
 * alone.
 *
 * Splitting on "full stop then space" turned five listings into snippets reading
 * "D.N. Phone 02 6024 5321." and "Mr. Phone 02 6921 6666." — the business name,
 * a phone number and nothing else, because the name is an abbreviation and the
 * splitter took it for the end of the sentence.
 *
 * Two tests rescue them. A real sentence starts with a capital or a digit, so a
 * fragment continuing in lower case ("Co. occupies a 1920s co-op building") is
 * not a new one. And a known abbreviation or a single initial before the stop is
 * never an ending, whatever follows it.
 */
export function firstSentence(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const parts = clean.split(/(?<=[.!?])\s+/);
  let out = '';
  for (let i = 0; i < parts.length; i++) {
    out = out ? out + ' ' + parts[i] : parts[i];
    const next = parts[i + 1];
    if (!next) break;
    if (!/^["'(‘“A-Z0-9]/.test(next)) continue;
    if (ABBREVIATION.test(out)) continue;
    break;
  }
  return out;
}

/**
 * The half of an editorial headline that can stand on its own.
 *
 * "Every cellar door in Rutherglen, and what each one actually offers" is a good
 * headline and two characters too long for a result. Everything from the first
 * comma or colon is the elaboration, so dropping it leaves a title that is still
 * true and still says what the page is. Returns the headline unchanged when the
 * stem would be too short to be worth having.
 */
export function headlineStem(headline: string): string {
  const stem = headline.split(/[,:—–]/)[0].trim();
  return stem.length >= 24 ? stem : headline;
}

/**
 * Words that must not be the last thing before an ellipsis.
 *
 * A snippet ending "…meet on the second Monday of each month at the…" reads as
 * a broken page. The same snippet with the dangling preposition removed reads
 * as one that was simply too long for the box, which is what happened.
 */
const DANGLING =
  /(?:\s+(?:a|an|the|and|or|of|in|on|at|to|for|with|from|by|as|but|that|which|who|whose|is|are|was|were|has|have|had|its|it|their|this|these|those|into|over|under|up|out|near|between|through|across|plus|including|includes))+$/i;

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

  // No sentence ends inside the budget, so close the last complete clause and
  // punctuate it. A hundred and six listing snippets were ending "…mediums,
  // brushes, easels…", which reads as a page that failed to load rather than a
  // description that ran long; cut one clause earlier and closed, the same
  // sentence reads as though it were written that length.
  const clause = Math.max(
    window.lastIndexOf(', '),
    window.lastIndexOf('; '),
    window.lastIndexOf(' — '),
    window.lastIndexOf(' – '),
    window.lastIndexOf(': '),
  );
  if (clause >= 100) return window.slice(0, clause).replace(/[\s,;:—–-]+$/, '') + '.';

  // No clause either, so take a shorter complete sentence over a longer broken
  // one. The floor above is about not wasting the budget; this one is about the
  // fact that a 94 character sentence that ends is worth more in a result than
  // a 153 character one that stops at "if you are planning a trip a…".
  if (lastStop >= 80) return window.slice(0, lastStop + 1).trim();

  // Last resort. Cut on a word, then drop any trailing article or preposition
  // so the ellipsis follows something the reader can hold on to.
  const cut = clean.slice(0, max - 1);
  const word = cut.slice(0, cut.lastIndexOf(' '));
  return word.replace(DANGLING, '').replace(/[,.;:]$/, '') + '…';
}

/**
 * A snippet assembled from a lead and a body, one whole sentence at a time.
 *
 * Pages that concatenate a template ("Sport at the showground on 17 October.")
 * with prose written for the page body used to overflow and then get cut, which
 * put the ellipsis in the middle of the only interesting half. Sentences are
 * added while they fit, and if not one of them does, the body is clipped by
 * `description` instead of being dropped.
 */
export function compose(lead: string, body: string, max = 158): string {
  const head = lead.replace(/\s+/g, ' ').trim();
  const sentences = body
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);

  let out = head;
  for (const s of sentences) {
    if ((out + ' ' + s).length > max) break;
    out = out ? out + ' ' + s : s;
  }
  if (out !== head) return out;

  // Not one sentence of the body fits. If the lead already reads as a finished
  // snippet, stop there rather than reaching for half a sentence: the lead is
  // the part carrying the facts a searcher is checking. Only a lead too short to
  // stand alone is worth clipping the body onto.
  if (/[.!?]$/.test(head) && head.length >= 70) return head;
  return description(head ? head + ' ' + body : body, max);
}

/**
 * Open Graph image for a page, by vertical or state. Generated by scripts/og.mjs.
 *
 * These are the fallback. Generating a bespoke card per page would be thousands
 * of files for a preview nobody sees twice, so pages share one by vertical. The
 * exception is a business that has supplied its own photograph, which beats any
 * card we could draw and is preferred by BusinessPage.
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
