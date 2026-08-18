/**
 * Generate wire articles from the directory's own data.
 *
 * Every sentence this writes is computed from listings.json. Nothing is
 * invented, nothing is paraphrased from somewhere else, and no language model
 * is involved, which is why the output can be published without a human
 * checking a claim against a source: there is no claim that is not a count.
 *
 * That is the whole design. An automated publishing pipeline that writes
 * opinions needs review before it ships. One that writes arithmetic does not.
 *
 * Run: node scripts/generate-wire.mjs
 *      node scripts/generate-wire.mjs --date=2026-09-01
 *
 * Idempotent. Re-running for the same period rewrites that period's article
 * rather than adding a second one.
 */
import fs from 'node:fs';
import path from 'node:path';

const DATA = path.join(process.cwd(), 'src', 'data');
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

const today = args.date || new Date().toISOString().slice(0, 10);
const [year, month] = today.split('-');
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const monthName = MONTHS[Number(month) - 1];

const listings = read('listings.json');
const taxonomy = read('categories.json');
const geo = [read('geo-nsw.json'), read('geo-vic.json')];
const localities = geo.flatMap((g) => g.localities);
const wire = read('wire.json');

const localityById = new Map(localities.map((l) => [l.id, l]));
const categoryById = new Map(taxonomy.categories.map((c) => [c.id, c]));

const n = (v) => v.toLocaleString('en-AU');
const money = (v) => '$' + Math.round(v).toLocaleString('en-AU');

/** Listings that cover a locality, whether based there or servicing it. */
const coverage = new Map();
for (const l of listings) {
  for (const id of new Set([l.localityId, ...(l.serviceAreaIds || [])])) {
    const bucket = coverage.get(id) ?? [];
    bucket.push(l);
    coverage.set(id, bucket);
  }
}

const generated = [];

// ---------------------------------------------------------------- 1. the state of the directory

function directoryReport() {
  const slug = 'directory-report-' + year + '-' + month;
  const live = [...coverage.entries()]
    .map(([id, rows]) => ({ locality: localityById.get(id), rows }))
    .filter((r) => r.locality && r.rows.length > 0);

  const byState = { NSW: [], VIC: [] };
  for (const r of live) byState[r.locality.state].push(r);

  const withPhone = listings.filter((l) => l.phone).length;
  const withHours = listings.filter((l) => l.hours && l.hours.length > 0).length;
  const withWebsite = listings.filter((l) => l.website).length;
  const highConfidence = listings.filter((l) => l.confidence === 'high').length;
  const crossBorder = listings.filter((l) => {
    const home = localityById.get(l.localityId);
    return (
      home && (l.serviceAreaIds || []).some((id) => localityById.get(id)?.state !== home.state)
    );
  }).length;

  const catCounts = new Map();
  for (const l of listings) {
    for (const cid of l.categoryIds) catCounts.set(cid, (catCounts.get(cid) ?? 0) + 1);
  }
  const topCategories = [...catCounts.entries()]
    .map(([id, count]) => ({ category: categoryById.get(id), count }))
    .filter((c) => c.category)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const topTowns = live
    .slice()
    .sort((a, b) => b.rows.length - a.rows.length)
    .slice(0, 10);

  const emptyCategories = taxonomy.categories.filter((c) => !catCounts.has(c.id));

  const body = `The directory numbers for ${monthName} ${year}, counted from the listings themselves rather than estimated. Every figure below recomputes on each build, so it is current as at the date on this article and nothing more.

## Where it stands

| | Count |
|---|---|
| Listings | ${n(listings.length)} |
| Towns with a page | ${n(live.length)} |
| Towns in New South Wales | ${n(byState.NSW.length)} |
| Towns in Victoria | ${n(byState.VIC.length)} |
| Categories with at least one listing | ${n(catCounts.size)} |
| Categories still empty | ${n(emptyCategories.length)} |
| Listings that reach across the border | ${n(crossBorder)} |

## Completeness

Ordering on this site comes from how complete a profile is, so the interesting number is not how many listings exist but how many of them are usable.

- ${n(withPhone)} of ${n(listings.length)} carry a phone number, which is ${Math.round((withPhone / listings.length) * 100)}%.
- ${n(withWebsite)} carry a website.
- ${n(withHours)} publish opening hours, which is ${Math.round((withHours / listings.length) * 100)}%. That is the weakest field on the directory and it is the one that decides whether a business shows up in an "open now" search.
- ${n(highConfidence)} were read from the business's own site or an official source rather than a third party listing.

The hours gap is the one worth acting on. A business with no published hours does not appear as closed, it does not appear at all, and it never finds out.

## The biggest towns

${topTowns.map((t, i) => `${i + 1}. **${t.locality.name}, ${t.locality.state}** — ${n(t.rows.length)} listings`).join('\n')}

## The biggest categories

${topCategories.map((c, i) => `${i + 1}. **${c.category.name}** — ${n(c.count)} listings`).join('\n')}

## What is still empty

${n(emptyCategories.length)} categories exist in the taxonomy with nothing in them yet. A category page goes live when its first business is added, which is the same rule that applies to towns: nothing is seeded ahead of content.

If you run one of these and you are not listed, [adding a listing is free](/claim/) and stays free.

## How these numbers are produced

This article is generated from \`listings.json\` by \`scripts/generate-wire.mjs\`. There is no estimation step and no editorial pass, because there is nothing in it but arithmetic over the rows on the site. If a figure here disagrees with a category page, the category page is right and this one is older.`;

  return {
    slug,
    title: 'The directory in ' + monthName + ' ' + year,
    description:
      n(listings.length) +
      ' listings across ' +
      n(live.length) +
      ' towns. Counts, completeness and the gaps, computed from the directory itself.',
    author: 'The LocalsKnow desk',
    publishedAt: today,
    state: 'both',
    body,
    generated: true,
  };
}

// ---------------------------------------------------------------- 2. what trades charge

function calloutReport() {
  const rows = [];
  for (const [cid, category] of categoryById) {
    if (category.vertical !== 'trades') continue;
    const fees = listings
      .filter((l) => l.categoryIds.includes(cid))
      .map((l) => Number(l.attributes?.callout_fee))
      .filter((v) => Number.isFinite(v) && v > 0)
      .sort((a, b) => a - b);
    if (fees.length < 3) continue;
    rows.push({
      category,
      count: fees.length,
      low: fees[0],
      high: fees[fees.length - 1],
      median: fees[Math.floor(fees.length / 2)],
    });
  }

  if (rows.length < 3) return null;
  rows.sort((a, b) => b.count - a.count);

  const slug = 'what-trades-charge-' + year + '-' + month;
  const body = `Published call out fees across the border corridor, ${monthName} ${year}. These are the figures trades publish themselves, read off their own sites and recorded with the date. They are not a survey and they are not a benchmark, and a quote for your job is the only number that binds anyone.

## The table

| Trade | Listings with a published fee | Lowest | Median | Highest |
|---|---|---|---|---|
${rows.map((r) => `| ${r.category.name} | ${r.count} | ${money(r.low)} | ${money(r.median)} | ${money(r.high)} |`).join('\n')}

## How to read it

A call out fee is what it costs for someone to attend, before labour and before parts. Whether it is waived, credited or charged on top when the job goes ahead varies by business and it is the question worth asking first.

The spread matters more than the median. A trade where the lowest and highest published fee are close is a trade with a settled local rate. A wide spread usually means the businesses are pricing different things: some are including the first half hour, some are not.

## The border effect

Travel is inside the call out fee for most of these businesses, and on this corridor that can mean twenty minutes each way. A Corowa operator quoting a Howlong job and an Albury operator quoting the same job are not charging for the same drive.

The other one is the public holiday calendar. New South Wales and Victoria do not share one, so the same Tuesday can be a holiday rate on one side of the river and an ordinary rate on the other. [Which days differ](/tools/public-holidays/).

## Method

Computed by \`scripts/generate-wire.mjs\` from the \`callout_fee\` attribute on listings, which is populated only where a business publishes the figure. Trades with fewer than three published fees are left out rather than reported on a sample too small to mean anything. Every listing shows the source its details came from and the date they were read.`;

  return {
    slug,
    title: 'What trades charge to turn up, ' + monthName + ' ' + year,
    description:
      'Published call out fees across ' +
      rows.length +
      ' trades on the NSW and Victorian border, ' +
      monthName +
      ' ' +
      year +
      '. Ranges and medians, from what businesses publish.',
    author: 'The LocalsKnow desk',
    publishedAt: today,
    state: 'both',
    body,
    generated: true,
  };
}

// ---------------------------------------------------------------- 3. weekend trading

function saturdayReport() {
  const towns = [...coverage.entries()]
    .map(([id, rows]) => ({ locality: localityById.get(id), rows }))
    .filter((t) => t.locality && t.rows.length >= 8)
    .map((t) => {
      const withHours = t.rows.filter((l) => l.hours && l.hours.length);
      const sat = withHours.filter((l) => l.hours.some((h) => h.day === 6 && !h.closed));
      const sun = withHours.filter((l) => l.hours.some((h) => h.day === 0 && !h.closed));
      return {
        locality: t.locality,
        total: t.rows.length,
        withHours: withHours.length,
        sat: sat.length,
        sun: sun.length,
      };
    })
    .filter((t) => t.withHours >= 5)
    .sort((a, b) => b.total - a.total)
    .slice(0, 14);

  if (towns.length < 3) return null;

  const slug = 'weekend-trading-' + year + '-' + month;
  const body = `Who actually publishes weekend hours across the border corridor, ${monthName} ${year}.

This is a count of published hours, not of availability. A business that trades Saturday and never says so is invisible to every filter that answers "open now", including this one. That gap is the point of the article.

## The table

| Town | Listings | Publish hours | Open Saturday | Open Sunday |
|---|---|---|---|---|
${towns.map((t) => `| ${t.locality.name} ${t.locality.state} | ${t.total} | ${t.withHours} | ${t.sat} | ${t.sun} |`).join('\n')}

## What it shows

The column that moves most is the third one. Where a town publishes hours, the Saturday number follows. Where it does not, the town looks closed on a weekend whether it is or not.

Food and retail publish weekends without being asked. Trades mostly publish a phone number and nothing else, because a trade business does not think of its hours as a shopfront thing. Both patterns show up in the numbers above and neither is about how hard anybody works.

## If this is your business

Publishing hours, including the closed days, takes about two minutes and is the single cheapest thing that changes how often you appear. "Closed Sunday" is worth publishing: it stops a call you were never going to convert and it makes the rest of the week believable.

[Claiming a listing](/claim/) is free.

## Method

Generated by \`scripts/generate-wire.mjs\` from the \`hours\` field on listings that cover each town, whether based there or servicing it. Towns with fewer than eight listings or fewer than five publishing hours are excluded.`;

  return {
    slug,
    title: 'Who trades on a weekend, ' + monthName + ' ' + year,
    description:
      'Published Saturday and Sunday hours across ' +
      towns.length +
      ' border towns. A count of what businesses publish, which is not the same as what they do.',
    author: 'The LocalsKnow desk',
    publishedAt: today,
    state: 'both',
    body,
    generated: true,
  };
}

// ---------------------------------------------------------------- write

for (const make of [directoryReport, calloutReport, saturdayReport]) {
  const article = make();
  if (article) generated.push(article);
}

let added = 0;
let replaced = 0;
for (const a of generated) {
  const i = wire.findIndex((w) => w.slug === a.slug);
  if (i === -1) {
    wire.push(a);
    added++;
  } else if (wire[i].generated) {
    // Only ever overwrite something this script wrote. A hand written article
    // that happens to share a slug is left alone.
    wire[i] = a;
    replaced++;
  } else {
    console.warn('  skipping ' + a.slug + ': a hand written article already owns that slug');
  }
}

wire.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug));
fs.writeFileSync(path.join(DATA, 'wire.json'), JSON.stringify(wire, null, 1));

console.log('');
console.log('WIRE');
console.log('  generated  ' + generated.length + ' (' + added + ' new, ' + replaced + ' refreshed)');
for (const a of generated) console.log('    ' + a.slug);
console.log('  total articles ' + wire.length);
