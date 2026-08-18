/**
 * The calculator formulas.
 *
 * Plain JavaScript, in one module, for one reason: these were inline browser
 * scripts inside an .astro file, which meant nothing could import them and
 * nothing could test them. A formula nobody can run in isolation is a formula
 * nobody has checked.
 *
 * CalcWidget.astro serialises these into the page with `.toString()`, and
 * scripts/selftest.mjs imports the same objects and asserts them against hand
 * worked answers. One definition, two consumers, no chance of the page and the
 * test agreeing on different arithmetic.
 *
 * Every calc takes (values, fmt) so it carries no dependency on its
 * environment. `fmt` supplies n2, money and whole.
 */

/** Australian GST. One rate, one place. */
export const GST_RATE = 0.1;

export const CALCULATORS = {
  'concrete-calculator': {
    headlineLabel: 'Concrete needed',
    fields: [
      { id: 'len', label: 'Length', unit: 'm', value: 6, step: 0.1 },
      { id: 'wid', label: 'Width', unit: 'm', value: 4, step: 0.1 },
      { id: 'dep', label: 'Depth', unit: 'mm', value: 100, step: 5 },
      { id: 'waste', label: 'Allowance for spillage and uneven ground', unit: '%', value: 10, step: 1 },
    ],
    calc: function (v, f) {
      var m3 = v.len * v.wid * (v.dep / 1000);
      var withWaste = m3 * (1 + v.waste / 100);
      // A 20kg bag of premix yields about 9 litres of wet concrete, so roughly
      // 111 bags to the cubic metre. Premix stops making sense past about a
      // third of a cubic metre.
      var bags20 = withWaste / 0.009;
      return {
        headline: f.n2(withWaste) + ' m³',
        rows: [
          ['Slab volume', f.n2(m3) + ' m³', v.len + 'm x ' + v.wid + 'm x ' + v.dep + 'mm'],
          ['Allowance', f.n2(withWaste - m3) + ' m³', v.waste + '%'],
          ['Order this much', f.n2(withWaste) + ' m³', 'Trucks are usually sold in 0.2 m³ steps'],
          ['Or 20kg premix bags', f.whole(bags20), 'About 111 bags to the cubic metre'],
          ['Surface area', f.n2(v.len * v.wid) + ' m²', ''],
        ],
        values: { m3: m3, withWaste: withWaste, bags20: bags20 },
        note:
          withWaste > 0.4
            ? 'At ' + f.n2(withWaste) + ' m³ this is a truck job. Premix bags are for pours under about a third of a cubic metre; past that the bag count and the mixing time stop making sense. Ring a supplier with the volume and they will tell you the minimum load.'
            : 'At ' + f.n2(withWaste) + ' m³ this is small enough for bagged premix. Mix to the bag instructions rather than by eye, because the water ratio is what decides the strength.',
      };
    },
  },

  'paint-calculator': {
    headlineLabel: 'Paint needed',
    fields: [
      { id: 'peri', label: 'Total wall length', unit: 'm', value: 24, step: 0.5 },
      { id: 'hgt', label: 'Wall height', unit: 'm', value: 2.4, step: 0.1 },
      { id: 'openings', label: 'Doors and windows to deduct', unit: 'm²', value: 6, step: 0.5 },
      { id: 'coats', label: 'Coats', unit: '', value: 2, step: 1 },
      { id: 'spread', label: 'Spread rate on the tin', unit: 'm²/L', value: 16, step: 1 },
    ],
    calc: function (v, f) {
      var gross = v.peri * v.hgt;
      var net = Math.max(0, gross - v.openings);
      var litres = v.spread > 0 ? (net * v.coats) / v.spread : 0;
      return {
        headline: f.n2(litres) + ' L',
        rows: [
          ['Wall area', f.n2(gross) + ' m²', v.peri + 'm of wall at ' + v.hgt + 'm'],
          ['Less openings', '-' + f.n2(v.openings) + ' m²', 'Doors and windows'],
          ['Area to paint', f.n2(net) + ' m²', ''],
          ['Across ' + v.coats + (v.coats === 1 ? ' coat' : ' coats'), f.n2(net * v.coats) + ' m²', ''],
          ['Paint required', f.n2(litres) + ' L', 'At ' + v.spread + ' m² per litre'],
          ['Buy', f.whole(litres / 4) + ' x 4L', 'Rounded up'],
        ],
        values: { gross: gross, net: net, litres: litres },
        note:
          'Spread rate is on the tin and it varies a lot: 16 m² per litre is typical for a topcoat on a sealed wall, and bare plasterboard, render or a dark colour going lighter will all take more. Sealer or undercoat is extra again and is not counted here.',
      };
    },
  },

  'soil-and-mulch-calculator': {
    headlineLabel: 'Volume needed',
    fields: [
      { id: 'len', label: 'Length', unit: 'm', value: 5, step: 0.1 },
      { id: 'wid', label: 'Width', unit: 'm', value: 3, step: 0.1 },
      { id: 'dep', label: 'Depth', unit: 'mm', value: 75, step: 5 },
    ],
    calc: function (v, f) {
      var m3 = v.len * v.wid * (v.dep / 1000);
      return {
        headline: f.n2(m3) + ' m³',
        rows: [
          ['Area', f.n2(v.len * v.wid) + ' m²', v.len + 'm x ' + v.wid + 'm'],
          ['Volume', f.n2(m3) + ' m³', 'At ' + v.dep + 'mm deep'],
          ['In litres', f.whole(m3 * 1000) + ' L', '1 m³ is 1000 litres'],
          ['25L bags', f.whole(m3 * 40), '40 bags to the cubic metre'],
          ['50L bags', f.whole(m3 * 20), '20 bags to the cubic metre'],
          ['Trailer loads', f.n2(m3 / 0.7) + ' loads', 'A 6x4 trailer holds roughly 0.7 m³ level'],
        ],
        values: { m3: m3, bags25: m3 * 40, bags50: m3 * 20 },
        note:
          'Mulch settles, so garden beds are usually done at 50 to 75mm and topped up rather than laid thick once. Turf underlay and topsoil go deeper. Bulk by the cubic metre is cheaper than bags past about half a cubic metre, and most suppliers on the border deliver.',
      };
    },
  },

  'fence-calculator': {
    headlineLabel: 'Materials',
    fields: [
      { id: 'run', label: 'Fence length', unit: 'm', value: 20, step: 0.5 },
      { id: 'spacing', label: 'Post spacing', unit: 'm', value: 2.4, step: 0.1 },
      { id: 'paling', label: 'Paling width', unit: 'mm', value: 90, step: 5 },
      { id: 'gap', label: 'Gap between palings', unit: 'mm', value: 0, step: 1 },
      { id: 'rails', label: 'Rails per bay', unit: '', value: 3, step: 1 },
    ],
    calc: function (v, f) {
      var bays = v.spacing > 0 ? Math.ceil(v.run / v.spacing) : 0;
      var posts = bays > 0 ? bays + 1 : 0;
      var railLength = bays * v.spacing * v.rails;
      var pitch = v.paling + v.gap;
      var palings = pitch > 0 ? Math.ceil((v.run * 1000) / pitch) : 0;
      return {
        headline: posts + ' posts',
        rows: [
          ['Bays', bays, 'At ' + v.spacing + 'm centres'],
          ['Posts', posts, 'One more than the bay count'],
          ['Rails', bays * v.rails, v.rails + ' per bay'],
          ['Rail length', f.n2(railLength) + ' m', 'Total linear metres'],
          ['Palings', palings, v.paling + 'mm wide' + (v.gap > 0 ? ' at ' + v.gap + 'mm gaps' : ', butted')],
          ['Concrete for posts', f.n2(posts * 0.02) + ' m³', 'About 20L a hole for a 300mm x 600mm hole'],
        ],
        values: { bays: bays, posts: posts, palings: palings },
        note:
          'Counts assume a straight run. Every corner and every gate adds a post, and a gate needs a heavier one. Post spacing of 2.4m is the usual maximum for a paling fence; going wider makes the rails sag. Dividing fences between neighbours are covered by fencing law in both states and the cost is normally shared, so talk to the neighbour before you order.',
      };
    },
  },

  'decking-calculator': {
    headlineLabel: 'Decking boards',
    fields: [
      { id: 'len', label: 'Deck length', unit: 'm', value: 6, step: 0.1 },
      { id: 'wid', label: 'Deck width', unit: 'm', value: 4, step: 0.1 },
      { id: 'board', label: 'Board width', unit: 'mm', value: 90, step: 5 },
      { id: 'gap', label: 'Gap between boards', unit: 'mm', value: 4, step: 1 },
      { id: 'joist', label: 'Joist spacing', unit: 'mm', value: 450, step: 50 },
      { id: 'waste', label: 'Waste allowance', unit: '%', value: 10, step: 1 },
    ],
    calc: function (v, f) {
      var area = v.len * v.wid;
      var pitch = v.board + v.gap;
      var boardRows = pitch > 0 ? Math.ceil((v.wid * 1000) / pitch) : 0;
      var linear = boardRows * v.len;
      var withWaste = linear * (1 + v.waste / 100);
      var joists = v.joist > 0 ? Math.ceil((v.len * 1000) / v.joist) + 1 : 0;
      return {
        headline: f.n2(withWaste) + ' lineal m',
        rows: [
          ['Deck area', f.n2(area) + ' m²', v.len + 'm x ' + v.wid + 'm'],
          ['Board runs', boardRows, v.board + 'mm boards at ' + v.gap + 'mm gaps'],
          ['Decking, before waste', f.n2(linear) + ' lineal m', ''],
          ['Order', f.n2(withWaste) + ' lineal m', v.waste + '% waste allowance'],
          ['Joists', joists, 'At ' + v.joist + 'mm centres'],
          ['Joist length', f.n2(joists * v.wid) + ' lineal m', ''],
        ],
        values: { boardRows: boardRows, linear: linear, withWaste: withWaste, joists: joists },
        note:
          'Joist spacing depends on the board. Most 19mm hardwood decking is rated to 450mm centres and thinner or composite boards often want 400mm or less, so check what the supplier specifies before you set out the frame. Gaps of 3 to 5mm suit seasoned hardwood; unseasoned timber is laid tighter because it shrinks.',
      };
    },
  },

  'contractor-rate-calculator': {
    headlineLabel: 'Charge at least',
    fields: [
      { id: 'income', label: 'Income you want to take home, before tax', unit: '$/yr', value: 90000, step: 1000 },
      { id: 'overheads', label: 'Business overheads a year', unit: '$/yr', value: 25000, step: 500 },
      { id: 'hours', label: 'Billable hours a week', unit: 'hrs', value: 25, step: 1 },
      { id: 'weeks', label: 'Weeks worked a year', unit: '', value: 46, step: 1 },
      { id: 'super', label: 'Superannuation you pay yourself', unit: '%', value: 12, step: 0.5 },
    ],
    calc: function (v, f) {
      var billable = v.hours * v.weeks;
      var superAmt = v.income * (v.super / 100);
      var required = v.income + v.overheads + superAmt;
      var rate = billable > 0 ? required / billable : 0;
      var incGst = rate * (1 + 0.1);
      return {
        headline: billable > 0 ? f.money(rate) + '/hr' : 'Set the hours',
        rows: [
          ['Income target', f.money(v.income), 'Before income tax'],
          ['Superannuation', f.money(superAmt), v.super + '% of the income target'],
          ['Overheads', f.money(v.overheads), 'Insurance, vehicle, tools, phone, accounting, registration'],
          ['Total to recover', f.money(required), ''],
          ['Billable hours a year', f.whole(billable), v.hours + ' a week over ' + v.weeks + ' weeks'],
          ['Minimum rate, before GST', f.money(rate) + '/hr', ''],
          ['Rate with GST', f.money(incGst) + '/hr', 'If you are registered for GST'],
          ['A 6 hour day at that rate', f.money(rate * 6), ''],
        ],
        values: { billable: billable, required: required, rate: rate },
        note:
          'The number people get wrong is billable hours. Quoting, invoicing, chasing payment, driving, buying materials and cleaning the ute are all unpaid, and for most sole trader trades the billable share of a 45 hour week is somewhere between 20 and 30 hours. Halving your assumed billable hours roughly doubles the rate you need, which is why a rate that looks high next to an employee wage usually is not.',
      };
    },
  },

  'markup-and-margin-calculator': {
    headlineLabel: 'Sell price',
    fields: [
      { id: 'cost', label: 'What it costs you', unit: '$', value: 100, step: 5 },
      { id: 'markup', label: 'Markup on cost', unit: '%', value: 30, step: 1 },
    ],
    calc: function (v, f) {
      var price = v.cost * (1 + v.markup / 100);
      var profit = price - v.cost;
      var margin = price > 0 ? (profit / price) * 100 : 0;
      // The markup that would be required for the margin to equal v.markup.
      // Undefined at and above 100% margin, which is why it is gated.
      var markupForSameMargin = v.markup < 100 ? v.markup / (1 - v.markup / 100) : 0;
      return {
        headline: f.money(price),
        rows: [
          ['Cost', f.money(v.cost), ''],
          ['Markup', f.money(profit), v.markup + '% of cost'],
          ['Sell price, before GST', f.money(price), ''],
          ['Gross margin', f.n2(margin) + '%', 'Profit as a share of the sell price'],
          ['Sell price with GST', f.money(price * 1.1), ''],
          [
            'For a ' + v.markup + '% MARGIN instead',
            markupForSameMargin > 0 ? f.money(v.cost * (1 + markupForSameMargin / 100)) : 'not achievable',
            markupForSameMargin > 0
              ? 'Needs a ' + f.n2(markupForSameMargin) + '% markup'
              : 'A margin of 100% or more cannot be reached by any markup',
          ],
        ],
        values: { price: price, margin: margin, markupForSameMargin: markupForSameMargin },
        note:
          'Markup and margin are not the same number and mixing them up is how a business quietly loses money. A 30% markup is a 23% margin. To actually make a 30% margin you need a 43% markup. If your accountant talks in margin and your supplier talks in markup, one of you is being misunderstood.',
      };
    },
  },
};

export const CALCULATOR_SLUGS = Object.keys(CALCULATORS);

// ------------------------------------------------------------------ shared maths
// Used by the GST and job cost widgets and by the tests. Written once because
// "divide by 11" appearing in three places is three chances to type 10.

/** GST contained in a GST inclusive figure. */
export const gstIn = (inclusive) => inclusive - inclusive / (1 + GST_RATE);

/** Price before GST, from a GST inclusive figure. */
export const exGst = (inclusive) => inclusive / (1 + GST_RATE);

/** GST inclusive total, from a price before GST. */
export const incGst = (ex) => ex * (1 + GST_RATE);

// ------------------------------------------------------------------ holidays

const utc = (y, m, d) => new Date(Date.UTC(y, m, d));

/** nth given weekday of a month. weekday 0 = Sunday. */
export function nthWeekday(y, m, weekday, n) {
  const first = utc(y, m, 1);
  const shift = (weekday - first.getUTCDay() + 7) % 7;
  return utc(y, m, 1 + shift + (n - 1) * 7);
}

/** Easter Sunday, anonymous Gregorian algorithm. */
export function easterSunday(y) {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(y, month - 1, day);
}

export const addDays = (d, n) => utc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n);

/** Fixed date holidays move to the following Monday when they land on a weekend. */
export function substituted(d) {
  const wd = d.getUTCDay();
  if (wd === 6) return addDays(d, 2);
  if (wd === 0) return addDays(d, 1);
  return d;
}

export const isWeekend = (d) => d.getUTCDay() === 0 || d.getUTCDay() === 6;
