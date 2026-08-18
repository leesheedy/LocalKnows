/**
 * Discover businesses in a new town.
 *
 * Uses the crawl4ai CLI (`crwl`) rather than a plain fetch, because most of the
 * pages worth reading here are JavaScript rendered listing pages and a raw GET
 * returns an empty shell.
 *
 *   pip install crawl4ai && crawl4ai-setup
 *
 * Output goes to src/data/businesses/_inbox/<town>.json, NOT straight into the
 * live data. That is deliberate. A scraped row is a candidate: it has a name and
 * a URL and nothing that has been checked. Promoting it is a separate command
 * and it is where a person looks at it.
 *
 * Publishing unreviewed scraped rows is how a directory ends up full of
 * businesses that closed in 2019, and it is the reason nobody trusts the
 * incumbents.
 *
 * Usage:
 *   node scripts/scrape.mjs --town=wagga-wagga --state=NSW
 *   node scripts/scrape.mjs --town=wagga-wagga --state=NSW --seeds=seeds.txt
 *   node scripts/scrape.mjs --promote=wagga-wagga        # move inbox to live
 *   node scripts/scrape.mjs --list                       # what is waiting
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';

const run = promisify(execFile);
const ROOT = process.cwd();
const DATA = path.join(ROOT, 'src', 'data');
const BIZ = path.join(DATA, 'businesses');
const INBOX = path.join(BIZ, '_inbox');
const TMP = path.join(os.tmpdir(), 'localknows-scrape');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

fs.mkdirSync(INBOX, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const geo = ['geo-nsw.json', 'geo-vic.json'].map((f) => read(path.join(DATA, f)));
const localities = geo.flatMap((g) => g.localities);

// ---------------------------------------------------------------- list / promote

if (args.list) {
  const files = fs.existsSync(INBOX) ? fs.readdirSync(INBOX).filter((f) => f.endsWith('.json')) : [];
  if (!files.length) {
    console.log('inbox is empty');
    process.exit(0);
  }
  for (const f of files) {
    const rows = read(path.join(INBOX, f));
    const ready = rows.filter((r) => r.name && r.website && r.categorySlug);
    console.log(f.padEnd(28) + rows.length + ' candidates, ' + ready.length + ' have enough to promote');
  }
  process.exit(0);
}

if (args.promote) {
  const src = path.join(INBOX, args.promote + '.json');
  if (!fs.existsSync(src)) {
    console.error('nothing in the inbox for ' + args.promote);
    process.exit(1);
  }
  const rows = read(src);
  const ready = rows.filter(
    (r) => r.name && r.slug && r.categorySlug && r.localityName && r.state && r.description,
  );
  const held = rows.length - ready.length;
  if (!ready.length) {
    console.error('no candidate in ' + args.promote + ' has the required fields yet');
    process.exit(1);
  }
  const dest = path.join(BIZ, 'scraped-' + args.promote + '.json');
  const existing = fs.existsSync(dest) ? read(dest) : [];
  const bySlug = new Map(existing.map((r) => [r.slug, r]));
  for (const r of ready) bySlug.set(r.slug, r);
  fs.writeFileSync(dest, JSON.stringify([...bySlug.values()], null, 1));
  fs.writeFileSync(src, JSON.stringify(rows.filter((r) => !ready.includes(r)), null, 1));
  console.log('promoted ' + ready.length + ' into ' + path.relative(ROOT, dest));
  if (held) console.log(held + ' left in the inbox, still missing required fields');
  console.log('now run: node scripts/ingest-businesses.mjs && npm run build');
  process.exit(0);
}

// ---------------------------------------------------------------- scrape

const townSlug = args.town;
const state = args.state;
if (!townSlug || !state) {
  console.error('usage: node scripts/scrape.mjs --town=<slug> --state=NSW|VIC');
  process.exit(1);
}

const locality = localities.find((l) => l.slug === townSlug && l.state === state);
if (!locality) {
  console.error('no locality "' + townSlug + '" in ' + state + '. Add it to src/data/geo-' + state.toLowerCase() + '.json first.');
  process.exit(1);
}

async function haveCrwl() {
  try {
    await run('crwl', ['--version']);
    return true;
  } catch {
    return false;
  }
}

if (!(await haveCrwl())) {
  console.error('');
  console.error('crwl is not on PATH. Install it with:');
  console.error('');
  console.error('    pip install crawl4ai');
  console.error('    crawl4ai-setup');
  console.error('');
  console.error('It is used instead of a plain fetch because the pages worth reading here');
  console.error('are JavaScript rendered and a raw GET returns an empty shell.');
  process.exit(1);
}

/**
 * Seeds. Council and tourism pages first, because they are curated, they are
 * accurate, and crawling them is not adversarial. Aggregator sites are not in
 * the default list on purpose: their terms of use prohibit it and rebuilding a
 * competitor's index is not what this is for.
 */
const defaultSeeds = (l) => {
  const q = encodeURIComponent(l.name + ' ' + l.state);
  return [
    'https://www.visitnsw.com/search?q=' + q,
    'https://www.abr.business.gov.au/',
  ].filter(() => false); // no default seeds, see below
};

const seedFile = args.seeds ? String(args.seeds) : null;
let seeds = [];
if (seedFile && fs.existsSync(seedFile)) {
  seeds = fs
    .readFileSync(seedFile, 'utf8')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'));
} else {
  seeds = defaultSeeds(locality);
}

if (!seeds.length) {
  console.error('');
  console.error('No seed URLs. Pass a file with --seeds=seeds.txt, one URL per line.');
  console.error('');
  console.error('Good seeds for a regional town, in order of how much they are worth:');
  console.error('  1. The council business directory, if it has one.');
  console.error('  2. The regional tourism board operator list.');
  console.error('  3. The chamber of commerce member list.');
  console.error('  4. Individual business websites you already know about.');
  console.error('');
  console.error('Do not seed this with a competitor directory. Their terms prohibit it,');
  console.error('their data is stale, and copying an index is not a product.');
  process.exit(1);
}

console.log('scraping ' + seeds.length + ' seed pages for ' + locality.name + ' ' + locality.state);

const candidates = new Map();

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);

for (const [i, url] of seeds.entries()) {
  const out = path.join(TMP, 'seed-' + i + '.md');
  process.stdout.write('  ' + (i + 1) + '/' + seeds.length + ' ' + url.slice(0, 70) + ' ');
  try {
    const { stdout } = await run(
      'crwl',
      [url, '-o', 'markdown', '-c', 'wait_until=networkidle,page_timeout=60000'],
      { maxBuffer: 40 * 1024 * 1024, timeout: 120000 },
    );
    fs.writeFileSync(out, stdout);

    // Anchors that look like a business: an external link with a real label.
    const links = [...stdout.matchAll(/\[([^\]]{3,80})\]\((https?:\/\/[^)\s]+)\)/g)];
    let found = 0;
    for (const [, label, href] of links) {
      const host = new URL(href).hostname.replace(/^www\./, '');
      if (/(facebook|instagram|twitter|x\.com|linkedin|youtube|tiktok|google|maps|wikipedia)\./.test(host)) continue;
      if (new URL(url).hostname.replace(/^www\./, '') === host) continue;
      const name = label.replace(/\s+/g, ' ').trim();
      if (!/[A-Za-z]{3}/.test(name)) continue;
      const slug = slugify(name);
      if (!slug || candidates.has(slug)) continue;
      candidates.set(slug, {
        name,
        slug,
        categorySlug: '',
        vertical: '',
        localityName: locality.name,
        state: locality.state,
        postcode: locality.postcode,
        website: 'https://' + host + '/',
        googleMapsUrl:
          'https://www.google.com/maps/search/?api=1&query=' +
          encodeURIComponent(name + ' ' + locality.name + ' ' + locality.state),
        description: '',
        highlights: [],
        sources: [url],
        confidence: 'medium',
        lastCheckedAt: new Date().toISOString().slice(0, 10),
        needsReview: true,
      });
      found++;
    }
    console.log('→ ' + found + ' candidates');
  } catch (e) {
    console.log('→ failed: ' + String(e.message).slice(0, 80));
  }
}

const dest = path.join(INBOX, townSlug + '.json');
const existing = fs.existsSync(dest) ? read(dest) : [];
const merged = new Map(existing.map((r) => [r.slug, r]));
for (const [slug, row] of candidates) if (!merged.has(slug)) merged.set(slug, row);
fs.writeFileSync(dest, JSON.stringify([...merged.values()], null, 1));

console.log('');
console.log('wrote ' + merged.size + ' candidates to ' + path.relative(ROOT, dest));
console.log('');
console.log('These are NOT listings yet. Each one still needs:');
console.log('  categorySlug, vertical, description, and an address or a phone number');
console.log('read from the business itself, plus a source URL for each.');
console.log('');
console.log('When they are filled in:  node scripts/scrape.mjs --promote=' + townSlug);
