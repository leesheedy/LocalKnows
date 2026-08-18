/**
 * Hydrate listings with real Google ratings.
 *
 * Nothing in this repository ever writes a rating by hand. A star on a listing
 * page came from here or it does not exist. Run it with a key:
 *
 *   GOOGLE_MAPS_API_KEY=... node scripts/fetch-places.mjs
 *   GOOGLE_MAPS_API_KEY=... node scripts/fetch-places.mjs --only=albury --limit=50
 *
 * Terms note: Google allows place IDs to be stored indefinitely but other Place
 * fields, ratings included, must not be cached for more than 30 days. The script
 * refuses to leave a rating older than that in place, so a build that has not
 * been refreshed drops back to a plain link to the Google profile rather than
 * showing a stale number.
 */
import fs from 'node:fs';
import path from 'node:path';

const KEY = process.env.GOOGLE_MAPS_API_KEY;
const DATA = path.join(process.cwd(), 'src', 'data');
const LISTINGS = path.join(DATA, 'listings.json');
const MAX_AGE_DAYS = 30;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

if (!fs.existsSync(LISTINGS)) {
  console.error('no src/data/listings.json, run scripts/ingest-businesses.mjs first');
  process.exit(1);
}

const listings = JSON.parse(fs.readFileSync(LISTINGS, 'utf8'));
const geo = ['geo-nsw.json', 'geo-vic.json']
  .map((f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')))
  .flatMap((g) => g.localities);
const localityById = new Map(geo.map((l) => [l.id, l]));

// Expire anything older than the cache window before doing anything else. This
// runs even without a key, so a build never ships a rating it is not allowed to.
let expired = 0;
const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 86400000).toISOString().slice(0, 10);
for (const l of listings) {
  if (l.google && l.google.fetchedAt < cutoff) {
    delete l.google;
    expired++;
  }
}
if (expired) console.log('expired ' + expired + ' ratings older than ' + MAX_AGE_DAYS + ' days');

if (!KEY) {
  fs.writeFileSync(LISTINGS, JSON.stringify(listings, null, 1));
  console.log('');
  console.log('No GOOGLE_MAPS_API_KEY set, so no ratings were fetched.');
  console.log('Listing pages will show a link to the Google profile instead of a star rating.');
  console.log('That is the intended fallback, not a failure.');
  process.exit(0);
}

const targets = listings
  .filter((l) => !l.google)
  .filter((l) => {
    if (!args.only) return true;
    const loc = localityById.get(l.localityId);
    return loc && loc.slug === String(args.only);
  })
  .slice(0, args.limit ? Number(args.limit) : Infinity);

console.log('fetching ' + targets.length + ' places');

const FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.rating',
  'places.userRatingCount',
  'places.googleMapsUri',
  'places.nationalPhoneNumber',
  'places.websiteUri',
].join(',');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Date().toISOString().slice(0, 10);

let hit = 0;
let miss = 0;
let failed = 0;

for (const l of targets) {
  const loc = localityById.get(l.localityId);
  if (!loc) continue;
  const query = [l.name, l.addressLine, loc.name, loc.state, 'Australia'].filter(Boolean).join(', ');

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY,
        'X-Goog-FieldMask': FIELDS,
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: 1,
        languageCode: 'en-AU',
        regionCode: 'AU',
        locationBias: {
          circle: {
            center: { latitude: loc.lat, longitude: loc.lng },
            radius: 20000,
          },
        },
      }),
    });

    if (!res.ok) {
      failed++;
      console.warn('  ' + res.status + ' ' + l.slug + ' ' + (await res.text()).slice(0, 140));
      await sleep(400);
      continue;
    }

    const json = await res.json();
    const place = json.places?.[0];

    if (!place) {
      miss++;
      await sleep(120);
      continue;
    }

    // Guard against matching a different business with a similar name.
    const got = (place.displayName?.text || '').toLowerCase();
    const want = l.name.toLowerCase();
    const looksRight =
      got.includes(want.slice(0, Math.min(12, want.length))) ||
      want.includes(got.slice(0, Math.min(12, got.length)));
    if (!looksRight) {
      miss++;
      console.warn('  name mismatch for ' + l.slug + ': got "' + place.displayName?.text + '"');
      await sleep(120);
      continue;
    }

    l.googlePlaceId = place.id;
    if (place.googleMapsUri) l.googleMapsUrl = place.googleMapsUri;

    if (typeof place.rating === 'number' && place.userRatingCount > 0) {
      l.google = {
        rating: place.rating,
        reviewCount: place.userRatingCount,
        fetchedAt: today,
        url: place.googleMapsUri || l.googleMapsUrl,
      };
      hit++;
    } else {
      miss++;
    }
  } catch (e) {
    failed++;
    console.warn('  error ' + l.slug + ': ' + e.message);
  }

  await sleep(120);
}

fs.writeFileSync(LISTINGS, JSON.stringify(listings, null, 1));

console.log('');
console.log('  ratings written  ' + hit);
console.log('  no rating found  ' + miss);
console.log('  errors           ' + failed);
console.log('  total with a rating now ' + listings.filter((l) => l.google).length + '/' + listings.length);
