/**
 * IndexNow ping.
 *
 * Tells Bing, Yandex and the other participating engines which URLs changed,
 * instead of waiting to be crawled. Google does not participate, so fresh URLs
 * still go to it through the sitemap and Search Console.
 *
 * Needs a key file served from the site root. Generate one once:
 *   node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
 * then put it in INDEXNOW_KEY and this script writes public/<key>.txt for you.
 *
 * Run after a build: node scripts/indexnow.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const KEY = process.env.INDEXNOW_KEY;
const SITE = (process.env.SITE_URL || 'https://localsknow.com.au').replace(/\/$/, '');
const host = new URL(SITE).hostname;
const DIST = path.join(process.cwd(), 'dist');

if (!KEY) {
  console.log('no INDEXNOW_KEY set, skipping the ping');
  process.exit(0);
}

// The key file has to be reachable at the site root or the ping is rejected.
fs.writeFileSync(path.join(process.cwd(), 'public', KEY + '.txt'), KEY);
if (fs.existsSync(DIST)) fs.writeFileSync(path.join(DIST, KEY + '.txt'), KEY);

const sitemapIndex = path.join(DIST, 'sitemap.xml');
if (!fs.existsSync(sitemapIndex)) {
  console.error('no dist/sitemap.xml, run the build first');
  process.exit(1);
}

const urls = [];
const idx = fs.readFileSync(sitemapIndex, 'utf8');
for (const m of idx.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const child = path.join(DIST, m[1].split('/').pop());
  if (!fs.existsSync(child)) continue;
  const xml = fs.readFileSync(child, 'utf8');
  for (const u of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) urls.push(u[1]);
}

// IndexNow caps a submission at 10,000 URLs.
const BATCH = 10000;
let sent = 0;
for (let i = 0; i < urls.length; i += BATCH) {
  const body = {
    host,
    key: KEY,
    keyLocation: SITE + '/' + KEY + '.txt',
    urlList: urls.slice(i, i + BATCH),
  };
  const res = await fetch('https://api.indexnow.org/IndexNow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  if (res.ok || res.status === 202) sent += body.urlList.length;
  else console.warn('  batch ' + (i / BATCH + 1) + ' returned ' + res.status + ' ' + (await res.text()).slice(0, 120));
}

console.log('indexnow: submitted ' + sent + ' of ' + urls.length + ' urls for ' + host);
