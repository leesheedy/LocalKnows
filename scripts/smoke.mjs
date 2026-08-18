/**
 * Live smoke test.
 *
 * Pulls the deployed sitemap index and checks every URL in it actually returns
 * 200, following no redirects. It exists because a forced trailing slash rule
 * once turned /nsw/ and /vic/ into an infinite redirect loop, and every local
 * check passed: the files were built, the sitemap was right, the links were
 * right. Only production was broken, so only production could catch it.
 *
 *   node scripts/smoke.mjs
 *   node scripts/smoke.mjs --site=https://main--localknows.netlify.app
 */
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

const SITE = (args.site || process.env.SITE_URL || 'https://localsknow.com.au').replace(/\/$/, '');
// Deliberately gentle. At twelve concurrent the CDN rate limits and answers 403,
// which a smoke test reports as the site being down. A check that cries wolf gets
// ignored, and an ignored check is worse than no check.
const CONCURRENCY = Number(args.concurrency || 4);
const RETRY_STATUSES = new Set([403, 429, 502, 503, 504]);
const UA =
  'Mozilla/5.0 (compatible; LocalKnowsSmoke/1.0; +https://localsknow.com.au/about/)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

const indexXml = await fetch(SITE + '/sitemap.xml').then((r) => r.text());
const children = locs(indexXml);
if (!children.length) {
  console.error('no child sitemaps at ' + SITE + '/sitemap.xml');
  process.exit(1);
}

const urls = [];
for (const child of children) {
  urls.push(...locs(await fetch(child).then((r) => r.text())));
}

// Anything that must exist but is not in a sitemap, because it is noindex.
const extras = ['/robots.txt', '/llms.txt', '/sitemap.xml', '/wire/rss.xml', '/search/', '/404.html'];
for (const e of extras) urls.push(SITE + e);

console.log('checking ' + urls.length + ' urls on ' + SITE);

const bad = [];
let done = 0;
let cursor = 0;

async function worker() {
  while (cursor < urls.length) {
    const url = urls[cursor++];
    const expected = url.endsWith('/404.html') ? [200, 404] : [200];
    let last = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // redirect: manual, because a 301 on a canonical URL is a defect here
        // even when it eventually resolves. It leaks equity and it hides loops.
        const res = await fetch(url, {
          redirect: 'manual',
          headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
        });
        if (expected.includes(res.status)) {
          last = null;
          break;
        }
        last = { url, status: res.status, location: res.headers.get('location') || '' };
        // A rate limit is not a broken page. Back off and ask again.
        if (!RETRY_STATUSES.has(res.status)) break;
        await sleep(1200 * (attempt + 1));
      } catch (e) {
        last = { url, status: 'ERR', location: e.message.slice(0, 60) };
        await sleep(800 * (attempt + 1));
      }
    }
    if (last) bad.push(last);
    await sleep(60);
    done++;
    if (done % 100 === 0) process.stdout.write('  ' + done + '/' + urls.length + '\n');
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log('');
console.log('SMOKE');
console.log('  checked ' + urls.length);
console.log('  failed  ' + bad.length);

if (bad.length) {
  for (const b of bad.slice(0, 40)) {
    console.error('    ' + String(b.status).padEnd(5) + b.url + (b.location ? '  ->  ' + b.location : ''));
  }
  if (bad.length > 40) console.error('    ...and ' + (bad.length - 40) + ' more');
  process.exit(1);
}

console.log('');
console.log('  every url in the sitemap returns 200');
