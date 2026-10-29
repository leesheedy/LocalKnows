/**
 * Generated prose.
 *
 * Every locality x category page carries a paragraph built from that page's own
 * listing rows. It is the difference between twenty thousand near duplicate
 * pages and twenty thousand pages that each say something only this site knows.
 *
 * Two rules:
 *   - Never state a number the data does not support. Every sentence below is
 *     gated on the value existing.
 *   - Vary the sentence shape by a stable hash of the page, so neighbouring
 *     pages do not read as one template with the nouns swapped.
 */
import type { Category, Faq, Listing, Locality, OpeningHour, Region } from './types';
import type { LocalityCategoryStats, LocalityStats, RegionStats } from './repo';
import type { Neighbour } from './geo';
import { STATES } from './site';
import { humanDate } from './build';
import { firstSentence } from './seo';

/** Deterministic, stable across builds. Same page, same wording, every time. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const pick = <T>(options: T[], seed: string): T => options[hash(seed) % options.length];

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "1 publishes", "84 publish". The count and a verb that agrees with it. */
export const counted = (count: number, one: string, many: string) =>
  count.toLocaleString('en-AU') + ' ' + plural(count, one, many);

/**
 * Words in a category name that keep their capital in the middle of a sentence.
 * Taxonomy names are title case, and lower casing the lot printed "rsl and
 * licensed clubs", "cwa branches" and "italian restaurants".
 */
const KEEP_CASE = new Set([
  'African', 'Asian', 'Australian', 'Chinese', 'European', 'French', 'German', 'Greek', 'Indian',
  'Indonesian', 'Italian', 'Japanese', 'Korean', 'Lebanese', 'Malaysian', 'Mexican', 'Nepalese',
  'Spanish', 'Thai', 'Turkish', 'Vietnamese',
]);

/** A category name as it reads mid sentence: "Auto Parts Stores" to "auto parts stores", "RSL" kept. */
export const lowerName = (name: string): string =>
  name
    .split(' ')
    .map((w) => (/[A-Z].*[A-Z]|\d/.test(w) || KEEP_CASE.has(w) ? w : w.toLowerCase()))
    .join(' ');

export const money = (n: number) => '$' + Math.round(n).toLocaleString('en-AU');

/**
 * The data block sentences. Returns an array so the template can render them as
 * separate paragraphs or as a single block without the copy caring.
 */
export function statSentences(
  locality: Locality,
  category: Category,
  stats: LocalityCategoryStats,
  otherState: string,
): string[] {
  const seed = locality.slug + ':' + category.slug;
  const out: string[] = [];
  const noun = lowerName(stats.listingCount === 1 ? category.nameSingular : category.name);

  out.push(
    pick(
      [
        'We list ' + stats.listingCount + ' ' + noun + ' covering ' + locality.name + '.',
        'There are ' + stats.listingCount + ' ' + noun + ' on LocalsKnow that work in ' + locality.name + '.',
        locality.name + ' has ' + stats.listingCount + ' ' + noun + ' listed here.',
      ],
      seed,
    ),
  );

  if (stats.fromOtherLocality > 0) {
    const pct = Math.round((stats.fromOtherLocality / stats.listingCount) * 100);
    out.push(
      stats.fromOtherLocality +
        ' of them are based somewhere else and travel in, which is ' +
        pct +
        '% of the list. Address and service area are held separately, so a business that works here appears here.',
    );
  }

  if (stats.crossBorderCount > 0) {
    out.push(
      stats.crossBorderCount +
        ' ' +
        plural(stats.crossBorderCount, 'is', 'are') +
        ' based in ' +
        otherState +
        ' and ' +
        plural(stats.crossBorderCount, 'crosses', 'cross') +
        ' the border to work in ' +
        locality.name +
        '. Most directories will not show you those.',
    );
  }

  if (stats.licencedCount > 0) {
    out.push(
      'We have checked ' +
        stats.licencedCount +
        ' ' +
        plural(stats.licencedCount, 'licence', 'licences') +
        ' against the ' +
        (locality.state === 'NSW' ? 'NSW Fair Trading' : 'Victorian Building Authority') +
        ' public register.',
    );
  }

  if (stats.avgCalloutFee && stats.calloutFeeLow && stats.calloutFeeHigh) {
    out.push(
      'Call out fees on this page run from ' +
        money(stats.calloutFeeLow) +
        ' to ' +
        money(stats.calloutFeeHigh) +
        ', averaging ' +
        money(stats.avgCalloutFee) +
        '. That is the fee to attend, before any labour or parts.',
    );
  }

  if (stats.openSaturdayCount > 0 || stats.openSundayCount > 0) {
    const parts: string[] = [];
    if (stats.openSaturdayCount > 0) parts.push(stats.openSaturdayCount + ' open Saturdays');
    if (stats.openSundayCount > 0) parts.push(stats.openSundayCount + ' open Sundays');
    out.push(parts.join(' and ') + '.');
  }

  if (stats.emergencyCount > 0) {
    out.push(
      stats.emergencyCount +
        ' ' +
        plural(stats.emergencyCount, 'takes', 'take') +
        ' after hours and emergency call outs.',
    );
  }

  if (stats.medianResponseHours) {
    out.push(
      'Median time to reply to an enquiry sent through this site is ' +
        stats.medianResponseHours +
        ' ' +
        plural(stats.medianResponseHours, 'hour', 'hours') +
        '.',
    );
  }

  return out;
}

/**
 * "A", "A and B", "A, B and C". No Oxford comma, which is the Australian
 * default and what every other sentence on the site already does, except when
 * an item has its own "and": "Riverina, Murray and Hume and South West Slopes"
 * reads as four regions, so that list gets the comma.
 */
export function listPhrase(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  const joiner = items.length > 2 && items.some((s) => / and /.test(s)) ? ', and ' : ' and ';
  return items.slice(0, -1).join(', ') + joiner + items[items.length - 1];
}

/**
 * When the details on a page were last read, as a reader would say it.
 *
 * "on 25 August 2026" when every listing was read the same day, otherwise the
 * range, with the month said once when it is the same month. The range is the
 * honest version: a page built today out of listings read in August was not
 * checked today, and "Checked 29 October" beside it says something narrower.
 */
export function checkedPhrase(from?: string, to?: string): string {
  if (!to) return '';
  if (!from || from === to) return 'on ' + humanDate(to);
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  return sameMonth
    ? 'between ' + Number(from.slice(8, 10)) + ' and ' + humanDate(to)
    : 'between ' + humanDate(from) + ' and ' + humanDate(to);
}

/** "24 cafes", "1 cafe". Category names are plural in the taxonomy. */
export const countOf = (count: number, c: Category): string =>
  n(count) + ' ' + lowerName(count === 1 ? c.nameSingular : c.name);

/**
 * The money page "In short". Rendered as the standfirst under the H1 and sent
 * to answer engines as the WebPage abstract, so it is written to be lifted out
 * whole: who is listed, where they are based, when they trade, and when the
 * details were read. Every clause is gated on its number existing.
 */
export function statSummary(
  locality: Locality,
  category: Category,
  stats: LocalityCategoryStats,
): string {
  const otherState = otherStateLabel(locality.state);
  const based = stats.listingCount - stats.fromOtherLocality;
  // A category name is plural, so a page with one listing otherwise reads
  // "1 art galleries". countOf picks the right noun.
  let first = countOf(stats.listingCount, category) + ' listed in ' + locality.name + ' ' + locality.state;
  if (stats.listingCount === 1) {
    first += based === 1 ? ', based in ' + locality.name + ' itself.' : ', based in a nearby town and travelling in.';
  } else if (stats.fromOtherLocality === 0) {
    first += ', all of them based in ' + locality.name + ' itself.';
  } else if (based === 0) {
    first +=
      ', all of them based in nearby towns and travelling in' +
      (stats.crossBorderCount ? ', ' + stats.crossBorderCount + ' from ' + otherState : '') +
      '.';
  } else {
    first +=
      ': ' +
      based +
      ' based in ' +
      locality.name +
      ' and ' +
      stats.fromOtherLocality +
      ' travelling in from nearby towns' +
      (stats.crossBorderCount
        ? ', ' + (stats.crossBorderCount === stats.fromOtherLocality ? 'all' : stats.crossBorderCount) + ' of them from ' + otherState
        : '') +
      '.';
  }

  const out = [first];
  const trading: string[] = [];
  if (stats.openSaturdayCount) trading.push(counted(stats.openSaturdayCount, 'publishes', 'publish') + ' Saturday hours');
  if (stats.openSundayCount) trading.push(counted(stats.openSundayCount, 'publishes', 'publish') + ' Sunday hours');
  if (stats.emergencyCount) trading.push(counted(stats.emergencyCount, 'takes', 'take') + ' after hours call outs');
  if (trading.length) out.push(listPhrase(trading) + '.');
  if (stats.licencedCount) {
    out.push(
      stats.licencedCount +
        ' ' +
        plural(stats.licencedCount, 'holds a licence', 'hold licences') +
        ' we checked against the state register.',
    );
  }
  if (stats.avgCalloutFee && stats.calloutFeeLow && stats.calloutFeeHigh) {
    out.push('Published call out fees run from ' + money(stats.calloutFeeLow) + ' to ' + money(stats.calloutFeeHigh) + '.');
  }
  const when = checkedPhrase(stats.checkedFrom, stats.checkedTo);
  if (when) out.push('Details last read from their sources ' + when + '.');
  return out.join(' ');
}

/**
 * H1 for a money page. Locality first, then category, then state.
 * The state code is in the H1 on purpose: "plumbers albury nsw" is a real query
 * and the border corridor makes the state ambiguous without it.
 */
export function moneyPageTitle(locality: Locality, category: Category): string {
  return category.name + ' in ' + locality.name + ', ' + locality.state;
}

/**
 * The money page <title>, as a ladder for `title()` in seo.ts.
 *
 * The H1 says what the page is. The title has a different job: it is the one
 * line in a results page competing with Localsearch and Yellow Pages, and the
 * counts are the thing neither of them can print. "Cafes in Albury NSW (8
 * listed, 7 open Saturday)" answers the question before the click and tells the
 * reader the page is not a wall of ads.
 *
 * The second number is whichever fact is most useful for the vertical and
 * actually present: a checked licence beats everything because nobody else has
 * one, then after hours for a trade, then weekend trading, then the border.
 */
export function moneyPageTitleLadder(
  locality: Locality,
  category: Category,
  stats: LocalityCategoryStats,
  page = 1,
): string[] {
  const base = category.name + ' in ' + locality.name + ' ' + locality.state;
  const short = category.name + ' in ' + locality.name;
  const listed = n(stats.listingCount) + ' listed';

  if (page > 1) {
    return [base + ' (' + listed + '), page ' + page, base + ', page ' + page, short + ', page ' + page];
  }

  const otherCode = locality.state === 'NSW' ? 'VIC' : 'NSW';
  const extras: string[] = [];
  if (stats.licencedCount) extras.push(stats.licencedCount + ' licence checked');
  if (stats.emergencyCount && category.vertical === 'trades') extras.push(stats.emergencyCount + ' after hours');
  if (stats.openSaturdayCount) extras.push(stats.openSaturdayCount + ' open Saturday');
  if (stats.openSundayCount) extras.push(stats.openSundayCount + ' open Sunday');
  if (stats.crossBorderCount) extras.push(stats.crossBorderCount + ' from ' + otherCode);

  return [
    ...extras.slice(0, 2).map((x) => base + ' (' + listed + ', ' + x + ')'),
    base + ' (' + listed + ')',
    short + ' (' + listed + ')',
    base,
    short,
  ];
}

/**
 * Money page description.
 *
 * Aim for 140 to 155 characters. The audit found these coming in at 44, which
 * leaves Google to write its own snippet out of whatever is on the page, and
 * the count is the one thing this site has that competitors do not.
 *
 * Built by adding proof clauses in order of usefulness until the budget is
 * spent, so a page with a lot to say uses the space and a sparse one still ends
 * on a complete sentence.
 */
export function moneyPageDescription(
  locality: Locality,
  category: Category,
  stats: LocalityCategoryStats,
): string {
  const where = ' serving ' + locality.name + ' ' + locality.state + ' ' + locality.postcode;

  /*
   * Name names. A snippet reading "8 cafes serving Albury NSW 2640, including
   * The Proprietor, Mr Benedict and Bended Elbow" is the one a person scanning
   * for a cafe they have heard of will click, and the one an answer engine can
   * quote as a list. The names are the first three in page order, which is the
   * ranking the page itself uses, and "including" claims nothing about them
   * beyond being on it. As many as fit while leaving room for one proof clause.
   */
  const names = stats.topNames;
  let lead = countOf(stats.listingCount, category) + where + '.';
  for (let k = Math.min(3, names.length); k >= 1; k--) {
    const shown = names.slice(0, k);
    const candidate =
      countOf(stats.listingCount, category) +
      where +
      (k === stats.listingCount ? ': ' : ', including ') +
      listPhrase(shown) +
      '.';
    if (candidate.length <= 125) {
      lead = candidate;
      break;
    }
  }

  const proof: string[] = [];
  if (stats.licencedCount) proof.push(stats.licencedCount + ' with a licence we checked');
  if (stats.crossBorderCount) proof.push(stats.crossBorderCount + ' crossing the border to get here');
  if (stats.openSaturdayCount) proof.push(stats.openSaturdayCount + ' trading Saturdays');
  if (stats.openSundayCount) proof.push(stats.openSundayCount + ' open Sundays');
  if (stats.emergencyCount) proof.push(stats.emergencyCount + ' taking after hours work');
  if (stats.avgCalloutFee) proof.push('call out averaging ' + money(stats.avgCalloutFee));
  if (stats.fromOtherLocality) proof.push(stats.fromOtherLocality + ' travelling in');

  // Skip a clause that will not fit rather than stop at it: now that the lead
  // carries names, a long clause early in the list was ending the description
  // with room left for a short one after it.
  let out = lead;
  for (const clause of proof) {
    const next = out + ' ' + clause[0].toUpperCase() + clause.slice(1) + '.';
    if (next.length > 155) continue;
    out = next;
  }

  // Still short because the page has little to say about itself. Close with the
  // thing that is true of every page on the site rather than leave it stubby.
  if (out.length < 120) {
    const tail = ' Contact details, hours and sources on every listing.';
    if (out.length + tail.length <= 158) out += tail;
  }
  return out;
}

/** Region and state hub intro sentences, built from counts rather than adjectives. */
export function hubSummary(opts: {
  scope: string;
  localityCount: number;
  listingCount: number;
  categoryCount: number;
  verifiedCount: number;
}): string {
  return (
    opts.listingCount.toLocaleString('en-AU') +
    ' listings across ' +
    opts.localityCount +
    ' ' +
    plural(opts.localityCount, 'locality', 'localities') +
    ' and ' +
    opts.categoryCount +
    ' categories in ' +
    opts.scope +
    '. ' +
    opts.verifiedCount.toLocaleString('en-AU') +
    ' have been through verification.'
  );
}

// ------------------------------------------------------------------ town hubs
// Town hubs were sitting in "crawled, currently not indexed", Albury and
// Wodonga among them. A page that is a blurb and a grid of category links is
// the same page in every town with the nouns changed, and the fix is the same
// as it was for the money pages: say things about this town that only this
// town's rows can produce. Everything below is counted by localityStats().

const businessesNoun = (count: number) => n(count) + ' ' + plural(count, 'business or place', 'businesses and places');

/** A town's biggest categories as "cafes (24), plumbers (18) and electricians (15)". */
export const categoryCounts = (items: { category: Category; count: number }[], limit = 3): string =>
  listPhrase(items.slice(0, limit).map((a) => lowerName(a.category.name) + ' (' + n(a.count) + ')'));

/** Title ladder for a town hub. "albury business directory" is a query people type. */
export function townTitleLadder(locality: Locality, stats: LocalityStats): string[] {
  const listed = n(stats.listingCount) + ' listed';
  return [
    locality.name + ' ' + locality.state + ' business directory: ' + listed,
    locality.name + ' ' + locality.state + ' business directory (' + listed + ')',
    locality.name + ' business directory (' + listed + ')',
    'Businesses in ' + locality.name + ', ' + locality.state,
  ];
}

/** Meta description for a town hub: the count, the categories, then the border. */
export function townDescription(
  locality: Locality,
  stats: LocalityStats,
  top: { category: Category; count: number }[],
): string {
  let out =
    businessesNoun(stats.listingCount) +
    ' in ' +
    locality.name +
    ' ' +
    locality.state +
    ' ' +
    locality.postcode +
    (top.length >= 2 ? ', including ' + listPhrase(top.slice(0, 3).map((a) => countOf(a.count, a.category))) : '') +
    '.';
  const extras = [
    stats.travelInCount ? stats.basedCount + ' based in town, ' + stats.travelInCount + ' travelling in.' : '',
    stats.crossBorderCount ? stats.crossBorderCount + ' from ' + otherStateLabel(locality.state) + '.' : '',
    stats.openSundayCount ? stats.openSundayCount + ' open Sundays.' : '',
    'Contact details, hours and sources on every listing.',
  ].filter(Boolean);
  for (const e of extras) {
    if ((out + ' ' + e).length > 155) continue;
    out += ' ' + e;
  }
  return out;
}

/**
 * The town "In short". Near the top of the page, and the WebPage abstract.
 * Written as plain declaratives so that any one sentence can be quoted alone
 * and still be true, which is what an answer engine does with it.
 */
export function townInShort(
  locality: Locality,
  stats: LocalityStats,
  top: { category: Category; count: number }[],
): string {
  const seed = 'town:' + locality.slug;
  const where = locality.name + ', ' + locality.state + ' ' + locality.postcode;
  const cats = n(stats.categoryCount) + ' ' + plural(stats.categoryCount, 'category', 'categories');
  const out: string[] = [
    pick(
      [
        where + ' has ' + businessesNoun(stats.listingCount) + ' listed on LocalsKnow, across ' + cats + '.',
        'LocalsKnow lists ' + businessesNoun(stats.listingCount) + ' in ' + where + ', across ' + cats + '.',
      ],
      seed,
    ),
  ];

  if (stats.travelInCount === 0) {
    out.push(plural(stats.listingCount, 'It is', 'All of them are') + ' based in ' + locality.name + ' itself.');
  } else {
    out.push(
      n(stats.basedCount) +
        ' ' +
        plural(stats.basedCount, 'is', 'are') +
        ' based in ' +
        locality.name +
        ' and ' +
        n(stats.travelInCount) +
        ' ' +
        plural(stats.travelInCount, 'travels', 'travel') +
        ' in from nearby towns' +
        (stats.crossBorderCount
          ? ', ' + n(stats.crossBorderCount) + ' of them from ' + otherStateLabel(locality.state)
          : '') +
        '.',
    );
  }

  // "The largest categories are motels (1) and music shops (1)" ranks nothing,
  // so a town where nothing has two names the categories instead.
  if (top.length >= 2 && top[0].count >= 2) out.push('The largest categories are ' + categoryCounts(top) + '.');
  else if (top.length >= 2) out.push('Categories listed include ' + listPhrase(top.slice(0, 4).map((a) => lowerName(a.category.name))) + '.');

  if (stats.openSaturdayCount || stats.openSundayCount) {
    const parts: string[] = [];
    if (stats.openSaturdayCount) parts.push(counted(stats.openSaturdayCount, 'publishes', 'publish') + ' Saturday hours');
    if (stats.openSundayCount) parts.push(counted(stats.openSundayCount, 'publishes', 'publish') + ' Sunday hours');
    out.push(listPhrase(parts) + '.');
  }

  const when = checkedPhrase(stats.checkedFrom, stats.checkedTo);
  if (when) out.push('Listing details were last read from their sources ' + when + '.');
  return out.join(' ');
}

/**
 * Town hub FAQs, every answer counted rather than written.
 *
 * These replaced three questions that read the same in every town ("Is listing
 * a business free?"), which is the opposite of what a page in "crawled, not
 * indexed" needs. Each one below only appears when the town has an answer to
 * it, so a village with no Sunday trading is not asked about Sunday.
 */
export function townFaqs(opts: {
  locality: Locality;
  stats: LocalityStats;
  nearby: Neighbour[];
  asOf: string;
}): Faq[] {
  const { locality, stats, nearby, asOf } = opts;
  const town = locality.name;
  const otherState = otherStateLabel(locality.state);
  const faqs: Faq[] = [];

  faqs.push({
    q: 'How many businesses are listed in ' + town + '?',
    a:
      businessesNoun(stats.listingCount) +
      ', across ' +
      n(stats.categoryCount) +
      ' ' +
      plural(stats.categoryCount, 'category', 'categories') +
      '. ' +
      (stats.travelInCount
        ? n(stats.basedCount) +
          ' ' +
          plural(stats.basedCount, 'is', 'are') +
          ' based in ' +
          town +
          ' and ' +
          n(stats.travelInCount) +
          ' ' +
          plural(stats.travelInCount, 'is', 'are') +
          ' based in a nearby town and ' +
          plural(stats.travelInCount, 'covers', 'cover') +
          ' it' +
          (stats.travelInInferredCount
            ? ', ' +
              (stats.travelInInferredCount === stats.travelInCount ? 'all' : n(stats.travelInInferredCount)) +
              ' of those on a service area we estimated from distance rather than one the business stated'
            : '') +
          '. '
        : 'All of them are based in ' + town + ' itself. ') +
      'Counted on ' +
      humanDate(asOf) +
      '.',
  });

  if (stats.crossBorderCount > 0) {
    const tradesShare = stats.crossBorderCategories
      .filter((c) => c.category.vertical === 'trades')
      .reduce((t, c) => t + c.count, 0);
    const noun = tradesShare * 2 >= stats.crossBorderCount ? 'trades and services' : 'businesses';
    const homes = stats.crossBorderHomes.slice(0, 3).map((h) => h.locality.name + ' (' + n(h.count) + ')');
    faqs.push({
      q: 'Which ' + noun + ' travel to ' + town + ' from ' + otherState + '?',
      a:
        n(stats.crossBorderCount) +
        ' ' +
        plural(stats.crossBorderCount, 'business based in ', 'businesses based in ') +
        otherState +
        ' ' +
        plural(stats.crossBorderCount, 'is', 'are') +
        ' listed as covering ' +
        town +
        '. ' +
        (stats.crossBorderCategories.length > 1
          ? 'The most common are ' + categoryCounts(stats.crossBorderCategories) + '. '
          : stats.crossBorderCategories.length === 1
            ? 'All of them are ' + lowerName(stats.crossBorderCategories[0].category.name) + '. '
            : '') +
        (homes.length ? plural(stats.crossBorderCount, 'It is', 'They are') + ' based in ' + listPhrase(homes) + (stats.crossBorderHomes.length > 3 ? ', among other towns' : '') + '. ' : '') +
        (stats.crossBorderInferredCount === stats.crossBorderCount
          ? 'Each of those service areas is our estimate from distance, not something the business has stated, so ask when you call.'
          : stats.crossBorderInferredCount > 0
            ? 'For ' + n(stats.crossBorderInferredCount) + ' of them the service area is our estimate from distance, so ask when you call.'
            : 'Each of them states ' + town + ' in its own service area.'),
    });
  }

  if (stats.openSundayCount > 0) {
    const names = stats.sundayBased.slice(0, 3).map((l) => l.name);
    faqs.push({
      q: 'What is open on Sunday in ' + town + '?',
      a:
        n(stats.openSundayCount) +
        ' of the ' +
        n(stats.listingCount) +
        ' listings for ' +
        town +
        plural(stats.openSundayCount, ' publishes', ' publish') + ' Sunday hours' +
        (stats.sundayCategories.length > 1 ? ', including ' + categoryCounts(stats.sundayCategories) : '') +
        '. ' +
        (names.length
          ? (names.length === 1 ? 'Based in town, that is ' : 'Based in town, they include ') + listPhrase(names) + '. '
          : '') +
        (stats.openSaturdayCount ? counted(stats.openSaturdayCount, 'publishes', 'publish') + ' Saturday hours. ' : '') +
        'Hours change over public holidays, so check the listing before you go.',
    });
  }

  if (nearby.length > 0) {
    const sorted = nearby.slice().sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 6);
    faqs.push({
      q: 'Which towns are near ' + town + '?',
      a:
        listPhrase(
          sorted.map(
            (nb) =>
              nb.locality.name +
              (nb.crossesBorder ? ' in ' + STATES[nb.locality.state].name : '') +
              ' (' +
              kmLabel(nb.distanceKm) +
              ')',
          ),
        ) +
        '. Distances are in a straight line between town centres, and every town listed has its own page here.',
    });
  }

  faqs.push({ q: 'What is ' + town + ' known for?', a: locality.blurb });

  if (stats.pricedCount > 0 || stats.licencePublishedCount > 0) {
    const parts: string[] = [];
    if (stats.pricedCount) parts.push(counted(stats.pricedCount, 'shows', 'show') + ' a price band or a call out fee');
    if (stats.licencePublishedCount) parts.push(counted(stats.licencePublishedCount, 'prints', 'print') + ' a trade licence number');
    faqs.push({
      q: 'Do listings in ' + town + ' show prices or licence numbers?',
      a:
        'Of the ' +
        n(stats.listingCount) +
        ' listings, ' +
        listPhrase(parts) +
        '. ' +
        (stats.licencePublishedCount
          ? stats.licenceCheckedCount
            ? n(stats.licenceCheckedCount) + ' of those licences have been checked against the state register, with the date shown on the listing.'
            : 'A printed licence number was read from the business’s own published material and is shown as published, not as checked against a register.'
          : 'Prices are as the business publishes them. Confirm before you book.'),
    });
  }

  return faqs;
}

/** "6 km", "0.8 km". */
export const kmLabel = (km: number): string => (km < 10 ? String(Math.round(km * 10) / 10) : String(Math.round(km))) + ' km';

// ------------------------------------------------------------------ region hubs

export function regionTitleLadder(region: Region, stats: RegionStats): string[] {
  const listed = n(stats.listingCount) + ' listed';
  const code = region.state;
  // An empty region is a crawl path, not a directory, and its title says so.
  if (!stats.listingCount) return [region.name + ', ' + STATES[code].name];
  return [
    region.name + ' ' + code + ' business directory: ' + listed,
    region.name + ' ' + code + ' business directory (' + listed + ')',
    region.name + ' business directory',
    region.name + ', ' + STATES[code].name,
  ];
}

/** Region "In short". Distinct counts, biggest towns by what is based there. */
export function regionInShort(region: Region, stats: RegionStats): string {
  const state = STATES[region.state].name;
  const towns = stats.liveTowns.length;
  const out: string[] = [
    'The ' +
      region.name +
      ' region of ' +
      state +
      ' has ' +
      n(stats.listingCount) +
      ' ' +
      plural(stats.listingCount, 'business', 'businesses') +
      ' listed on LocalsKnow, across ' +
      n(towns) +
      ' ' +
      plural(towns, 'town', 'towns') +
      ' with ' +
      plural(towns, 'a page', 'pages') +
      '.',
  ];
  if (stats.basedCount !== stats.listingCount) {
    out.push(
      n(stats.basedCount) +
        ' of them ' +
        plural(stats.basedCount, 'is', 'are') +
        ' based in the region and the rest travel in from towns outside it.',
    );
  }
  const lead = stats.townsByBased.filter((t) => t.based > 0).slice(0, 3);
  if (lead.length >= 2) {
    out.push(
      'The most businesses are based in ' +
        listPhrase(lead.map((t) => t.locality.name + ' (' + n(t.based) + ')')) +
        '.',
    );
  }
  if (stats.categories.length >= 2) out.push('The largest categories are ' + categoryCounts(stats.categories) + '.');
  const when = checkedPhrase(stats.checkedFrom, stats.checkedTo);
  if (when) out.push('Listing details were last read from their sources ' + when + '.');
  return out.join(' ');
}

// ------------------------------------------------------------------ listings

/**
 * Which days a listing opens, in the words a person uses.
 *
 * "Open 7 days", "Open Monday to Friday", "Open Tuesday to Sunday", or a count
 * when the days are not one run. Weeks are read from Monday, because "Monday to
 * Saturday" is how a shop door says it. Undefined when no hours are published,
 * so a caller cannot print a claim about hours it does not have.
 */
export function openDaysPhrase(hours: OpeningHour[]): string | undefined {
  const open = new Set(hours.filter((h) => !h.closed).map((h) => h.day));
  if (!open.size) return undefined;
  if (open.size === 7) return 'Open 7 days';
  const week = [1, 2, 3, 4, 5, 6, 0];
  const flags = week.map((d) => open.has(d));
  const first = flags.indexOf(true);
  const last = flags.lastIndexOf(true);
  const contiguous = flags.slice(first, last + 1).every(Boolean);
  if (open.size === 1) return 'Open ' + DAYS[week[first]] + 's only';
  if (contiguous) return 'Open ' + DAYS[week[first]] + ' to ' + DAYS[week[last]];
  return 'Open ' + open.size + ' days a week' + (open.has(6) ? ', including Saturday' : '');
}

/** The facts a listing page can actually answer, in the order people search for them. */
function listingFacts(l: Listing): string[] {
  const facts: string[] = [];
  if (openDaysPhrase(l.hours)) facts.push('hours');
  if (l.phone) facts.push('phone');
  if (!l.isMobile && l.addressLine) facts.push('address');
  return facts;
}

const factPhrase = (facts: string[]) => (facts.length > 1 ? facts.slice(0, -1).join(', ') + ' & ' + facts[facts.length - 1] : facts[0] ?? '');

/**
 * Listing title ladder.
 *
 * Almost every query this site ranks for is a business name, and the person
 * typing "wodonga waves" usually wants the number, the hours or the address.
 * So the title says which of those the page has: "Wodonga WAVES, Wodonga VIC:
 * hours, phone & address". Only facts the listing holds are named, so a mobile
 * trade never promises an address and a listing with no hours never promises
 * hours. The old "Name — Category in Town" rungs stay underneath for listings
 * with nothing to name and for names too long to carry the facts.
 */
export function listingTitleLadder(l: Listing, locality: Locality, category: Category): string[] {
  const facts = listingFacts(l);
  const ladder: string[] = [];
  if (facts.length) {
    ladder.push(l.name + ', ' + locality.name + ' ' + locality.state + ': ' + factPhrase(facts));
    ladder.push(l.name + ', ' + locality.name + ': ' + factPhrase(facts));
    if (facts.length > 2) {
      ladder.push(l.name + ', ' + locality.name + ' ' + locality.state + ': ' + factPhrase(facts.slice(0, 2)));
      ladder.push(l.name + ', ' + locality.name + ': ' + factPhrase(facts.slice(0, 2)));
    }
    // A name too long to carry its town still carries the facts: the name is
    // what was searched, and the breadcrumb under the result shows the town.
    ladder.push(l.name + ': ' + factPhrase(facts));
    if (facts.length > 2) ladder.push(l.name + ': ' + factPhrase(facts.slice(0, 2)));
  }
  ladder.push(
    l.name + ' — ' + category.nameSingular + ' in ' + locality.name + ' ' + locality.state,
    l.name + ' — ' + category.nameSingular + ' in ' + locality.name,
    l.name + ' — ' + category.nameSingular,
    l.name + ' — ' + locality.name + ' ' + locality.state,
    l.name,
  );
  return ladder;
}

/**
 * Listing meta description: the answer first, then what the business is.
 *
 * The title promises hours, phone and address, so the snippet leads with them:
 * "Gum Tree Pies Wodonga, bakery at 1/15 Aurora Way, Wodonga VIC 3690. Phone
 * 02 6056 6777. Open 7 days." Then as much of the researched description as
 * fits in whole sentences. A mobile trade gets its base town and no street, the
 * same rule listingNode applies to the structured data.
 *
 * The name leads because it is what was searched, so it is the phrase a
 * results page puts in bold, and because two records for one business at one
 * address otherwise produce the same snippet word for word.
 */
export function listingDescription(l: Listing, locality: Locality, category: Category): string {
  const kind = lowerName(category.nameSingular);
  const place = locality.name + ' ' + locality.state + ' ' + (l.postcode || locality.postcode);
  const lead: string[] = [];
  if (l.isMobile) lead.push(l.name + ', mobile ' + kind + ' based in ' + place + ', no shopfront.');
  else if (l.addressLine) lead.push(l.name + ', ' + kind + ' at ' + l.addressLine + ', ' + place + '.');
  else lead.push(l.name + ', ' + kind + ' in ' + place + '.');
  if (l.phone) lead.push('Phone ' + l.phone + '.');
  const days = openDaysPhrase(l.hours);
  if (days) lead.push(days + '.');

  // Facts first, then whole sentences of the description while they fit.
  //
  // Whole sentences only. Clipping one to fit was tried and produced "Global
  // Factory Maintenance is a Kane Road." out of a sentence whose first comma
  // fell after the street, and "…Phone 03 4050 7056. Elite Excavation Co." out
  // of a name ending in an abbreviation. A snippet of facts that stops cleanly
  // beats either.
  let out = lead.join(' ');
  const said = new Set(out.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
  const sentences: string[] = [];
  let rest = l.description.replace(/\s+/g, ' ').trim();
  while (rest) {
    const s = firstSentence(rest);
    if (!s) break;
    sentences.push(s);
    rest = rest.slice(s.length).trim();
  }
  for (const s of sentences) {
    // "Cafe at 149 Fryers Street, Shepparton." after a lead that already said
    // so is the same sentence twice. Skip one whose words the lead has used.
    const words = s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
    if (words.length && words.filter((w) => said.has(w)).length / words.length >= 0.7) continue;
    if ((out + ' ' + s).length > 156) break;
    out += ' ' + s;
  }

  if (out.length < 110) {
    const tail = ' Sources and last checked date on the page.';
    if (out.length + tail.length <= 156) out += tail;
  }
  return out;
}

// ------------------------------------------------------------------ hours

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const dayName = (d: number) => DAYS[d];
export const dayShort = (d: number) => DAYS[d].slice(0, 3);

export function formatTime(t?: string): string {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? hour12 + suffix : hour12 + ':' + String(m).padStart(2, '0') + suffix;
}

export function stateLabel(code: 'NSW' | 'VIC'): string {
  return STATES[code].name;
}

export function otherStateLabel(code: 'NSW' | 'VIC'): string {
  return code === 'NSW' ? 'Victoria' : 'New South Wales';
}

/** "1,240" not "1240". Used everywhere a count appears in prose. */
export const n = (v: number) => v.toLocaleString('en-AU');
