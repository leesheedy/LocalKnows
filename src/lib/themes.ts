/**
 * Themed locality pages.
 *
 * "Albury nightlife" is a real query and a category page cannot answer it,
 * because the answer spans pubs, bars, breweries and live music venues and
 * excludes the bowls club that shuts at six. Same for "things to do in Wagga
 * with kids" and "dog friendly cafes Albury".
 *
 * Each theme is a filter over the listings we already hold plus the copy that
 * explains what qualified. Nothing here is editorial selection: a listing is on
 * the page because it matched a stated rule, and the rule is printed on the page.
 */
import type { Category, Listing } from './types';

export interface Theme {
  slug: string;
  /** Used in the H1 as "<Locality> <noun>" or the title template below. */
  title: (place: string) => string;
  metaTitle: (place: string, state: string) => string;
  eyebrow: string;
  /** One sentence under the H1. */
  standfirst: (place: string, count: number) => string;
  /** How the page explains its own selection. Shown in a notice block. */
  rule: string;
  /** Minimum matching listings before the page is generated at all. */
  min: number;
  matches: (l: Listing, category: Category | undefined) => boolean;
  /** Optional grouping headings, applied in order; a listing lands in the first it matches. */
  groups?: { key: string; blurb: string; test: (l: Listing, c: Category | undefined) => boolean }[];
  faqs: (place: string, state: string, count: number) => { q: string; a: string }[];
}

const attr = (l: Listing, key: string) => l.attributes?.[key] === 'yes';
const inCat = (c: Category | undefined, ...slugs: string[]) => Boolean(c && slugs.includes(c.slug));
const openOn = (l: Listing, day: number) => l.hours.some((h) => h.day === day && !h.closed);

/** Closing time in minutes past midnight, for the latest day published. */
const latestClose = (l: Listing): number => {
  let latest = 0;
  for (const h of l.hours) {
    if (h.closed || !h.closes) continue;
    const [hh, mm] = h.closes.split(':').map(Number);
    // A close before 6am is the following morning, so it beats any evening time.
    const mins = hh < 6 ? (hh + 24) * 60 + mm : hh * 60 + mm;
    if (mins > latest) latest = mins;
  }
  return latest;
};

export const THEMES: Theme[] = [
  {
    slug: 'nightlife',
    title: (p) => p + ' nightlife',
    metaTitle: (p, s) => p + ' nightlife: pubs, bars and live music, ' + s,
    eyebrow: 'After dark',
    standfirst: (p, n) =>
      n +
      ' places in ' +
      p +
      ' that are open in the evening, from the pubs with a counter meal to the bars that keep going after the kitchen shuts.',
    rule:
      'A venue is on this page if it is a pub, bar, brewery, distillery or licensed club, or if it publishes live music. Venues that close before 6pm on every published day are left off, because a bowls club that shuts at five is not a night out.',
    min: 4,
    matches: (l, c) => {
      if (attr(l, 'live_music')) return true;
      const isVenue =
        l.vertical === 'pubs_clubs' ||
        inCat(c, 'pubs', 'bars', 'wine-bars', 'breweries', 'distilleries', 'rsl-clubs', 'nightclubs');
      if (!isVenue) return false;
      // If hours are published and everything shuts before 6pm, it is not nightlife.
      const close = latestClose(l);
      if (close > 0 && close < 18 * 60) return false;
      return true;
    },
    groups: [
      {
        key: 'Live music',
        blurb: 'Venues that publish live music. The list a touring band checks.',
        test: (l) => attr(l, 'live_music'),
      },
      {
        key: 'Pubs',
        blurb: 'Counter meals, a beer garden if you are lucky, and somewhere to sit.',
        test: (l, c) => inCat(c, 'pubs'),
      },
      {
        key: 'Bars and wine bars',
        blurb: 'Smaller rooms, later, usually without a bistro attached.',
        test: (l, c) => inCat(c, 'bars', 'wine-bars', 'nightclubs'),
      },
      {
        key: 'Breweries and distilleries',
        blurb: 'Taprooms and cellar doors that stay open into the evening.',
        test: (l, c) => inCat(c, 'breweries', 'distilleries'),
      },
      {
        key: 'Licensed clubs',
        blurb: 'Bigger rooms, cheaper meals, and usually a courtesy bus.',
        test: (l, c) => inCat(c, 'rsl-clubs', 'sports-clubs', 'bowls-clubs', 'golf-clubs'),
      },
    ],
    faqs: (p, s, n) => [
      {
        q: 'What is there to do at night in ' + p + '?',
        a:
          'We list ' +
          n +
          ' venues open in the evening in and around ' +
          p +
          ', ' +
          s +
          ': pubs, bars, breweries and licensed clubs, plus anywhere that publishes live music. Each one shows its published hours and the source they were read from.',
      },
      {
        q: 'Which venues in ' + p + ' have live music?',
        a: 'The live music section at the top of this page lists every venue whose own material says it puts on live music. A venue that does it occasionally without advertising it will not be there, so it is a floor rather than a ceiling.',
      },
      {
        q: 'How late do places stay open?',
        a: 'Where a venue publishes closing times we show them on its listing. Plenty publish "till late", which we do not record because it is not a time. Ring ahead if it matters, particularly on a Sunday or a public holiday.',
      },
      {
        q: 'Is this list paid for?',
        a: 'No. A venue is here because it matched the rule printed at the top of the page. There is no paid placement anywhere on this site and no field a payment writes to in the ordering.',
      },
    ],
  },

  {
    slug: 'with-kids',
    title: (p) => p + ' with kids',
    metaTitle: (p, s) => 'Things to do in ' + p + ' with kids, ' + s,
    eyebrow: 'Family',
    standfirst: (p, n) =>
      n + ' places in and around ' + p + ' that publish something for children, from playgrounds to indoor play to family rooms.',
    rule:
      'A place is on this page if it publishes that it is kid friendly, has a playground, runs a junior program, offers family rooms or a kids menu, or is an indoor play centre, park, pool or wildlife park. We do not infer it, so somewhere perfectly good that has not said so will be missing.',
    min: 4,
    matches: (l, c) =>
      attr(l, 'kid_friendly') ||
      attr(l, 'playground') ||
      attr(l, 'junior_program') ||
      attr(l, 'family_rooms') ||
      attr(l, 'kids_menu') ||
      inCat(c, 'indoor-play-centres', 'parks-and-gardens', 'water-parks', 'wildlife-parks', 'mini-golf', 'bowling-alleys', 'swimming-spots'),
    groups: [
      {
        key: 'Free and outdoors',
        blurb: 'Parks, playgrounds and swimming spots. The first hour of any weekend.',
        test: (l, c) => attr(l, 'free_entry') || inCat(c, 'parks-and-gardens', 'swimming-spots'),
      },
      {
        key: 'When it rains',
        blurb: 'Indoor play, cinemas, bowling and museums.',
        test: (l, c) => inCat(c, 'indoor-play-centres', 'bowling-alleys', 'cinemas', 'museums', 'art-galleries'),
      },
      {
        key: 'Eating out with them',
        blurb: 'Places that publish a kids menu or say they are kid friendly.',
        test: (l) => ['eat_drink', 'pubs_clubs'].includes(l.vertical),
      },
      {
        key: 'Clubs and junior programs',
        blurb: 'Sport and hobby groups that run something for juniors. The cheapest way to fill a Saturday.',
        test: (l) => l.vertical === 'clubs_hobbies',
      },
    ],
    faqs: (p, s, n) => [
      {
        q: 'What can you do in ' + p + ' with kids?',
        a:
          n +
          ' places in and around ' +
          p +
          ', ' +
          s +
          ' publish something for children. The free and outdoor section is the one to start with, and the rainy day section is the one you will want in July.',
      },
      {
        q: 'Which of these are free?',
        a: 'Parks, playgrounds, most swimming spots and the walking trails. They are grouped first on this page because nobody advertises the free ones, which is exactly why they are hard to find.',
      },
      {
        q: 'How were these chosen?',
        a: 'By a stated rule, not by opinion. A place qualifies if it publishes that it is kid friendly, has a playground, runs a junior program, offers family rooms or a kids menu, or is one of a short list of category types. Nothing was inferred.',
      },
    ],
  },

  {
    slug: 'dog-friendly',
    title: (p) => 'Dog friendly ' + p,
    metaTitle: (p, s) => 'Dog friendly cafes, pubs and parks in ' + p + ', ' + s,
    eyebrow: 'Bring the dog',
    standfirst: (p, n) =>
      n + ' places around ' + p + ' that say dogs are welcome, and a note on what that usually means in practice.',
    rule:
      'A place is here only if its own material says dogs are welcome, or it is pet friendly accommodation. Nothing is assumed. In New South Wales and Victoria dogs are generally allowed in outdoor dining areas at the venue’s discretion, so an outdoor courtyard is not the same as a yes.',
    min: 3,
    matches: (l) => attr(l, 'dog_friendly') || attr(l, 'pet_friendly'),
    faqs: (p, s, n) => [
      {
        q: 'Which cafes in ' + p + ' are dog friendly?',
        a:
          'We list ' +
          n +
          ' dog friendly places around ' +
          p +
          ', ' +
          s +
          ', and each one is here because its own material says so rather than because it has an outdoor table.',
      },
      {
        q: 'Can I take a dog into a cafe in NSW or Victoria?',
        a: 'Generally into the outdoor area only, and at the venue’s discretion. Both states permit dogs in outdoor dining spaces subject to conditions, and no state permits them inside a food preparation area. An assistance animal is a different question and is permitted by law.',
      },
      {
        q: 'What about the pubs?',
        a: 'Beer gardens are usually the answer, and the ones that welcome dogs tend to say so. Check the listing for what the venue itself publishes and ring if you are driving any distance.',
      },
    ],
  },

  {
    slug: 'breakfast-and-brunch',
    title: (p) => 'Breakfast and brunch in ' + p,
    metaTitle: (p, s) => 'Breakfast and brunch in ' + p + ', ' + s,
    eyebrow: 'Mornings',
    standfirst: (p, n) => n + ' places in ' + p + ' open in the morning, with their published opening times.',
    rule:
      'A place is on this page if it is a cafe, bakery or coffee roaster, or if it publishes breakfast. Where opening hours are published we show the earliest one, because at seven on a Saturday that is the only fact that matters.',
    min: 4,
    matches: (l, c) =>
      attr(l, 'breakfast') || inCat(c, 'cafes', 'bakeries', 'coffee-roasters'),
    groups: [
      {
        key: 'Open Sundays',
        blurb: 'The shortest list in any regional town, and the one people actually need.',
        test: (l) => openOn(l, 0),
      },
      {
        key: 'Open Saturdays',
        blurb: 'Open on a Saturday but not published as open on a Sunday.',
        test: (l) => openOn(l, 6),
      },
      {
        key: 'Weekdays',
        blurb: 'Everywhere else that publishes morning hours.',
        test: () => true,
      },
    ],
    faqs: (p, s, n) => [
      {
        q: 'Where can I get breakfast in ' + p + '?',
        a:
          n +
          ' places in ' +
          p +
          ', ' +
          s +
          ' serve breakfast or open as a cafe or bakery in the morning. The Sunday list is grouped first because it is the shortest and the hardest to find.',
      },
      {
        q: 'What is open on a Sunday morning?',
        a: 'The first section of this page. It is built from published hours only, so a place that opens Sundays without saying so will be missing. That gap is the single most common thing wrong with hours data in any directory, including this one.',
      },
    ],
  },

  {
    slug: 'free-things-to-do',
    title: (p) => 'Free things to do in ' + p,
    metaTitle: (p, s) => 'Free things to do in ' + p + ', ' + s,
    eyebrow: 'Costs nothing',
    standfirst: (p, n) =>
      n + ' places around ' + p + ' that cost nothing to visit. Nobody advertises these, which is why they are hard to find.',
    rule:
      'A place is here if it publishes free entry, or it is a park, garden, lookout, walking trail, swimming spot or heritage site with no admission charge. Free places have nobody paying to promote them, so they lose every search to whatever does.',
    min: 3,
    matches: (l, c) =>
      attr(l, 'free_entry') ||
      inCat(c, 'parks-and-gardens', 'lookouts', 'walking-trails', 'mountain-bike-trails', 'swimming-spots'),
    faqs: (p, s, n) => [
      {
        q: 'What can you do for free in ' + p + '?',
        a:
          n +
          ' places around ' +
          p +
          ', ' +
          s +
          ' cost nothing: parks, gardens, lookouts, walking trails and swimming spots. Most have no phone number and no website, which is exactly why they are invisible to a normal search.',
      },
      {
        q: 'Are these really free?',
        a: 'Free to enter, as published. Some have paid parking, a paid guided option, or a donation box. Where a place charges for anything we note it on its listing.',
      },
    ],
  },
];

export const THEME_SLUGS = THEMES.map((t) => t.slug);
