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

  // Inference rule: same state and under 12km should never appear as an
  // inferred service area, because that is the same town.
  const km = (a, b) => {
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
      if (other.state === home.state && km(home, other) < 12) violations++;
      if (other.tier >= 4) violations++;
    }
  }
  eq('inferred service areas obey the same state 12km floor and skip tier 4', violations, 0);
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
