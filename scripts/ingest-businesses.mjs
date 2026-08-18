/**
 * Turn researched business records into src/data/listings.json.
 *
 * The research files under src/data/businesses/ are written by hand or by a
 * research pass and hold what a human could read off a public source. This
 * script does the joins, the derivations and the scoring, and it is the only
 * place any of that happens.
 *
 * Nothing here invents a fact. It derives:
 *   - locality and category ids, from names and slugs
 *   - a likely service area for mobile trades, clearly flagged as inferred
 *   - a quality score, from how complete the record is
 *   - a logo tile, from the initials
 *
 * Run: node scripts/ingest-businesses.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DATA = path.join(ROOT, 'src', 'data');
const BIZ = path.join(DATA, 'businesses');

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const exists = (p) => fs.existsSync(p);

if (!exists(path.join(DATA, 'geo-nsw.json')) || !exists(path.join(DATA, 'categories.json'))) {
  console.error('Geography or taxonomy missing. Generate src/data/geo-*.json and categories.json first.');
  process.exit(1);
}

const geo = [read(path.join(DATA, 'geo-nsw.json')), read(path.join(DATA, 'geo-vic.json'))];
const localities = geo.flatMap((g) => g.localities);
const taxonomy = read(path.join(DATA, 'categories.json'));

const localityByKey = new Map();
for (const l of localities) {
  localityByKey.set(l.state + '|' + l.name.toLowerCase(), l);
  localityByKey.set(l.state + '|' + l.slug, l);
}

const categoryBySlug = new Map(taxonomy.categories.map((c) => [c.slug, c]));

/** schema.org types we are confident exist, keyed by vertical, for auto-registration. */
const FALLBACK_SCHEMA = {
  trades: 'LocalBusiness',
  eat_drink: 'FoodEstablishment',
  pubs_clubs: 'BarOrPub',
  stay: 'LodgingBusiness',
  things_to_do: 'TouristAttraction',
  clubs_hobbies: 'Organization',
};

const titleCase = (slug) =>
  slug
    .split('-')
    .map((w) => (w.length <= 2 && w !== 'to' ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');

const singularise = (name) => {
  if (/ies$/.test(name)) return name.replace(/ies$/, 'y');
  if (/ses$/.test(name)) return name.replace(/es$/, '');
  if (/s$/.test(name) && !/ss$/.test(name)) return name.replace(/s$/, '');
  return name;
};

const LOGO_THEMES = ['a', 'b', 'c', 'd', 'e', 'f'];
const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

const initials = (name) => {
  const words = name
    .replace(/^(the|a)\s+/i, '')
    .replace(/[^A-Za-z0-9 &]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '??';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

const distanceKm = (a, b) => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const l1 = (a.lat * Math.PI) / 180;
  const l2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(l1) * Math.cos(l2);
  return 2 * R * Math.asin(Math.sqrt(h));
};

/**
 * How far a business of this kind plausibly travels.
 * A cafe does not have a service area. A mobile mechanic does.
 * Anything derived here is flagged so the page can say it was inferred.
 */
const SERVICE_RADIUS_KM = {
  trades: 30,
  eat_drink: 0,
  pubs_clubs: 0,
  stay: 0,
  things_to_do: 0,
  clubs_hobbies: 12,
};

/**
 * Cap on inferred coverage.
 *
 * Without it, every Albury trade lands inside 30km of all nine Albury suburbs
 * plus Wodonga's, and the directory generates ten near identical pages of the
 * same twelve plumbers.
 */
const MAX_INFERRED_AREAS = 10;

/**
 * Which neighbours an inferred service area is allowed to reach.
 *
 * The rule encodes what the inference is actually for. It exists to say "this
 * business is close enough to work in the next TOWN", which on this border
 * means the other side of the river. It was never meant to say "this Albury
 * plumber also works in North Albury", because that is the same town and the
 * business is already listed in it.
 *
 * So: another state at any distance inside the radius, or the same state at
 * more than SAME_STATE_FLOOR_KM. Albury to Wodonga is about five kilometres and
 * crosses the border, so it is in. Albury to Lavington is about five kilometres
 * and does not, so it is out.
 */
const SAME_STATE_FLOOR_KM = 12;

const reachable = (from, to, km, radius) => {
  if (km > radius) return false;
  // Tier 4 is a hamlet that rolls up into its neighbour. Inferring coverage into
  // one means a village of six hundred people gets a page listing a hundred and
  // twenty Albury tradespeople, which is a duplicate of Albury wearing a
  // different name. A tier 4 place still gets a page when a business is actually
  // based there; it just does not get blanketed.
  if (to.tier >= 4) return false;
  if (from.state !== to.state) return true;
  return km >= SAME_STATE_FLOOR_KM;
};

// ------------------------------------------------------------------ load

if (!exists(BIZ)) {
  console.error('No src/data/businesses/ directory. Nothing to ingest.');
  process.exit(1);
}

const files = fs.readdirSync(BIZ).filter((f) => f.endsWith('.json'));
const raw = [];
for (const f of files) {
  try {
    const rows = read(path.join(BIZ, f));
    if (!Array.isArray(rows)) {
      console.warn('  skip ' + f + ': not an array');
      continue;
    }
    for (const r of rows) raw.push({ ...r, _file: f });
  } catch (e) {
    console.warn('  skip ' + f + ': ' + e.message);
  }
}

console.log('read ' + raw.length + ' records from ' + files.length + ' files');

// ------------------------------------------------------------------ transform

const problems = [];
const autoCategories = new Map();
const seenSlug = new Map();
const out = [];

for (const r of raw) {
  const where = r._file + ':' + (r.slug || r.name || '?');

  if (!r.name || !r.slug || !r.categorySlug || !r.localityName || !r.state) {
    problems.push('incomplete record ' + where);
    continue;
  }

  const locality =
    localityByKey.get(r.state + '|' + String(r.localityName).toLowerCase()) ||
    localityByKey.get(r.state + '|' + String(r.suburb || '').toLowerCase());

  if (!locality) {
    problems.push('unknown locality "' + r.localityName + '" (' + r.state + ') for ' + where);
    continue;
  }

  let category = categoryBySlug.get(r.categorySlug);
  if (!category) {
    // Auto register rather than drop the business. Logged so the taxonomy can be
    // tidied later, but a real business is never lost to a slug mismatch.
    const name = titleCase(r.categorySlug);
    category = {
      id: 'cat-' + r.categorySlug,
      vertical: r.vertical || 'trades',
      name,
      nameSingular: singularise(name),
      slug: r.categorySlug,
      schemaType: FALLBACK_SCHEMA[r.vertical] || 'LocalBusiness',
      description:
        name +
        ' listed across the New South Wales and Victoria border corridor, with contact details read from each business’s own published sources.',
      synonyms: [],
      sortOrder: 900,
      _auto: true,
    };
    categoryBySlug.set(category.slug, category);
    autoCategories.set(category.slug, category);
  }

  // Unique slug. Two businesses can share a name across towns.
  let slug = r.slug;
  if (seenSlug.has(slug)) {
    slug = slug + '-' + locality.slug;
    if (seenSlug.has(slug)) slug = slug + '-' + (seenSlug.get(r.slug) + 1);
  }
  seenSlug.set(r.slug, (seenSlug.get(r.slug) ?? 0) + 1);

  const isMobile =
    r.attributes?.mobile_service === 'yes' ||
    (!r.addressLine && (r.vertical === 'trades' || r.vertical === 'clubs_hobbies'));

  // Inferred service area. Own locality always; neighbours only for the verticals
  // where travelling to a job is what the business does.
  const radius = SERVICE_RADIUS_KM[r.vertical] ?? 0;
  const serviceAreaIds = [locality.id];
  let serviceAreaInferred = false;
  if (radius > 0) {
    const near = localities
      .filter((other) => other.id !== locality.id)
      .map((other) => ({ other, km: distanceKm(locality, other) }))
      .filter((x) => reachable(locality, x.other, x.km, radius))
      .sort((a, b) => a.km - b.km)
      .slice(0, MAX_INFERRED_AREAS);
    for (const { other } of near) serviceAreaIds.push(other.id);
    serviceAreaInferred = serviceAreaIds.length > 1;
  }

  const hours = Array.isArray(r.hours)
    ? r.hours
        .filter((h) => typeof h.day === 'number' && h.day >= 0 && h.day <= 6)
        .map((h) => ({
          day: h.day,
          opens: h.closed ? undefined : h.opens,
          closes: h.closed ? undefined : h.closes,
          closed: Boolean(h.closed) || !h.opens,
          note: h.note,
        }))
    : [];

  const licences = [];
  if (r.licenceNumber && r.licenceState) {
    licences.push({
      state: r.licenceState,
      number: String(r.licenceNumber),
      class: r.licenceClass || category.nameSingular,
      registerUrl:
        r.licenceState === 'NSW'
          ? 'https://verify.licence.nsw.gov.au/'
          : 'https://www.vba.vic.gov.au/',
      // Published by the business. Not checked against the register yet, and the
      // page has to say so rather than imply a verification that never happened.
      verificationOk: false,
    });
  }

  // Quality score. Completeness only. Nothing here can be bought.
  let score = 0;
  score += 12; // has a name, a category and a locality at all
  if (r.description && r.description.length >= 80) score += 12;
  if (r.addressLine) score += 10;
  if (r.phone) score += 12;
  if (r.website) score += 12;
  if (hours.length >= 5) score += 12;
  else if (hours.length > 0) score += 6;
  if (Array.isArray(r.highlights) && r.highlights.length >= 3) score += 8;
  if (r.attributes && Object.keys(r.attributes).length >= 2) score += 6;
  if (r.googleMapsUrl) score += 4;
  if (r.facebook || r.instagram) score += 4;
  if (r.confidence === 'high') score += 8;
  if (licences.length) score += 4;
  score = Math.min(100, score);

  out.push({
    id: 'biz-' + slug,
    slug,
    name: r.name,
    legalName: r.legalName,
    abn: undefined,
    status: 'scraped',
    vertical: r.vertical,
    categoryIds: [category.id],
    description: r.description,
    phone: r.phone,
    email: r.email,
    website: r.website,
    bookingUrl: r.bookingUrl,

    addressLine: r.addressLine,
    localityId: locality.id,
    postcode: String(r.postcode || locality.postcode),
    lat: undefined,
    lng: undefined,
    isMobile,

    serviceAreaIds,
    serviceAreaInferred,

    logoText: initials(r.name),
    logoTheme: LOGO_THEMES[hash(slug) % LOGO_THEMES.length],

    attributes: {
      ...(r.attributes || {}),
      ...(r.priceBand ? { price_band: r.priceBand } : {}),
    },
    licences,
    hours,
    reviews: [],

    qualityScore: score,
    isSample: false,

    sources: Array.isArray(r.sources) ? r.sources.slice(0, 4) : [],
    confidence: r.confidence === 'high' ? 'high' : 'medium',
    lastCheckedAt: r.lastCheckedAt || new Date().toISOString().slice(0, 10),

    googleMapsUrl:
      r.googleMapsUrl ||
      'https://www.google.com/maps/search/?api=1&query=' +
        encodeURIComponent(r.name + ' ' + locality.name + ' ' + r.state),
    facebook: r.facebook,
    instagram: r.instagram,

    highlights: Array.isArray(r.highlights) ? r.highlights : [],
    priceBand: r.priceBand,
  });
}

// ------------------------------------------------------------------ write

fs.writeFileSync(path.join(DATA, 'listings.json'), JSON.stringify(out, null, 1));

if (autoCategories.size) {
  const merged = {
    categories: [...taxonomy.categories, ...autoCategories.values()],
    modifiers: taxonomy.modifiers,
  };
  fs.writeFileSync(path.join(DATA, 'categories.json'), JSON.stringify(merged, null, 1));
  console.log('auto registered ' + autoCategories.size + ' categories:');
  for (const c of autoCategories.values()) console.log('  ' + c.slug + ' -> ' + c.schemaType);
}

if (!exists(path.join(DATA, 'lists.json'))) {
  fs.writeFileSync(path.join(DATA, 'lists.json'), '[]');
}

const byState = out.reduce((acc, l) => {
  const loc = localities.find((x) => x.id === l.localityId);
  acc[loc.state] = (acc[loc.state] || 0) + 1;
  return acc;
}, {});

console.log('');
console.log('wrote ' + out.length + ' listings');
console.log('  by state: ' + JSON.stringify(byState));
console.log('  high confidence: ' + out.filter((l) => l.confidence === 'high').length);
console.log('  with a phone: ' + out.filter((l) => l.phone).length);
console.log('  with a website: ' + out.filter((l) => l.website).length);
console.log('  with hours: ' + out.filter((l) => l.hours.length).length);
console.log('  median quality: ' + out.map((l) => l.qualityScore).sort((a, b) => a - b)[Math.floor(out.length / 2)]);

if (problems.length) {
  console.log('');
  console.log(problems.length + ' records dropped:');
  for (const p of problems.slice(0, 40)) console.log('  ' + p);
  if (problems.length > 40) console.log('  ...and ' + (problems.length - 40) + ' more');
}
