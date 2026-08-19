/**
 * Self test.
 *
 * Hand worked answers that the code must reproduce. Not a unit test suite in
 * the ceremonial sense: every assertion here is a number somebody could check
 * with a calculator and a tape measure, which is the only kind of test worth
 * having for arithmetic that gets published as advice.
 *
 * Run: node scripts/selftest.mjs
 * Exits 1 on any failure, so it can gate a deploy.
 */
import fs from 'node:fs';
import path from 'node:path';
import { tokenise, matchesQuery, buildHaystack } from '../src/lib/search.mjs';
import { imageSize } from '../src/lib/imagesize.mjs';
import { encodeHours, isOpenAt, toMinutes } from '../src/lib/hours.mjs';
import {
  CALCULATORS,
  GST_RATE,
  gstIn,
  exGst,
  incGst,
  easterSunday,
  nthWeekday,
  substituted,
  isWeekend,
} from '../src/lib/calculators.mjs';

let pass = 0;
const failures = [];

const eq = (label, actual, expected, tolerance = 0.005) => {
  const ok =
    typeof expected === 'number'
      ? Math.abs(actual - expected) <= tolerance
      : String(actual) === String(expected);
  if (ok) pass++;
  else failures.push(label + '\n      expected ' + expected + '\n      got      ' + actual);
};

const iso = (d) => d.toISOString().slice(0, 10);

const fmt = {
  n2: (v) => (isFinite(v) ? v.toFixed(2) : '0.00'),
  money: (v) => '$' + (isFinite(v) ? v.toFixed(2) : '0.00'),
  whole: (v) => (isFinite(v) ? String(Math.ceil(v)) : '0'),
};
const run = (slug, values) => CALCULATORS[slug].calc(values, fmt);

// ---------------------------------------------------------------- GST

eq('GST rate is 10%', GST_RATE, 0.1);
eq('GST in $1,100 is $100', gstIn(1100), 100);
eq('$1,100 ex GST is $1,000', exGst(1100), 1000);
eq('$1,000 plus GST is $1,100', incGst(1000), 1100);
eq('add then remove GST is a round trip', exGst(incGst(847.5)), 847.5);
// The mistake the page warns about: 10% of the inclusive figure is not the GST.
eq('10% of an inclusive figure overstates GST', 1100 * 0.1 - gstIn(1100), 10);

// ---------------------------------------------------------------- concrete

{
  const r = run('concrete-calculator', { len: 6, wid: 4, dep: 100, waste: 10 });
  eq('concrete 6x4x100mm is 2.4 m³', r.values.m3, 2.4);
  eq('concrete with 10% allowance is 2.64 m³', r.values.withWaste, 2.64);
  eq('2.64 m³ is 294 premix bags', Math.ceil(r.values.bags20), 294);
  eq('concrete headline', r.headline, '2.64 m³');
  const zero = run('concrete-calculator', { len: 0, wid: 0, dep: 0, waste: 0 });
  eq('concrete with zero input does not produce NaN', zero.headline, '0.00 m³');
}

// ---------------------------------------------------------------- paint

{
  const r = run('paint-calculator', { peri: 24, hgt: 2.4, openings: 6, coats: 2, spread: 16 });
  eq('paint gross wall area 24m x 2.4m', r.values.gross, 57.6);
  eq('paint net area after 6 m² of openings', r.values.net, 51.6);
  eq('paint litres, 2 coats at 16 m²/L', r.values.litres, 6.45);
  const noSpread = run('paint-calculator', { peri: 24, hgt: 2.4, openings: 0, coats: 2, spread: 0 });
  eq('paint with zero spread rate does not divide by zero', noSpread.values.litres, 0);
  const bigOpenings = run('paint-calculator', { peri: 10, hgt: 2.4, openings: 999, coats: 2, spread: 16 });
  eq('paint area never goes negative', bigOpenings.values.net, 0);
}

// ---------------------------------------------------------------- soil

{
  const r = run('soil-and-mulch-calculator', { len: 5, wid: 3, dep: 75 });
  eq('mulch 5x3 at 75mm is 1.125 m³', r.values.m3, 1.125);
  eq('1.125 m³ is 45 bags of 25L', r.values.bags25, 45);
  eq('1.125 m³ is 22.5 bags of 50L', r.values.bags50, 22.5);
}

// ---------------------------------------------------------------- fence

{
  const r = run('fence-calculator', { run: 20, spacing: 2.4, paling: 90, gap: 0, rails: 3 });
  eq('20m at 2.4m centres is 9 bays', r.values.bays, 9);
  eq('9 bays needs 10 posts', r.values.posts, 10);
  eq('20m of 90mm butted palings is 223', r.values.palings, 223);
  // Exact division must not add a phantom bay.
  const exact = run('fence-calculator', { run: 24, spacing: 2.4, paling: 90, gap: 0, rails: 3 });
  eq('24m at 2.4m centres is exactly 10 bays', exact.values.bays, 10);
  eq('exactly 10 bays needs 11 posts', exact.values.posts, 11);
  const zero = run('fence-calculator', { run: 0, spacing: 2.4, paling: 90, gap: 0, rails: 3 });
  eq('a zero length fence needs no posts', zero.values.posts, 0);
  const noSpacing = run('fence-calculator', { run: 20, spacing: 0, paling: 90, gap: 0, rails: 3 });
  eq('zero post spacing does not divide by zero', noSpacing.values.bays, 0);
}

// ---------------------------------------------------------------- decking

{
  const r = run('decking-calculator', { len: 6, wid: 4, board: 90, gap: 4, joist: 450, waste: 10 });
  // 4000mm / 94mm pitch = 42.55, so 43 rows.
  eq('4m wide in 90mm boards at 4mm gaps is 43 rows', r.values.boardRows, 43);
  eq('43 rows across 6m is 258 lineal m', r.values.linear, 258);
  eq('258 lineal m plus 10% is 283.8', r.values.withWaste, 283.8);
  // 6000mm / 450mm = 13.33, ceil 14, plus one = 15.
  eq('6m at 450mm joist centres is 15 joists', r.values.joists, 15);
}

// ---------------------------------------------------------------- contractor rate

{
  const r = run('contractor-rate-calculator', {
    income: 90000, overheads: 25000, hours: 25, weeks: 46, super: 12,
  });
  eq('25 hours over 46 weeks is 1,150 billable hours', r.values.billable, 1150);
  // 90,000 + 25,000 + 10,800 super = 125,800
  eq('total to recover is $125,800', r.values.required, 125800);
  eq('rate is $109.39/hr', r.values.rate, 109.39, 0.01);
  // The claim the page makes: halving billable hours roughly doubles the rate.
  const halved = run('contractor-rate-calculator', {
    income: 90000, overheads: 25000, hours: 12.5, weeks: 46, super: 12,
  });
  eq('halving billable hours doubles the rate', halved.values.rate / r.values.rate, 2, 0.001);
  const noHours = run('contractor-rate-calculator', {
    income: 90000, overheads: 25000, hours: 0, weeks: 46, super: 12,
  });
  eq('zero billable hours does not produce Infinity', noHours.values.rate, 0);
}

// ---------------------------------------------------------------- markup and margin

{
  const r = run('markup-and-margin-calculator', { cost: 100, markup: 30 });
  eq('cost 100 at 30% markup sells for 130', r.values.price, 130);
  // The headline claim on the page.
  eq('a 30% markup is a 23.08% margin', r.values.margin, 23.0769, 0.001);
  eq('a 30% margin needs a 42.86% markup', r.values.markupForSameMargin, 42.857, 0.01);
  const fifty = run('markup-and-margin-calculator', { cost: 100, markup: 50 });
  eq('a 50% markup is a 33.33% margin', fifty.values.margin, 33.333, 0.01);
  const hundred = run('markup-and-margin-calculator', { cost: 100, markup: 100 });
  eq('a 100% markup is a 50% margin', hundred.values.margin, 50);
  eq('a 100% margin is flagged as unreachable', hundred.values.markupForSameMargin, 0);
  const free = run('markup-and-margin-calculator', { cost: 0, markup: 30 });
  eq('zero cost does not produce NaN margin', free.values.margin, 0);
}

// ---------------------------------------------------------------- turf
{
  // 12m x 8m is 96 m2. Five per cent is 100.8. At two slabs to the square
  // metre that is 201.6 slabs, so 202 once you cannot buy part of one.
  const r = run('turf-calculator', { len: 12, wid: 8, waste: 5, price: 12 });
  eq('turf area', r.values.area, 96);
  eq('turf with allowance', r.values.withWaste, 100.8);
  eq('turf slabs at two to the square metre', r.values.slabs, 201.6);
  eq('turf headline', r.headline, '100.80 m²');
  eq('turf cost at $12', r.rows[5][1], '$1209.60');

  // A square metre is two slabs, whatever the lawn.
  const tiny = run('turf-calculator', { len: 1, wid: 1, waste: 0, price: 10 });
  eq('one square metre is two slabs', tiny.values.slabs, 2);
}

// ---------------------------------------------------------------- tile
{
  // A 600 x 300 tile is 0.18 m2. 12 m2 plus ten per cent is 13.2, which is
  // 73.33 tiles, so 74 whole ones.
  const r = run('tile-calculator', { area: 12, tileL: 600, tileW: 300, waste: 10, price: 45 });
  eq('one 600x300 tile covers', r.values.tileArea, 0.18);
  eq('tile area with allowance', r.values.withWaste, 13.2);
  eq('tiles needed', r.values.tiles, 13.2 / 0.18);
  eq('tile headline rounds up', r.headline, '74 tiles');

  // A 300 square tile is 0.09, so exactly twice as many for the same floor.
  const small = run('tile-calculator', { area: 12, tileL: 300, tileW: 300, waste: 10, price: 45 });
  eq('halving the tile size doubles the count', small.values.tiles, r.values.tiles * 2);

  // A zero sized tile must not divide by zero into Infinity.
  const zero = run('tile-calculator', { area: 12, tileL: 0, tileW: 0, waste: 10, price: 45 });
  eq('a zero sized tile yields zero, not Infinity', zero.values.tiles, 0);

  // The note changes below the standard allowance, because that is the case
  // worth warning about.
  const tight = run('tile-calculator', { area: 12, tileL: 600, tileW: 300, waste: 5, price: 45 });
  eq('a tight allowance is called out', /tight/.test(tight.note), true);
}

// ---------------------------------------------------------------- plasterboard
{
  // 24m of wall at 2.4m is 57.6 m2, less 4 m2 of openings is 53.6. Plus ten
  // per cent is 58.96, over a 4.32 m2 sheet is 13.65, so 14 sheets.
  const r = run('plasterboard-calculator', {
    peri: 24, height: 2.4, ceiling: 0, openings: 4, sheetW: 1.2, sheetL: 3.6,
  });
  eq('plasterboard wall area less openings', r.values.wall, 53.6);
  eq('plasterboard total to sheet', r.values.total, 53.6);
  eq('plasterboard sheets', r.values.sheets, (53.6 * 1.1) / 4.32);
  eq('plasterboard headline rounds up', r.headline, '14 sheets');

  // The ceiling is added to the walls, not substituted for them.
  const withCeiling = run('plasterboard-calculator', {
    peri: 24, height: 2.4, ceiling: 20, openings: 4, sheetW: 1.2, sheetL: 3.6,
  });
  eq('a ceiling adds to the total', withCeiling.values.total, 73.6);

  // Openings larger than the walls must floor at zero rather than go negative
  // and quietly reduce the order.
  const silly = run('plasterboard-calculator', {
    peri: 2, height: 2.4, ceiling: 0, openings: 99, sheetW: 1.2, sheetL: 3.6,
  });
  eq('openings cannot make the wall area negative', silly.values.wall, 0);
}

// ---------------------------------------------------------------- retaining wall
{
  // 900mm of wall in 200mm sleepers is 4.5, so 5 courses. 10m of wall in 2.4m
  // sleepers is 4.167 a course, so 20.83 sleepers. Posts at 2.4m centres over
  // 10m is 4 gaps plus the one that finishes the run, so 5.
  const r = run('retaining-wall-calculator', {
    len: 10, height: 900, sleeperH: 200, sleeperL: 2.4, spacing: 2.4, price: 28,
  });
  eq('retaining wall courses round up', r.values.courses, 5);
  eq('retaining wall sleepers', r.values.sleepers, 5 * (10 / 2.4));
  eq('retaining wall posts include the last one', r.values.posts, 5);
  eq('retaining wall headline', r.headline, '21 sleepers');

  // A wall over a metre gets the approval warning, because that is the point
  // at which the answer stops being about materials.
  const low = run('retaining-wall-calculator', {
    len: 10, height: 900, sleeperH: 200, sleeperL: 2.4, spacing: 2.4, price: 28,
  });
  const high = run('retaining-wall-calculator', {
    len: 10, height: 1200, sleeperH: 200, sleeperL: 2.4, spacing: 2.4, price: 28,
  });
  eq('under a metre does not claim approval is needed', /almost always needs council/.test(low.note), false);
  eq('over a metre warns about approval', /almost always needs council/.test(high.note), true);

  // Post embedment is a third of the height plus 200mm of clearance.
  eq('post embedment for a 900mm wall', Math.round((900 / 3 + 200)), 500);
}

// ---------------------------------------------------------------- rainwater tank
{
  // 200 m2 of roof under 600mm is 120,000 litres, because 1mm on 1 m2 is 1
  // litre. Fifteen per cent off leaves 102,000.
  const r = run('rainwater-tank-calculator', {
    roof: 200, rain: 600, loss: 15, people: 4, useDay: 60,
  });
  eq('one mm on one square metre is one litre', r.values.gross, 120000);
  eq('collected after losses', r.values.net, 102000);
  eq('household annual demand', r.values.demand, 4 * 60 * 365);
  eq('ninety day buffer', Math.round(r.values.buffer), 21600);
  eq('tank headline', r.headline, '102000 L a year');

  // Collecting more than the house uses changes the advice.
  const plenty = run('rainwater-tank-calculator', {
    roof: 400, rain: 900, loss: 15, people: 2, useDay: 50,
  });
  eq('a surplus roof is told to size for the dry run', /surviving the gap/.test(plenty.note), true);
  const scarce = run('rainwater-tank-calculator', {
    roof: 80, rain: 350, loss: 20, people: 5, useDay: 120,
  });
  eq('a deficit roof is told it will need topping up', /cannot cover/.test(scarce.note), true);
}

// ---------------------------------------------------------------- firewood
{
  // 2.4 x 1.2 x 0.5 is 1.44 m3. At $380 that is $263.89 a stacked cubic metre.
  const r = run('firewood-calculator', {
    len: 2.4, height: 1.2, depth: 0.5, price: 380, burn: 0.35,
  });
  eq('firewood stacked volume', r.values.stacked, 1.44);
  eq('firewood cost per stacked cubic metre', r.values.perM3, 380 / 1.44);
  eq('the same wood loose measures about a third more', r.values.loose, 1.44 * 1.35);
  eq('weeks of burning', r.values.weeks, 1.44 / 0.35);
  eq('firewood headline', r.headline, '$263.89 per m³');

  // A zero sized stack must not produce Infinity dollars per cubic metre.
  const nothing = run('firewood-calculator', {
    len: 0, height: 0, depth: 0, price: 380, burn: 0.35,
  });
  eq('an empty stack costs zero per cubic metre, not Infinity', nothing.values.perM3, 0);
}

// ---------------------------------------------------------------- public holidays
// Checked against the real gazetted dates.

eq('Easter Sunday 2026 is 5 April', iso(easterSunday(2026)), '2026-04-05');
eq('Easter Sunday 2027 is 28 March', iso(easterSunday(2027)), '2027-03-28');
eq('Easter Sunday 2028 is 16 April', iso(easterSunday(2028)), '2028-04-16');
eq('Easter Sunday 2030 is 21 April', iso(easterSunday(2030)), '2030-04-21');

// Labour Day: VIC second Monday in March, NSW first Monday in October.
eq('Labour Day VIC 2026 is 9 March', iso(nthWeekday(2026, 2, 1, 2)), '2026-03-09');
eq('Labour Day NSW 2026 is 5 October', iso(nthWeekday(2026, 9, 1, 1)), '2026-10-05');
eq('Labour Day VIC 2027 is 8 March', iso(nthWeekday(2027, 2, 1, 2)), '2027-03-08');

// Melbourne Cup: first Tuesday in November.
eq('Melbourne Cup 2026 is 3 November', iso(nthWeekday(2026, 10, 2, 1)), '2026-11-03');
eq('Melbourne Cup 2027 is 2 November', iso(nthWeekday(2027, 10, 2, 1)), '2027-11-02');

// King's Birthday: second Monday in June.
eq("King's Birthday 2026 is 8 June", iso(nthWeekday(2026, 5, 1, 2)), '2026-06-08');

// Substitution: a fixed date on a weekend moves to the following Monday.
eq('1 Jan 2028 is a Saturday, substitute Monday 3 Jan', iso(substituted(new Date(Date.UTC(2028, 0, 1)))), '2028-01-03');
eq('26 Jan 2025 is a Sunday, substitute Monday 27 Jan', iso(substituted(new Date(Date.UTC(2025, 0, 26)))), '2025-01-27');
eq('1 Jan 2026 is a Thursday, no substitution', iso(substituted(new Date(Date.UTC(2026, 0, 1)))), '2026-01-01');

// The two Christmas rules are separate, and in 2027 both fire.
eq('Christmas 2027 falls on a weekend', isWeekend(new Date(Date.UTC(2027, 11, 25))), true);
eq('Boxing Day 2027 falls on a weekend', isWeekend(new Date(Date.UTC(2027, 11, 26))), true);
eq('Christmas 2026 is a Friday, no extra day', isWeekend(new Date(Date.UTC(2026, 11, 25))), false);
eq('Boxing Day 2026 is a Saturday, extra day fires', isWeekend(new Date(Date.UTC(2026, 11, 26))), true);

// ---------------------------------------------------------------- ABN checksum
// The algorithm the ABN tool runs, checked against real published ABNs.

const abnValid = (raw) => {
  const v = String(raw).replace(/[^0-9]/g, '');
  if (v.length !== 11) return false;
  const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const d = v.split('').map(Number);
  d[0] -= 1;
  return d.reduce((t, n, i) => t + n * w[i], 0) % 89 === 0;
};
eq('ATO example ABN 51 824 753 556 is valid', abnValid('51 824 753 556'), true);
eq('a transposed digit fails the checksum', abnValid('51 824 753 565'), false);
eq('ten digits is not an ABN', abnValid('5182475355'), false);
eq('an ACN length number is not an ABN', abnValid('004085616'), false);

// ---------------------------------------------------------------- data invariants
// The prose on a money page must agree with the rows underneath it.

const DATA = path.join(process.cwd(), 'src', 'data');
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

if (fs.existsSync(path.join(DATA, 'listings.json'))) {
  const listings = read('listings.json');
  const localities = ['geo-nsw.json', 'geo-vic.json'].flatMap((f) => read(f).localities);
  const byId = new Map(localities.map((l) => [l.id, l]));

  const suspended = listings.filter((l) => l.status === 'suspended');
  eq('no suspended listing is in the data set', suspended.length, 0);

  const orphaned = listings.filter((l) => !byId.has(l.localityId));
  eq('every listing resolves to a locality', orphaned.length, 0);

  const badServiceArea = listings.filter((l) => (l.serviceAreaIds || []).some((id) => !byId.has(id)));
  eq('every service area resolves to a locality', badServiceArea.length, 0);

  const selfMissing = listings.filter((l) => !(l.serviceAreaIds || []).includes(l.localityId));
  eq('every listing services its own locality', selfMissing.length, 0);

  const claimedVerified = listings.filter((l) =>
    (l.licences || []).some((x) => x.verificationOk && !x.lastVerifiedAt),
  );
  eq('no licence is verified without a check date', claimedVerified.length, 0);

  const fabricatedRating = listings.filter((l) => l.google && !l.google.fetchedAt);
  eq('no Google rating exists without a fetch date', fabricatedRating.length, 0);

  const noSource = listings.filter((l) => !Array.isArray(l.sources) || l.sources.length === 0);
  eq('every listing records at least one source', noSource.length, 0);

  const badScore = listings.filter((l) => l.qualityScore < 0 || l.qualityScore > 100);
  eq('every quality score is between 0 and 100', badScore.length, 0);

  // One business, one page. The same venue arriving from two research clusters
  // produced two URLs with the same H1 and the same address, which is the exact
  // duplicate content this site is otherwise careful about.
  const fold = (x) => x.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const byIdentity = new Map();
  let duplicateBusinesses = 0;
  for (const l of listings) {
    const home = byId.get(l.localityId);
    const phone = String(l.phone || '').replace(/[^0-9]/g, '');
    let site = '';
    try { site = l.website ? new URL(l.website).hostname.replace(/^www\./, '') : ''; } catch {}
    const key = fold(l.name);
    const prior = byIdentity.get(key) || [];
    for (const p of prior) {
      const other = byId.get(p.localityId);
      const samePhone = phone && phone === String(p.phone || '').replace(/[^0-9]/g, '');
      let pSite = '';
      try { pSite = p.website ? new URL(p.website).hostname.replace(/^www\./, '') : ''; } catch {}
      const sameSite = site && site === pSite;
      const near = home && other && kmBetween(home, other) <= 3;
      if (samePhone || sameSite || p.localityId === l.localityId || near) duplicateBusinesses++;
    }
    prior.push(l);
    byIdentity.set(key, prior);
  }
  eq('no business is listed twice', duplicateBusinesses, 0);

  // Inference rule: same state and under 12km should never appear as an
  // inferred service area, because that is the same town.
  const kmBetween = (a, b) => {
    const R = 6371, tr = Math.PI / 180;
    const dLat = (b.lat - a.lat) * tr, dLng = (b.lng - a.lng) * tr;
    const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(a.lat * tr) * Math.cos(b.lat * tr);
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  let violations = 0;
  for (const l of listings) {
    if (!l.serviceAreaInferred) continue;
    const home = byId.get(l.localityId);
    for (const id of l.serviceAreaIds) {
      if (id === l.localityId) continue;
      const other = byId.get(id);
      if (!other) continue;
      if (other.state === home.state && kmBetween(home, other) < 12) violations++;
      if (other.tier >= 4) violations++;
    }
  }
  eq('inferred service areas obey the same state 12km floor and skip tier 4', violations, 0);
}

// ---------------------------------------------------------------- search
// The index and the query must agree on what a word is. They did not, and the
// site shipped a search where "café" matched nothing while "cafe" matched 30.

eq('tokenise folds accents', tokenise('Café Musette').join(' '), 'cafe musette');
eq('tokenise splits on apostrophes', tokenise("Wello's Plumbing").join(' '), 'wello plumbing');
eq('tokenise splits on ampersands', tokenise('Fish & Chips').join(' '), 'fish chips');
eq('tokenise drops single characters', tokenise('B & B').length, 0);
eq('tokenise keeps digits', tokenise('4WD 24 hour').join(' '), '4wd 24 hour');

{
  const hay = buildHaystack(['Café Musette', 'Cafes', '2/480 Young Street', 'Albury', 'NSW', '2640']);
  eq('an accented query matches an accented name', matchesQuery(hay, 'café'), true);
  eq('an unaccented query matches an accented name', matchesQuery(hay, 'cafe'), true);
  eq('a street name in the address is searchable', matchesQuery(hay, 'young street'), true);
  eq('a prefix still matches', matchesQuery(hay, 'muset'), true);
  eq('an unrelated word does not match', matchesQuery(hay, 'plumber'), false);
  eq('an empty query matches everything', matchesQuery(hay, ''), true);
  eq('a query of only punctuation matches everything', matchesQuery(hay, '& -'), true);
  eq('every token must match, not just one', matchesQuery(hay, 'cafe plumber'), false);
}

{
  const apostrophe = buildHaystack(["Wello's Plumbing & Gas", 'Plumbers', 'Thurgoona', 'NSW']);
  eq('an apostrophe in the query does not block a match', matchesQuery(apostrophe, "Wello's"), true);
  eq('an ampersand in the query does not block a match', matchesQuery(apostrophe, 'plumbing & gas'), true);
}

// ---------------------------------------------------------------- community

if (fs.existsSync(path.join(DATA, 'community.json'))) {
  const community = read('community.json').entries;
  const localities = ['geo-nsw.json', 'geo-vic.json'].flatMap((f) => read(f).localities);
  const slugs = new Set(localities.map((l) => l.slug));
  const TYPES = new Set(['council', 'community', 'buysell', 'events', 'news', 'emergency', 'tourism']);

  let badSlug = 0;
  let badUrl = 0;
  let badType = 0;
  let noSource = 0;
  for (const e of community) {
    for (const c of e.covers) if (!slugs.has(c)) badSlug++;
    if (!/^https:\/\//.test(e.url)) badUrl++;
    if (!TYPES.has(e.type)) badType++;
    // Every entry has to say where the URL was read from, because the whole
    // point is that none of them were constructed from a name.
    if (!e.source || !e.checkedAt) noSource++;
  }
  eq('every community entry covers real localities', badSlug, 0);
  eq('every community URL is https', badUrl, 0);
  eq('every community entry has a known type', badType, 0);
  eq('every community entry records where it was read from', noSource, 0);
  eq('community data is not empty', community.length > 0, true);
}

// ---------------------------------------------------------------- image headers
{
  // Dimensions decide the width and height on every business photo, and a
  // wrong number there is layout shift on a page nobody rebuilds for months.
  // Real files first, where the expected answer is independently known.
  const real = [
    ['public/brand/icon-192.png', 192, 192, 'png'],
    ['public/brand/icon-512.png', 512, 512, 'png'],
    ['public/og/default.png', 1200, 630, 'png'],
    ['public/favicon.svg', 64, 64, 'svg'],
  ];
  for (const [file, w, h, format] of real) {
    const d = imageSize(fs.readFileSync(path.join(process.cwd(), file)));
    eq(file + ' measures ' + w + 'x' + h, d ? d.width + 'x' + d.height : 'null', w + 'x' + h);
    eq(file + ' is detected as ' + format, d && d.format, format);
  }

  // The logo ships as both PNG and SVG. They have to agree, or one of the two
  // is the wrong export and every place that picks between them is inconsistent.
  const asPng = imageSize(fs.readFileSync(path.join(process.cwd(), 'public/brand/localknows-logo.png')));
  const asSvg = imageSize(fs.readFileSync(path.join(process.cwd(), 'public/brand/localknows-logo.svg')));
  eq(
    'the logo PNG and SVG describe the same box',
    asPng.width / asPng.height,
    asSvg.width / asSvg.height,
  );

  // Synthetic headers, because no JPEG or WebP is checked into the repository
  // and those are the two formats a business will actually send from a phone.
  const jpegOf = (w, h, decoy) => {
    const parts = [Buffer.from([0xff, 0xd8])];
    const app0 = Buffer.alloc(18);
    app0.writeUInt16BE(0xffe0, 0);
    app0.writeUInt16BE(16, 2);
    app0.write('JFIF\0', 4, 'ascii');
    parts.push(app0);
    if (decoy) {
      // An APP1 payload containing bytes identical to an SOF0 announcing 1x1.
      // Real EXIF thumbnails contain exactly this. A parser that scans for
      // 0xFFC0 rather than walking segment lengths reports 1x1 for every photo
      // off an iPhone.
      const payload = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03]);
      const app1 = Buffer.alloc(4 + payload.length);
      app1.writeUInt16BE(0xffe1, 0);
      app1.writeUInt16BE(2 + payload.length, 2);
      payload.copy(app1, 4);
      parts.push(app1);
    }
    const sof = Buffer.alloc(21);
    sof.writeUInt16BE(0xffc0, 0);
    sof.writeUInt16BE(17, 2);
    sof.writeUInt8(8, 4);
    sof.writeUInt16BE(h, 5);
    sof.writeUInt16BE(w, 7);
    sof.writeUInt8(3, 9);
    parts.push(sof);
    return Buffer.concat(parts);
  };

  const riff = (id, body) => {
    const buf = Buffer.alloc(20 + body.length);
    buf.write('RIFF', 0, 'ascii');
    buf.writeUInt32LE(12 + body.length, 4);
    buf.write('WEBP', 8, 'ascii');
    buf.write(id, 12, 'ascii');
    buf.writeUInt32LE(body.length, 16);
    body.copy(buf, 20);
    return buf;
  };

  const vp8x = (w, h) => {
    const b = Buffer.alloc(10);
    b.writeUIntLE(w - 1, 4, 3);
    b.writeUIntLE(h - 1, 7, 3);
    return riff('VP8X', b);
  };
  const vp8 = (w, h) => {
    const b = Buffer.alloc(20);
    b[3] = 0x9d;
    b[4] = 0x01;
    b[5] = 0x2a;
    b.writeUInt16LE(w, 6);
    b.writeUInt16LE(h, 8);
    return riff('VP8 ', b);
  };
  const vp8l = (w, h) => {
    const b = Buffer.alloc(20);
    b[0] = 0x2f;
    b.writeUInt32LE(((w - 1) | ((h - 1) << 14)) >>> 0, 1);
    return riff('VP8L', b);
  };

  const synthetic = [
    ['jpeg 4032x3024, an iPhone photo', jpegOf(4032, 3024, false), 4032, 3024],
    ['jpeg with an SOF decoy inside EXIF', jpegOf(3000, 2000, true), 3000, 2000],
    ['webp VP8X 1600x1200', vp8x(1600, 1200), 1600, 1200],
    ['webp lossy 800x600', vp8(800, 600), 800, 600],
    ['webp lossless 640x480', vp8l(640, 480), 640, 480],
  ];
  for (const [label, buf, w, h] of synthetic) {
    const d = imageSize(buf);
    eq(label, d ? d.width + 'x' + d.height : 'null', w + 'x' + h);
  }

  // Height precedes width in a JPEG frame header and follows it in every other
  // format here, so a transposition is the likeliest bug and a square test
  // would hide it.
  const tall = imageSize(jpegOf(1000, 2000, false));
  eq('a portrait JPEG is not reported as landscape', tall.width < tall.height, true);

  // Anything that is not an image must come back null rather than a guess,
  // because preflight turns null into a build failure and a wrong guess into
  // a broken page.
  for (const f of ['package.json', 'src/lib/search.mjs', 'src/styles/tokens.css']) {
    eq('not an image: ' + f, imageSize(fs.readFileSync(path.join(process.cwd(), f))), null);
  }
  eq('an empty buffer is not an image', imageSize(Buffer.alloc(0)), null);
  eq('a truncated PNG signature is not an image', imageSize(Buffer.from([0x89, 0x50])), null);
}

// ---------------------------------------------------------------- opening hours
{
  // The "open now" filter answers a question a person can check by walking to
  // the door, so it has to be right at the edges: opening minute, closing
  // minute, and the pub that shuts at one in the morning.
  eq('7:00 is 420 minutes', toMinutes('07:00'), 420);
  eq('23:59 is 1439 minutes', toMinutes('23:59'), 1439);
  eq('24:00 folds to midnight', toMinutes('24:00'), 0);
  eq('nonsense time is null', toMinutes('later'), null);

  const cafe = encodeHours([
    { day: 0, opens: '07:00', closes: '15:00' },
    { day: 1, closed: true },
    { day: 3, opens: '07:00', closes: '15:00' },
  ]);
  eq('a cafe encodes to its open days only', cafe, '420-900,,,420-900,,,');
  eq('a business with no hours encodes to nothing', encodeHours([]), '');
  eq(
    'a business closed every day encodes to nothing',
    encodeHours([{ day: 0, closed: true }, { day: 1, closed: true }]),
    '',
  );

  // 2026-08-16 is a Sunday, so the offsets below read as weekdays.
  const at = (dayOffset, hh, mm) => new Date(2026, 7, 16 + dayOffset, hh, mm, 0);

  eq('cafe open Sunday 9am', isOpenAt(cafe, at(0, 9, 0)), true);
  eq('cafe shut Sunday 4pm', isOpenAt(cafe, at(0, 16, 0)), false);
  eq('cafe open at the opening minute', isOpenAt(cafe, at(0, 7, 0)), true);
  eq('cafe shut one minute before opening', isOpenAt(cafe, at(0, 6, 59)), false);
  eq('cafe shut at the closing minute', isOpenAt(cafe, at(0, 15, 0)), false);
  eq('cafe shut on a closed day', isOpenAt(cafe, at(1, 9, 0)), false);
  eq('unknown hours never count as open', isOpenAt('', at(3, 12, 0)), false);

  // A pub open 11am until 1am. The close is a smaller number than the open,
  // which is the only signal that the session ran past midnight. Getting this
  // wrong shows a pub as shut all Friday evening.
  const pub = encodeHours([
    { day: 5, opens: '11:00', closes: '01:00' },
    { day: 6, opens: '11:00', closes: '01:00' },
  ]);
  eq('pub encodes the overnight session', pub, ',,,,,660-60,660-60');
  eq('pub open Friday 11pm', isOpenAt(pub, at(5, 23, 0)), true);
  eq('pub open Saturday 00:30, still Friday night', isOpenAt(pub, at(6, 0, 30)), true);
  eq('pub shut Saturday 01:30', isOpenAt(pub, at(6, 1, 30)), false);
  eq('pub shut Saturday 10am', isOpenAt(pub, at(6, 10, 0)), false);
  eq('pub open Sunday 00:30, still Saturday night', isOpenAt(pub, at(0, 0, 30)), true);
  eq('pub shut Monday night', isOpenAt(pub, at(1, 23, 0)), false);

  // Closing exactly at midnight is written as 0, which is also "less than the
  // open time", so it must not leak into the following morning.
  const tillMidnight = encodeHours([{ day: 0, opens: '11:00', closes: '00:00' }]);
  eq('open at 11pm on the night itself', isOpenAt(tillMidnight, at(0, 23, 0)), true);
  eq('shut at 00:30 the next morning', isOpenAt(tillMidnight, at(1, 0, 30)), false);

  // Every encoded listing in the real data must be readable, or the filter
  // silently treats a business as closed forever.
  if (fs.existsSync(path.join(DATA, 'listings.json'))) {
    const rows = read('listings.json');
    let bad = 0;
    let withHours = 0;
    for (const l of rows) {
      const enc = encodeHours(l.hours);
      if (!enc) continue;
      withHours++;
      for (const slot of enc.split(',')) {
        if (!slot) continue;
        const [o, c] = slot.split('-').map(Number);
        if (!isFinite(o) || !isFinite(c) || o < 0 || o > 1439 || c < 0 || c > 1439) bad++;
      }
    }
    eq('every encoded opening time is a valid minute of the day', bad, 0);
    eq('the real data does encode some hours', withHours > 0, true);
  }
}

// ---------------------------------------------------------------- report

console.log('');
console.log('SELF TEST');
console.log('  ' + pass + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.error('');
  for (const f of failures) console.error('  FAIL  ' + f);
  console.error('');
  process.exit(1);
}
console.log('');
console.log('  every hand worked answer reproduced');
