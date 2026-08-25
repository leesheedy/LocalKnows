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

/**
 * The slugs that are already published.
 *
 * Read before listings.json is overwritten, because a URL that has shipped is
 * not ours to move. See the "keep the published slug" step after the merge.
 */
const publishedSlugs = new Set();
try {
  for (const l of JSON.parse(fs.readFileSync(path.join(DATA, 'listings.json'), 'utf8'))) {
    publishedSlugs.add(l.slug);
  }
} catch {
  // First run, or the file is not there yet. Nothing has been published.
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
const mergedPairs = [];
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

// ------------------------------------------------------------------ dedupe

/**
 * The same business turns up in two research clusters.
 *
 * Bridge Road Brewers is a bar and a brewery, Knights Deli is a takeaway and a
 * butcher, and each was written down by both researchers. Left alone that
 * produces two URLs with the same H1 and the same address, which is duplicate
 * content the site is otherwise careful to avoid.
 *
 * A business is the same business when the name matches after folding and it is
 * in the same locality, or within 3km of it. That distance is deliberate: it
 * catches the record filed under Albury and the record filed under South Albury,
 * without merging two genuinely separate branches in different towns.
 *
 * The merge keeps the more complete record and unions the categories, so the
 * business gets one page and appears under both.
 */
/**
 * Fold a trading name for comparison.
 *
 * The leading article goes, because whether a business writes "The Full Cycle"
 * or "Full Cycle" depends on which page of its own site you read, and two
 * research passes landed on different answers three times: Full Cycle Albury,
 * The Butter Factory Cafe and The Finishing Touch Wangaratta each arrived twice
 * and each pair shared a phone number. Without this they become two URLs with
 * the same H1, the same address and the same phone, which is the duplicate
 * content this merge exists to prevent. `initials()` above already strips it for
 * the logo tile, so the two were disagreeing about what a name is.
 */
const fold = (name) =>
  name
    .toLowerCase()
    .replace(/^(?:the|a)\s+/, '')
    .replace(/[^a-z0-9]+/g, '');
const completeness = (r) =>
  [r.addressLine, r.phone, r.website, r.description, r.hours?.length, r.highlights?.length]
    .filter(Boolean).length + (r.confidence === 'high' ? 2 : 0);

const merged = [];
const byName = new Map();

for (const row of out) {
  const k = fold(row.name);
  const candidates = byName.get(k) || [];
  const home = localities.find((l) => l.id === row.localityId);
  const digits = (v) => String(v || '').replace(/[^0-9]/g, '');
  const host = (v) => {
    try {
      return new URL(v).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  };

  const twin = candidates.find((c) => {
    // Same phone or same website is the strong signal, and it holds at any
    // distance. The Wagga Wagga Country Club was filed under both Lake Albert
    // and Wagga Wagga, 5km apart, which no distance rule catches without also
    // merging genuinely separate branches in neighbouring suburbs.
    if (digits(c.phone) && digits(c.phone) === digits(row.phone)) return true;
    if (host(c.website) && host(c.website) === host(row.website)) return true;
    if (c.localityId === row.localityId) return true;
    const other = localities.find((l) => l.id === c.localityId);
    return home && other && distanceKm(home, other) <= 3;
  });

  if (!twin) {
    candidates.push(row);
    byName.set(k, candidates);
    merged.push(row);
    continue;
  }

  // Keep whichever record says more, then fold the other one into it.
  const [keep, drop] = completeness(row) > completeness(twin) ? [row, twin] : [twin, row];
  if (keep !== twin) {
    merged[merged.indexOf(twin)] = keep;
    candidates[candidates.indexOf(twin)] = keep;
  }

  for (const cid of drop.categoryIds) {
    if (!keep.categoryIds.includes(cid)) keep.categoryIds.push(cid);
  }
  keep.attributes = { ...drop.attributes, ...keep.attributes };
  keep.highlights = [...new Set([...(keep.highlights || []), ...(drop.highlights || [])])].slice(0, 8);
  keep.sources = [...new Set([...(keep.sources || []), ...(drop.sources || [])])].slice(0, 4);
  keep.serviceAreaIds = [...new Set([...keep.serviceAreaIds, ...drop.serviceAreaIds])];
  if (!keep.hours?.length && drop.hours?.length) keep.hours = drop.hours;
  for (const f of ['phone', 'website', 'addressLine', 'email', 'bookingUrl', 'facebook', 'instagram', 'priceBand']) {
    if (!keep[f] && drop[f]) keep[f] = drop[f];
  }
  if (drop.confidence === 'high') keep.confidence = 'high';
  // The dropped slug is a URL that may already be linked. Keep it so postbuild
  // can 301 it to the survivor, because nothing on this site is allowed to
  // simply stop resolving.
  keep.mergedFrom = [...new Set([...(keep.mergedFrom || []), ...(drop.mergedFrom || []), drop.slug])];
  mergedPairs.push(drop.slug + ' -> ' + keep.slug);
}

/*
 * Keep the slug that has already been published.
 *
 * The merge keeps whichever record says more, and a freshly researched record
 * almost always says more than the one already in the file. That is right for
 * the content and wrong for the URL: it renamed Bridge Road Brewers from
 * /bridge-road-brewers-beechworth/ to /bridge-road-brewers-beechworth-2/ simply
 * because a third record with the same name turned up, and it renamed Eldorado
 * Road to the longer trading name on its cellar door page. Both were live URLs.
 * A hand written list pointing at them failed the build, which is the cheap way
 * to find out; the expensive way is a ranking page quietly becoming a redirect.
 *
 * `mergedFrom` already carries every slug that was folded in, so if one of them
 * was published, that is the URL this business has and the new one is the alias.
 * A 301 is what this does when a business genuinely has to move. It is not a
 * substitute for not moving it.
 */
{
  const taken = new Set(merged.map((r) => r.slug));
  let restored = 0;
  for (const row of merged) {
    if (publishedSlugs.has(row.slug)) continue;
    const older = (row.mergedFrom || []).find((s) => publishedSlugs.has(s) && !taken.has(s));
    if (!older) continue;
    taken.delete(row.slug);
    taken.add(older);
    row.mergedFrom = [...new Set([...(row.mergedFrom || []).filter((s) => s !== older), row.slug])];
    row.slug = older;
    row.id = 'biz-' + older;
    restored++;
  }
  if (restored) console.log('  kept ' + restored + ' published slug' + (restored === 1 ? '' : 's') + ' through a merge');
}

/*
 * Re-derive the inferred service area after merging.
 *
 * The merge unions two records' service areas, which is right when the areas
 * were stated and wrong when they were inferred. Two records for one business
 * filed under Wagga Wagga and under Gumly Gumly union into a listing whose home
 * is Wagga and whose service area contains a tier 4 hamlet the inference rule
 * would never have reached, plus same town neighbours the 12km floor exists to
 * exclude. Three of those appeared the first time a research pass found
 * businesses that were already listed under another category, and `npm test`
 * caught all three.
 *
 * So an inferred area is recomputed from the surviving locality by the same
 * function that produced it in the first place, rather than being patched here.
 * Anything a business actually stated is untouched, because that is not inferred.
 */
for (const row of merged) {
  if (!row.serviceAreaInferred) continue;
  const home = localities.find((l) => l.id === row.localityId);
  if (!home) continue;
  const radius = SERVICE_RADIUS_KM[row.vertical] ?? 0;
  const ids = [home.id];
  if (radius > 0) {
    const near = localities
      .filter((other) => other.id !== home.id)
      .map((other) => ({ other, km: distanceKm(home, other) }))
      .filter((x) => reachable(home, x.other, x.km, radius))
      .sort((a, b) => a.km - b.km)
      .slice(0, MAX_INFERRED_AREAS);
    for (const { other } of near) ids.push(other.id);
  }
  row.serviceAreaIds = ids;
  row.serviceAreaInferred = ids.length > 1;
}

out.length = 0;
out.push(...merged);

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
if (mergedPairs.length) {
  console.log('  merged ' + mergedPairs.length + ' duplicate records:');
  for (const m of mergedPairs) console.log('    ' + m);
}
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
