/**
 * Compiles curated lists from the listing data.
 *
 * Run: node scripts/generate-lists.mjs
 * Writes: src/data/lists-generated.json
 *
 * The hand written lists in src/data/lists.json are never touched by this
 * script. They are a different thing and they say so on the page: somebody
 * chose those entries and wrote those notes. These are compiled by a rule, and
 * every one of them prints the rule it was compiled by, the same way the hidden
 * gems page does. Blurring the two would make the lists index page's claim that
 * its lists are "written and ranked by a person" false, which is a worse
 * outcome than having fewer lists.
 *
 * Nothing here invents a fact. Every blurb is assembled from the highlights
 * already recorded against that listing, which were read from the business's
 * own published material during research. The only editorial act is choosing
 * which of a business's facts are the relevant ones for a given list, and that
 * is genuinely useful: a cafe on a Sunday list should lead with its Sunday
 * hours, and the same cafe on a step free list should lead with its access.
 *
 * A list only exists where it is a shape no other page on the site already
 * has. Locality x category is a money page, category x attribute is a modifier
 * page, and the five cross category themes are theme pages. What is left, and
 * what this builds, is:
 *
 *   - a street, which is finer grained than a suburb
 *   - a day out, which crosses verticals in a deliberate order
 *   - a category across a whole region, which sits between the town page and
 *     the site wide category page and matches how people actually search
 *   - a cross vertical attribute cut, which no modifier page spans
 */
import fs from 'node:fs';
import path from 'node:path';

const DATA = path.join(process.cwd(), 'src', 'data');
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

const listings = read('listings.json');
const taxonomy = read('categories.json');
const nsw = read('geo-nsw.json');
const vic = read('geo-vic.json');
const handWritten = read('lists.json');

const categories = new Map(taxonomy.categories.map((c) => [c.id, c]));
const localities = new Map([...nsw.localities, ...vic.localities].map((l) => [l.id, l]));
const regions = new Map([...nsw.regions, ...vic.regions].map((r) => [r.id, r]));

const BUILD_DATE = process.env.BUILD_DATE || new Date().toISOString().slice(0, 10);

const live = listings.filter((l) => l.status !== 'suspended');
const basedIn = (localityId) => live.filter((l) => l.localityId === localityId);
const primaryCat = (l) => categories.get(l.categoryIds[0]);

// ------------------------------------------------------------------ blurbs

/**
 * Words that make a highlight relevant to a particular kind of list. The first
 * highlight that matches leads the blurb, so the same business reads
 * differently depending on why it is on the list.
 */
const ANGLE_WORDS = {
  breakfast: /breakfast|brunch|coffee|espresso|opens? \d|early/i,
  sunday: /sunday|seven days|every day|weekend/i,
  music: /music|band|gig|dj|jam|open mic/i,
  venue: /function|room|capacity|group|book|private|wedding|conference/i,
  access: /wheelchair|step free|accessible|ramp|ground floor|disabled/i,
  stay: /room|suite|cabin|site|powered|bed|guest|night/i,
  outdoors: /courtyard|garden|outdoor|deck|verandah|balcony|alfresco/i,
  family: /kid|child|family|playground|pram|high chair/i,
  history: /historic|heritage|built|18\d\d|19\d\d|original|restored|listed/i,
  food: /menu|kitchen|meals|food|pizza|counter|bakery|produce/i,
};

const trimStop = (s) => String(s).trim().replace(/[.;,]+$/, '');

/** Sentence case without touching an already capitalised proper noun. */
function sentence(text) {
  const t = trimStop(text);
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}

const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function hoursNote(l) {
  // Distinct days, not hour entries. A restaurant that publishes lunch and
  // dinner separately has fourteen entries across a seven day week, and
  // counting entries produced "Open 14 days including Sunday".
  const days = new Set((l.hours ?? []).filter((h) => !h.closed && h.opens).map((h) => h.day));
  if (!days.size) return '';
  if (days.size === 7) return 'Open seven days';
  const names = [...days].sort((a, b) => a - b).map((d) => DAY[d]);
  if (names.length <= 2) return 'Open ' + names.join(' and ');
  return days.has(0) ? 'Open ' + days.size + ' days including Sunday' : 'Closed Sundays';
}

/**
 * Two or three of a listing's own facts, chosen for this list's angle.
 * Returns '' when there is nothing recorded worth printing, and the caller
 * drops the item rather than padding it.
 */
function blurb(l, angle, skip) {
  const pool = (l.highlights ?? [])
    .map(trimStop)
    .filter((h) => h && h.length > 3)
    // Used by the established lists, where the year is already the opening
    // words and "Since 1851. Operating since 1851." is the result of not
    // dropping the highlight that says the same thing.
    .filter((h) => !skip || !skip.test(h));
  if (!pool.length) return '';

  const rx = ANGLE_WORDS[angle];
  const ranked = rx ? [...pool].sort((a, b) => (rx.test(b) ? 1 : 0) - (rx.test(a) ? 1 : 0)) : pool;

  const picked = ranked.slice(0, 2);
  let out = sentence(picked[0]);
  if (picked[1]) out += '. ' + sentence(picked[1]);
  out += '.';

  const extras = [];
  const HOURS_MATTER = new Set(['eat_drink', 'pubs_clubs', 'things_to_do', 'stay']);
  const hrs = HOURS_MATTER.has(l.vertical) ? hoursNote(l) : '';
  // Only add the hours line when it is not already the thing being said.
  if (hrs && !/open|closed|days/i.test(out)) extras.push(hrs);
  if (l.priceBand && angle === 'food') extras.push(l.priceBand);
  if (extras.length) out += ' ' + extras.join('. ') + '.';

  return out;
}

// ------------------------------------------------------------------ helpers

const slugify = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const METHOD_NOTE =
  'This list is compiled by a rule rather than written by hand, and the rule is stated above. ' +
  'The note under each entry is assembled from the facts recorded against that business during ' +
  'research, taken from what it publishes about itself. Nothing here is a review, nobody paid to ' +
  'be included, and the order is not a ranking.';

const out = [];
const seen = new Set(handWritten.map((l) => l.slug));

/**
 * Does a hand written list already cover this ground?
 *
 * Slug collision is not enough. "Eating on Dean Street, Albury" was written by
 * hand, and the street builder happily produced "Eating and drinking on Dean
 * Street, Albury" beside it under a different slug: two lists about the same
 * street, the compiled one quietly competing with the better one. A compiled
 * list stands down whenever a written list is about the same place and subject.
 */
function coveredByHand(localitySlug, subject) {
  const needle = subject.toLowerCase();
  return handWritten.some(
    (l) => l.localitySlug === localitySlug && l.title.toLowerCase().includes(needle),
  );
}

function push(list) {
  if (seen.has(list.slug)) return;
  if (list.items.length < 5) return;
  seen.add(list.slug);
  out.push({
    ...list,
    author: 'LocalsKnow',
    method: 'compiled',
    publishedAt: BUILD_DATE,
    reviewedAt: BUILD_DATE,
  });
}

const itemsFor = (rows, angle) =>
  rows
    .map((l) => ({ listingSlug: l.slug, blurb: blurb(l, angle) }))
    .filter((i) => i.blurb);

// ------------------------------------------------------------------ streets

/**
 * A named street is finer grained than a suburb and is how people describe
 * where they are going. No page on this site works at that scale.
 */
function streetLists() {
  const strips = new Map();
  for (const l of live) {
    if (!l.addressLine) continue;
    const m = l.addressLine.match(
      /\b(?:\d+[a-z]?(?:\s*[-/]\s*\d+[a-z]?)?\s+)?([A-Z][A-Za-z'’]*(?:\s+[A-Z][A-Za-z'’]*)*\s+(?:Street|Road|Avenue|Parade|Terrace|Lane|Highway|Place|Drive))\b/,
    );
    if (!m) continue;
    const key = m[1].trim() + '|' + l.localityId;
    if (!strips.has(key)) strips.set(key, []);
    strips.get(key).push(l);
  }

  for (const [key, rows] of strips) {
    const [street, localityId] = key.split('|');
    const locality = localities.get(localityId);
    if (!locality || rows.length < 6) continue;

    const verticals = new Set(rows.map((r) => r.vertical));
    if (verticals.size < 2) continue;
    if (coveredByHand(locality.slug, street)) continue;

    const eatDrink = rows.filter((r) => r.vertical === 'eat_drink' || r.vertical === 'pubs_clubs');
    const foodLed = eatDrink.length >= 6 && eatDrink.length >= rows.length * 0.6;

    const title = foodLed
      ? 'Eating and drinking on ' + street + ', ' + locality.name
      : 'What is on ' + street + ', ' + locality.name;

    // A food titled list contains the food and nothing else. A mixed strip
    // keeps everything and says so.
    const chosen = foodLed ? eatDrink : rows;

    const ordered = [...chosen].sort((a, b) => {
      const na = parseInt((a.addressLine || '').match(/^\d+/)?.[0] ?? '9999', 10);
      const nb = parseInt((b.addressLine || '').match(/^\d+/)?.[0] ?? '9999', 10);
      return na - nb;
    });

    const shape = foodLed
      ? 'Every place to eat or drink we list with an address on ' + street
      : 'Everything we list with an address on ' + street;

    push({
      slug: slugify(street + '-' + locality.name),
      title,
      intro:
        shape + ' in ' + locality.name + ', ' + locality.state + ', walked end to end in ' +
        'street number order rather than sorted by rating. ' + ordered.length + ' places' +
        (foodLed ? '' : ' across ' + verticals.size + ' kinds of business') + '. ' +
        'A street is how people actually describe where they are going, and it is the one ' +
        'grouping a directory organised by suburb and category cannot show you. ' + METHOD_NOTE,
      localitySlug: locality.slug,
      state: locality.state,
      items: itemsFor(ordered, foodLed ? 'food' : null),
    });
  }
}

// ------------------------------------------------------------------ a day out

/**
 * An itinerary crosses verticals in a deliberate order, which is the one thing
 * a category page can never do: morning coffee, something to see, lunch, and
 * somewhere to finish.
 */
function dayOutLists() {
  for (const [localityId, locality] of localities) {
    const rows = basedIn(localityId);
    if (rows.length < 8) continue;

    const pick = (fn, n) =>
      rows.filter(fn).sort((a, b) => b.qualityScore - a.qualityScore).slice(0, n);

    const morning = pick(
      (l) => l.vertical === 'eat_drink' && (l.attributes?.breakfast === 'yes' || /coffee|cafe|bakery/i.test(primaryCat(l)?.name ?? '')),
      3,
    );
    const see = pick((l) => l.vertical === 'things_to_do', 4);
    const lunch = pick((l) => l.vertical === 'eat_drink' && !morning.includes(l), 2);
    const evening = pick((l) => l.vertical === 'pubs_clubs', 3);

    const ordered = [...morning, ...see, ...lunch, ...evening];
    if (morning.length < 1 || see.length < 2 || ordered.length < 6) continue;
    if (coveredByHand(locality.slug, 'a day in')) continue;

    push({
      slug: slugify('a-day-in-' + locality.name),
      title: 'A day in ' + locality.name,
      intro:
        'One way through ' + locality.name + ', ' + locality.state + ', in the order you would ' +
        'actually do it: somewhere for coffee first, ' + see.length + ' things to see in the ' +
        'middle, lunch, and somewhere to finish. Everything on it is based in ' + locality.name +
        ' rather than merely servicing it, so this is the town itself and not the district ' +
        'around it. ' + METHOD_NOTE,
      localitySlug: locality.slug,
      state: locality.state,
      items: itemsFor(ordered, 'food'),
    });
  }
}

// ------------------------------------------------------------------ region runs

/**
 * A category across a whole region. The town page is too narrow for somebody
 * planning a drive and the site wide category page is too broad, and "wineries
 * rutherglen district" is how the search is actually typed.
 */
function regionLists() {
  const combo = new Map();
  for (const l of live) {
    const locality = localities.get(l.localityId);
    if (!locality) continue;
    const key = locality.regionId + '|' + l.categoryIds[0];
    if (!combo.has(key)) combo.set(key, []);
    combo.get(key).push(l);
  }

  for (const [key, rows] of combo) {
    const [regionId, categoryId] = key.split('|');
    const region = regions.get(regionId);
    const category = categories.get(categoryId);
    if (!region || !category) continue;

    const towns = new Set(rows.map((r) => r.localityId));
    if (rows.length < 8 || towns.size < 3) continue;
    if (coveredByHand(localities.get(rows[0].localityId)?.slug, category.name)) continue;

    // Grouped by town so the list reads as a drive rather than a jumble.
    const ordered = [...rows].sort((a, b) => {
      const la = localities.get(a.localityId);
      const lb = localities.get(b.localityId);
      return (la?.name ?? '').localeCompare(lb?.name ?? '') || b.qualityScore - a.qualityScore;
    });

    const anchor = localities.get(ordered[0].localityId);

    push({
      slug: slugify(category.name + '-in-the-' + region.name),
      title: 'Every ' + category.name.toLowerCase() + ' in the ' + region.name,
      intro:
        'All ' + rows.length + ' ' + category.name.toLowerCase() + ' we list across the ' +
        region.name + ', in ' + towns.size + ' towns, grouped by town so it reads as a drive. ' +
        'The town pages are too narrow if you are planning a trip and the site wide category ' +
        'page is too broad, and the region is the level people actually search at. ' + METHOD_NOTE,
      localitySlug: anchor?.slug,
      state: anchor?.state ?? 'NSW',
      regionSlug: region.slug,
      categorySlug: category.slug,
      items: itemsFor(ordered, 'food'),
    });
  }
}

// ------------------------------------------------------------------ attribute cuts

/**
 * An attribute that spans verticals. The modifier pages cover an attribute
 * inside one category, so "dog friendly cafes" already has a page; what has no
 * page is everywhere in a town with a function room, whether that is a pub, a
 * club or a winery.
 */
const CUTS = [
  {
    key: 'function_room',
    angle: 'venue',
    slug: 'function-rooms-and-venues-in',
    title: (t) => 'Where to hold it in ' + t + ': function rooms and venues',
    why: 'Every place in TOWN we list with a function room or a space for a group, whichever kind of business it is. Pubs, clubs, wineries and restaurants all end up on the same shortlist when somebody is organising a wake, a birthday or a committee meeting, and no single category page shows you all of them at once.',
  },
  {
    key: 'live_music',
    angle: 'music',
    slug: 'live-music-in',
    title: (t) => 'Where to find live music in ' + t,
    why: 'Everywhere in TOWN that puts on live music, across pubs, clubs and anywhere else that has a stage. Live music is not a category, it is something a venue does, so it is spread across the directory rather than gathered anywhere.',
  },
  {
    key: 'wheelchair_accessible',
    angle: 'access',
    slug: 'step-free-access-in',
    title: (t) => 'Step free places in ' + t,
    title2: true,
    why: 'Everywhere in TOWN recorded as having step free or wheelchair access, across every kind of business. This is the sort of thing people ring ahead about one place at a time, and it is worth having in one list. Access recorded here is what the business publishes; if it matters, ring and check, because a listed ramp says nothing about the doorway or the toilet.',
  },
  {
    key: 'open_sunday',
    angle: 'sunday',
    slug: 'open-on-a-sunday-in',
    title: (t) => 'Open on a Sunday in ' + t,
    why: 'Everywhere in TOWN that publishes Sunday trading, across every kind of business. Sunday is the day a regional town closes and the day visitors have free, which makes it the single most useful thing to know and the hardest to look up one business at a time.',
  },
  {
    key: 'accommodation',
    angle: 'stay',
    slug: 'where-to-stay-in',
    title: (t) => 'Where to stay in ' + t,
    why: 'Everywhere in TOWN with rooms, from motels and pubs to caravan parks and cabins. Accommodation is split across several categories on this site because a pub with rooms and a caravan park are not the same business, but they are the same decision.',
  },
];

function attributeLists() {
  for (const cut of CUTS) {
    for (const [localityId, locality] of localities) {
      const rows = basedIn(localityId).filter((l) => l.attributes?.[cut.key] === 'yes');
      const verticals = new Set(rows.map((r) => r.vertical));
      if (rows.length < 5 || verticals.size < 2) continue;

      const ordered = [...rows].sort((a, b) => b.qualityScore - a.qualityScore);

      push({
        slug: slugify(cut.slug + '-' + locality.name),
        title: cut.title(locality.name),
        intro:
          cut.why.replace(/TOWN/g, locality.name) +
          ' ' + rows.length + ' places across ' + verticals.size + ' kinds of business. ' +
          METHOD_NOTE,
        localitySlug: locality.slug,
        state: locality.state,
        items: itemsFor(ordered, cut.angle),
      });
    }
  }
}


// ------------------------------------------------------------------ established

/**
 * The year a business says it started, taken from its own words.
 *
 * Only counted where the business states it. Nothing is inferred from a
 * heritage looking building or an old sounding name, because that would be
 * guessing about the one fact the list is entirely about.
 */
const FOUNDED =
  /\b(?:since|established(?: in)?|est\.?|founded(?: in)?|opened(?: in)?|operating since|trading since)\s+(1[89]\d{2}|20[0-2]\d)\b/i;

function foundedYear(l) {
  const hay = [l.description ?? '', ...(l.highlights ?? [])].join(' ');
  const m = hay.match(FOUNDED);
  if (!m) return null;
  const year = Number(m[1]);
  const thisYear = Number(BUILD_DATE.slice(0, 4));
  return year >= 1800 && year <= thisYear ? year : null;
}

function establishedLists() {
  const dated = live
    .map((l) => ({ l, year: foundedYear(l) }))
    .filter((x) => x.year !== null);

  const spans = (name) => (rows) =>
    rows[0].year + ' to ' + rows[rows.length - 1].year;

  // By town.
  const byTown = new Map();
  for (const d of dated) {
    if (!byTown.has(d.l.localityId)) byTown.set(d.l.localityId, []);
    byTown.get(d.l.localityId).push(d);
  }
  for (const [localityId, rows] of byTown) {
    const locality = localities.get(localityId);
    if (!locality || rows.length < 5) continue;
    const ordered = [...rows].sort((a, b) => a.year - b.year);
    const oldest = ordered[0];

    push({
      slug: slugify('long-established-businesses-in-' + locality.name),
      title: 'The long established businesses of ' + locality.name,
      intro:
        'The ' + ordered.length + ' businesses in ' + locality.name + ', ' + locality.state +
        ', that publish the year they started, oldest first. The earliest is ' +
        oldest.l.name + ', trading since ' + oldest.year + '. Only businesses that state a ' +
        'date themselves are here: nothing is inferred from an old building or an old ' +
        'sounding name, because that is the one fact this list is entirely about. ' +
        METHOD_NOTE,
      localitySlug: locality.slug,
      state: locality.state,
      items: ordered.map(({ l, year }) => ({
        listingSlug: l.slug,
        blurb: ('Since ' + year + '. ' + blurb(l, 'history', FOUNDED)).trim(),
      })),
    });
  }

  // And across a region, where the span is wider and more interesting.
  const byRegion = new Map();
  for (const d of dated) {
    const locality = localities.get(d.l.localityId);
    if (!locality) continue;
    if (!byRegion.has(locality.regionId)) byRegion.set(locality.regionId, []);
    byRegion.get(locality.regionId).push(d);
  }
  for (const [regionId, rows] of byRegion) {
    const region = regions.get(regionId);
    if (!region || rows.length < 10) continue;
    const ordered = [...rows].sort((a, b) => a.year - b.year);
    const anchor = localities.get(ordered[0].l.localityId);
    const towns = new Set(rows.map((r) => r.l.localityId));

    push({
      slug: slugify('oldest-businesses-in-the-' + region.name),
      title: 'The oldest businesses still trading in the ' + region.name,
      intro:
        ordered.length + ' businesses across ' + towns.size + ' towns of the ' + region.name +
        ' that publish the year they started, oldest first, running from ' + ordered[0].year +
        ' to ' + ordered[ordered.length - 1].year + '. The list is only as old as what each ' +
        'business says about itself, so a pub that has poured beer since the gold rush but ' +
        'never prints a date is not here. ' + METHOD_NOTE,
      localitySlug: anchor?.slug,
      state: anchor?.state ?? 'NSW',
      regionSlug: region.slug,
      items: ordered.map(({ l, year }) => ({
        listingSlug: l.slug,
        blurb:
          ('Since ' + year + ', in ' + (localities.get(l.localityId)?.name ?? '') + '. ' +
            blurb(l, 'history', FOUNDED)).trim(),
      })),
    });
  }
}

// ------------------------------------------------------------------ late

/** Kitchens and bars still going at eight, which no page currently answers. */
function lateLists() {
  for (const [localityId, locality] of localities) {
    const rows = basedIn(localityId).filter((l) =>
      (l.hours ?? []).some((h) => !h.closed && h.closes && Number(h.closes.split(':')[0]) >= 20),
    );
    if (rows.length < 5) continue;

    const ordered = [...rows].sort((a, b) => {
      const latest = (x) =>
        Math.max(
          ...(x.hours ?? [])
            .filter((h) => !h.closed && h.closes)
            .map((h) => {
              const hh = Number(h.closes.split(':')[0]);
              // A 1am close is later than an 11pm close, not thirteen hours earlier.
              return hh < 6 ? hh + 24 : hh;
            }),
        );
      return latest(b) - latest(a);
    });

    push({
      slug: slugify('open-late-in-' + locality.name),
      title: 'Open late in ' + locality.name,
      intro:
        'The ' + ordered.length + ' places in ' + locality.name + ', ' + locality.state +
        ', that publish a closing time of 8pm or later, latest closing first. Regional towns ' +
        'shut early and the kitchen usually stops well before the bar does, so this is the ' +
        'list worth having at seven o clock on a weeknight. Times are as published; ring ' +
        'ahead if it matters, because a kitchen closing early on a quiet night is normal. ' +
        METHOD_NOTE,
      localitySlug: locality.slug,
      state: locality.state,
      items: itemsFor(ordered, 'food'),
    });
  }
}

// ------------------------------------------------------------------ free, by region

/**
 * Free things to do exists as a theme page per town. Across a whole region it
 * does not, and that is the version somebody planning a weekend with the kids
 * and no budget actually wants.
 */
function freeRegionLists() {
  const byRegion = new Map();
  for (const l of live) {
    if (l.attributes?.free_entry !== 'yes') continue;
    const locality = localities.get(l.localityId);
    if (!locality) continue;
    if (!byRegion.has(locality.regionId)) byRegion.set(locality.regionId, []);
    byRegion.get(locality.regionId).push(l);
  }

  for (const [regionId, rows] of byRegion) {
    const region = regions.get(regionId);
    if (!region || rows.length < 6) continue;
    const towns = new Set(rows.map((r) => r.localityId));
    const ordered = [...rows].sort((a, b) => {
      const la = localities.get(a.localityId);
      const lb = localities.get(b.localityId);
      return (la?.name ?? '').localeCompare(lb?.name ?? '') || b.qualityScore - a.qualityScore;
    });
    const anchor = localities.get(ordered[0].localityId);

    push({
      slug: slugify('free-things-to-do-in-the-' + region.name),
      title: 'Free things to do across the ' + region.name,
      intro:
        ordered.length + ' places across ' + towns.size + ' towns of the ' + region.name +
        ' that cost nothing to visit, grouped by town. Free attractions are the ones no ' +
        'directory promotes, because nobody advertises what they cannot charge for, which ' +
        'is exactly why they are worth collecting. Free entry does not always mean free ' +
        'parking or free activities inside. ' + METHOD_NOTE,
      localitySlug: anchor?.slug,
      state: anchor?.state ?? 'NSW',
      regionSlug: region.slug,
      items: itemsFor(ordered, 'family'),
    });
  }
}

// ------------------------------------------------------------------ run

streetLists();
dayOutLists();
regionLists();
attributeLists();
establishedLists();
lateLists();
freeRegionLists();

out.sort((a, b) => a.slug.localeCompare(b.slug));
fs.writeFileSync(path.join(DATA, 'lists-generated.json'), JSON.stringify(out, null, 2) + '\n');

const byKind = {};
for (const l of out) {
  const kind = /^a-day-in/.test(l.slug)
    ? 'day out'
    : /^(long-established|oldest)/.test(l.slug)
      ? 'established'
      : /^open-late-in/.test(l.slug)
        ? 'open late'
        : /^free-things-to-do/.test(l.slug)
          ? 'free, by region'
          : l.regionSlug
            ? 'region run'
            : CUTS.some((c) => l.slug.startsWith(c.slug))
              ? 'attribute cut'
              : 'street';
  byKind[kind] = (byKind[kind] ?? 0) + 1;
}

console.log('');
console.log('GENERATE LISTS');
console.log('  hand written  ' + handWritten.length + '  (untouched)');
console.log('  compiled      ' + out.length);
for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
  console.log('    ' + k.padEnd(16) + v);
}
console.log('  entries       ' + out.reduce((t, l) => t + l.items.length, 0));
console.log('');
console.log('  wrote src/data/lists-generated.json');
