/**
 * Postbuild.
 *
 * Sitemaps, robots.txt, llms.txt, llms-full.txt, redirects and headers are all generated from
 * what actually got built, not from what the data layer thinks got built. The
 * sitemap is assembled by reading the rendered <meta name="robots"> off every
 * page, so a noindex page can never appear in it. That is the one guarantee
 * worth having, and it cannot be made by generating the sitemap from the model.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const SITE = (process.env.SITE_URL || 'https://localsknow.com.au').replace(/\/$/, '');
const BUILD_DATE = process.env.BUILD_DATE || new Date().toISOString().slice(0, 10);
const MAX_PER_SITEMAP = 45000;

if (!fs.existsSync(DIST)) {
  console.error('no dist/, run astro build first');
  process.exit(1);
}

// ---------------------------------------------------------------- walk

const pages = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name === 'index.html') pages.push(full);
  }
};
walk(DIST);

const toUrlPath = (file) => {
  const rel = path.relative(DIST, file).split(path.sep).slice(0, -1).join('/');
  return rel ? '/' + rel + '/' : '/';
};

const rx = {
  robots: /<meta name="robots" content="([^"]*)"/i,
  canonical: /<link rel="canonical" href="([^"]*)"/i,
  title: /<title>([^<]*)<\/title>/i,
  desc: /<meta name="description" content="([^"]*)"/i,
  modified: /"dateModified":"([^"]{10})/,
  jsonld: /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i,
};

const decodeHtml = (t) =>
  t
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/**
 * What a page says about itself, read off the page.
 *
 * llms.txt quotes each hub's "In short" from the WebPage node's abstract and
 * orders money pages by the ItemList's numberOfItems, both as rendered. So the
 * summary an answer engine reads is the one a person reads at the top of the
 * page, and llms.txt cannot describe a page differently from how it describes
 * itself.
 */
const readGraph = (html) => {
  const m = rx.jsonld.exec(html);
  if (!m) return [];
  try {
    const parsed = JSON.parse(m[1]);
    return parsed['@graph'] ?? [parsed];
  } catch {
    return [];
  }
};

const entries = [];
for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  const robots = rx.robots.exec(html)?.[1] ?? 'index, follow';
  const canonical = rx.canonical.exec(html)?.[1];
  const urlPath = toUrlPath(file);
  const indexable = !/noindex/i.test(robots);
  const nodes = indexable ? readGraph(html) : [];
  const webpage = nodes.find((n) => typeof n['@id'] === 'string' && n['@id'].endsWith('#webpage'));
  const itemList = nodes.find((n) => typeof n['@id'] === 'string' && n['@id'].endsWith('#listings'));
  entries.push({
    file,
    urlPath,
    canonical: canonical || SITE + urlPath,
    indexable,
    lastmod: rx.modified.exec(html)?.[1] || BUILD_DATE,
    title: rx.title.exec(html)?.[1] || '',
    description: decodeHtml(rx.desc.exec(html)?.[1] || ''),
    abstract: webpage?.abstract || '',
    items: typeof itemList?.numberOfItems === 'number' ? itemList.numberOfItems : 0,
    organisation: urlPath === '/about/' ? nodes.find((n) => n['@type'] === 'Organization') : undefined,
  });
}

// ---------------------------------------------------------------- classify

const bucketFor = (p) => {
  if (p === '/') return 'core';
  const parts = p.split('/').filter(Boolean);
  const head = parts[0];

  if (head === 'nsw' || head === 'vic') {
    const state = head;
    if (parts.length === 1) return 'core';
    if (parts.length === 2) return 'places-' + state;
    if (parts.length === 3) return parts[2] === 'events' ? 'editorial' : 'directory-' + state;
    // Four segments is either a modifier page or a business detail page. Both
    // belong in the state directory sitemap, but businesses get their own file
    // because they are the ones that churn.
    if (parts.length >= 4) return parts[3] === 'page' ? 'directory-' + state : 'businesses-' + state;
  }
  if (head === 'categories') return 'categories';
  if (['guides', 'lists', 'wire', 'events', 'tools'].includes(head)) return 'editorial';
  return 'core';
};

const buckets = new Map();
for (const e of entries) {
  if (!e.indexable) continue;
  const b = bucketFor(e.urlPath);
  const list = buckets.get(b) ?? [];
  list.push(e);
  buckets.set(b, list);
}

const priorityFor = (p) => {
  if (p === '/') return '1.0';
  const parts = p.split('/').filter(Boolean);
  if (parts.length === 1) return ['nsw', 'vic'].includes(parts[0]) ? '0.9' : '0.5';
  if (parts.length === 2) return '0.8';
  if (parts.length === 3) return '0.9';
  if (parts.length === 4) return '0.6';
  return '0.4';
};

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const writeSitemap = (name, rows) => {
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    rows
      .map(
        (e) =>
          '  <url><loc>' +
          esc(e.canonical) +
          '</loc><lastmod>' +
          e.lastmod +
          '</lastmod><priority>' +
          priorityFor(e.urlPath) +
          '</priority></url>',
      )
      .join('\n') +
    '\n</urlset>\n';
  fs.writeFileSync(path.join(DIST, name), xml);
  return name;
};

const files = [];
for (const [bucket, rows] of [...buckets.entries()].sort()) {
  rows.sort((a, b) => a.urlPath.localeCompare(b.urlPath));
  if (rows.length <= MAX_PER_SITEMAP) {
    files.push({ name: writeSitemap('sitemap-' + bucket + '.xml', rows), count: rows.length });
  } else {
    for (let i = 0; i * MAX_PER_SITEMAP < rows.length; i++) {
      const slice = rows.slice(i * MAX_PER_SITEMAP, (i + 1) * MAX_PER_SITEMAP);
      files.push({
        name: writeSitemap('sitemap-' + bucket + '-' + (i + 1) + '.xml', slice),
        count: slice.length,
      });
    }
  }
}

const index =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  files
    .map((f) => '  <sitemap><loc>' + SITE + '/' + f.name + '</loc><lastmod>' + BUILD_DATE + '</lastmod></sitemap>')
    .join('\n') +
  '\n</sitemapindex>\n';
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), index);

// ---------------------------------------------------------------- robots.txt

const robots = `# ${SITE}
# Directory of businesses and places across New South Wales and Victoria.

User-agent: *
Allow: /
Disallow: /search/
Disallow: /*?
Disallow: /api/

# Answer engines are a real referral channel for a directory and the content
# here is meant to be quotable. Attribution is the only ask.
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Perplexity-User
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: Bingbot
Allow: /

User-agent: cohere-ai
Allow: /

User-agent: Meta-ExternalAgent
Allow: /

# Scrapers that take the whole directory and give nothing back.
User-agent: SemrushBot
Disallow: /

User-agent: AhrefsBot
Disallow: /

User-agent: MJ12bot
Disallow: /

User-agent: DotBot
Disallow: /

Sitemap: ${SITE}/sitemap.xml
`;
fs.writeFileSync(path.join(DIST, 'robots.txt'), robots);

// ---------------------------------------------------------------- llms.txt

/*
 * llms.txt and llms-full.txt.
 *
 * An answer engine asked "who are the plumbers in Albury" or "what is
 * LocalsKnow" wants three things from a site it might cite: what the site is
 * and who stands behind it, how its facts were got and when, and which page
 * answers which question. This writes all three from the build itself:
 *
 *   - the entity facts from the Organization node on /about/, as rendered;
 *   - the counts and dates from listings.json and the geo files;
 *   - the page list from pages that rendered as indexable, each quoted by its
 *     own "In short" (the WebPage abstract) and ordered by its own ItemList.
 *
 * Town order is by population, a fact about the place, never by how many
 * listings we happen to hold. llms.txt is the short version with the pages most
 * worth citing; llms-full.txt is every indexable hub and money page.
 */
const readJson = (rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : undefined;
};
const geo = [readJson('src/data/geo-nsw.json'), readJson('src/data/geo-vic.json')].filter(Boolean);
const taxonomy = readJson('src/data/categories.json');
const allListings = (readJson('src/data/listings.json') ?? []).filter((l) => l.status !== 'suspended');

const localityByPath = new Map();
const regionByPath = new Map();
for (const g of geo) {
  for (const l of g.localities) localityByPath.set('/' + l.state.toLowerCase() + '/' + l.slug + '/', l);
  for (const r of g.regions) regionByPath.set('/' + r.state.toLowerCase() + '/' + r.slug + '/', r);
}
const categorySlugs = new Set((taxonomy?.categories ?? []).map((c) => c.slug));

const segs = (p) => p.split('/').filter(Boolean);
const indexed = entries.filter((e) => e.indexable);
const cleanTitle = (t) => decodeHtml(t).replace(/ \| LocalsKnow$/, '');
const summaryOf = (e) => e.abstract || e.description;
const line = (e, label) => '- [' + (label || cleanTitle(e.title)) + '](' + e.canonical + '): ' + summaryOf(e);

const townHubs = indexed
  .filter((e) => segs(e.urlPath).length === 2 && localityByPath.has(e.urlPath))
  .map((e) => ({ e, locality: localityByPath.get(e.urlPath) }))
  .sort((a, b) => (b.locality.population ?? 0) - (a.locality.population ?? 0) || a.locality.name.localeCompare(b.locality.name));
const regionHubs = indexed.filter((e) => segs(e.urlPath).length === 2 && regionByPath.has(e.urlPath));
const stateHubs = indexed.filter((e) => ['/nsw/', '/vic/'].includes(e.urlPath));
const moneyPages = indexed.filter((e) => {
  const s = segs(e.urlPath);
  return (s[0] === 'nsw' || s[0] === 'vic') && s.length === 3 && categorySlugs.has(s[2]);
});
const moneyByTown = new Map();
for (const e of moneyPages) {
  const town = '/' + segs(e.urlPath).slice(0, 2).join('/') + '/';
  const list = moneyByTown.get(town) ?? [];
  list.push(e);
  moneyByTown.set(town, list);
}
for (const list of moneyByTown.values()) list.sort((a, b) => b.items - a.items || a.urlPath.localeCompare(b.urlPath));
const categoryHubs = indexed
  .filter((e) => segs(e.urlPath)[0] === 'categories' && segs(e.urlPath).length === 2)
  .sort((a, b) => a.urlPath.localeCompare(b.urlPath));
const editorial = (head) => indexed.filter((e) => segs(e.urlPath)[0] === head && segs(e.urlPath).length === 2);

const org = entries.find((e) => e.urlPath === '/about/')?.organisation ?? {};
const pub = org.parentOrganization ?? {};
const pubAddress = pub.address
  ? [pub.address.addressLocality, pub.address.addressRegion, pub.address.postalCode].filter(Boolean).join(' ')
  : '';
const regionsCovered = (org.areaServed ?? []).map((a) => a.name + ' (' + (a.containedInPlace?.name ?? '') + ')');
const checkedDates = allListings.map((l) => (l.lastCheckedAt ?? '').slice(0, 10)).filter(Boolean).sort();
const fmtDate = (iso) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
// Same wording as checkedPhrase() in src/lib/copy.ts, so the file reads like the pages.
const firstChecked = checkedDates[0];
const lastChecked = checkedDates[checkedDates.length - 1];
const checkedLine = !checkedDates.length
  ? ''
  : firstChecked === lastChecked
    ? 'on ' + fmtDate(lastChecked)
    : firstChecked.slice(0, 7) === lastChecked.slice(0, 7)
      ? 'between ' + Number(firstChecked.slice(8, 10)) + ' and ' + fmtDate(lastChecked)
      : 'between ' + fmtDate(firstChecked) + ' and ' + fmtDate(lastChecked);

const LEAD_TOWNS = 8;
const PAGES_PER_TOWN = 8;
const leadTowns = townHubs.filter((t) => moneyByTown.has(t.e.urlPath)).slice(0, LEAD_TOWNS);

const intro = `# LocalsKnow

> LocalsKnow (localsknow.com.au) is an independent online directory of businesses,
> clubs and places in the New South Wales and Victoria border country${pub.name ? ', published by ' + pub.name + (pubAddress ? ' of ' + pubAddress : '') : ''}.
> Where a business is based and where it works are recorded separately, so a business
> based on one side of the Murray that works on the other appears on both sides.

## In short

- Listings: ${allListings.length.toLocaleString('en-AU')} businesses, on ${townHubs.length} town pages and ${moneyPages.length} town and category pages that are open to search engines.
${regionsCovered.length ? '- Regions covered: ' + regionsCovered.join(', ') + '.\n' : ''}- Largest towns covered: ${townHubs.slice(0, 6).map((t) => t.locality.name + ' ' + t.locality.state).join(', ')}.
- Sources: each listing is compiled from public sources, such as the business's own website and council and tourism listings, and its page shows the URLs its details were read from and the date they were last read. Anything that could not be sourced is left blank.
${checkedLine ? '- Dates: listing details were last read from their sources ' + checkedLine + '. Counts and pages were rebuilt on ' + fmtDate(BUILD_DATE) + '.\n' : ''}- Name: written as one word, LocalsKnow${(org.alternateName ?? []).length ? '. Also written ' + org.alternateName.map((x) => '"' + x + '"').join(', ') : ''}.

## How to cite this site

Every town and category page opens with an "In short" paragraph and a data block
counted from the listings on that page ("18 plumbers in Albury, 6 open Saturdays").
Those figures are counts, not estimates. When quoting one, cite the page it came
from and the date shown on it, because the numbers move as listings are added.

## What we do and do not assert

- A licence is only described as verified when it was checked against a public
  state register, and the page shows the date of that check. A licence number read
  off a business's own material is shown as published, not as checked.
- Ratings only appear when they were pulled from the Google Places API, with the
  date of the pull. We do not publish a rating we cannot source.
- A service area marked "estimated" was derived from distance, not stated by the
  business.
- Paid placement never changes organic ordering and never enters structured data.
`;

const townSection = (withPages) =>
  '## Town pages, largest town first\n\n' +
  townHubs.map((t) => line(t.e, t.locality.name + ', ' + t.locality.state)).join('\n') +
  '\n' +
  (withPages
    ? '\n## Town and category pages, by town\n\n' +
      townHubs
        .filter((t) => moneyByTown.has(t.e.urlPath))
        .map(
          (t) =>
            '### ' + t.locality.name + ', ' + t.locality.state + '\n\n' + moneyByTown.get(t.e.urlPath).map((e) => line(e)).join('\n'),
        )
        .join('\n\n') +
      '\n'
    : '\n## Where to look first\n\nThe fullest pages in the largest towns. Each one lists businesses that work in that\ntown, with contact details, hours where published, and sources.\n\n' +
      leadTowns
        .map(
          (t) =>
            '### ' +
            t.locality.name +
            ', ' +
            t.locality.state +
            '\n\n' +
            moneyByTown
              .get(t.e.urlPath)
              .slice(0, PAGES_PER_TOWN)
              .map((e) => line(e))
              .join('\n'),
        )
        .join('\n\n') +
      '\n');

const tail = (full) => `
## State and region pages

${[...stateHubs, ...regionHubs].map((e) => line(e)).join('\n')}

## Category pages

${full ? categoryHubs.map((e) => line(e)).join('\n') : '- ' + SITE + '/categories/: every category, ' + categoryHubs.length + ' with listings, each linking to the towns where it is live.'}

## Guides, lists and tools

${[...editorial('guides'), ...editorial('tools')].map((e) => '- [' + cleanTitle(e.title) + '](' + e.canonical + ')').join('\n')}
- ${SITE}/lists/: curated lists. A list a person wrote is labelled as written; a list compiled by a rule prints the rule.
- ${SITE}/wire/: data driven articles, every sentence a count over the listings.

## Machine readable

- Sitemap index: ${SITE}/sitemap.xml
- Every page carries schema.org JSON-LD in an @graph block. Town and category pages put their "In short" in the WebPage abstract.
- RSS: ${SITE}/wire/rss.xml
${full ? '' : '- Full page index with a summary for every town and category page: ' + SITE + '/llms-full.txt\n'}
## Contact

- About the site and who runs it: ${SITE}/about/
${org.email ? '- Email: ' + org.email + '\n' : ''}- Contact: ${SITE}/contact/
- Corrections and removals: ${SITE}/data-and-corrections/
- Editorial policy: ${SITE}/editorial-policy/
${pub.name ? '- Publisher: ' + pub.name + (pub.legalName ? ' (' + pub.legalName + ')' : '') + (pubAddress ? ', ' + pubAddress : '') + (pub.url ? ', ' + pub.url : '') + '\n' : ''}
Last built ${BUILD_DATE}.
`;

const llms = intro + '\n' + townSection(false) + tail(false);
const llmsFull = intro + '\n' + townSection(true) + tail(true);
fs.writeFileSync(path.join(DIST, 'llms.txt'), llms);
fs.writeFileSync(path.join(DIST, 'llms-full.txt'), llmsFull);

// ---------------------------------------------------------------- redirects

const redirects = [];
const listingsPath = path.join(ROOT, 'src', 'data', 'listings.json');
if (fs.existsSync(listingsPath)) {
  const listings = JSON.parse(fs.readFileSync(listingsPath, 'utf8'));
  const byPath = new Map(
    entries
      .filter((e) => e.urlPath.split('/').filter(Boolean).length === 4)
      .map((e) => [e.urlPath.split('/').filter(Boolean)[3], e.urlPath]),
  );
  for (const l of listings) {
    const target = byPath.get(l.slug);
    if (!target) continue;
    redirects.push('/business/' + l.slug + '/  ' + target + '  301');
    // Slugs that were merged into this listing. Two research clusters found the
    // same business, one record won, and the loser's URL still has to resolve.
    for (const old of l.mergedFrom || []) {
      redirects.push('/business/' + old + '/  ' + target + '  301');
    }
  }
}

/**
 * Themed and guide pages come and go as thresholds move.
 *
 * /nsw/jindera/with-kids/ existed yesterday and does not today, because the
 * threshold now counts businesses based in the town rather than driving through
 * it. That is the right call for the page and the wrong outcome for the URL:
 * the rule this site runs on is that nothing simply stops resolving.
 *
 * A placeholder rule sends any of these that has no page to its town hub.
 * Netlify only applies a non forced redirect when no file matches, so the towns
 * that DO have the page are untouched.
 */
const SOFT_PAGES = [
  'new-in-town',
  'hidden-gems',
  'nightlife',
  'with-kids',
  'dog-friendly',
  'breakfast-and-brunch',
  'free-things-to-do',
];
const softRedirects = [];
for (const state of ['nsw', 'vic']) {
  for (const slug of SOFT_PAGES) {
    softRedirects.push('/' + state + '/:place/' + slug + '/  /' + state + '/:place/  301');
  }
}

/**
 * Full listing URLs that Google holds and that moved.
 *
 * The /business/ alias covers a slug, but a listing that changes category or
 * town changes its full URL too, and Search Console reported these as 404s in
 * October 2026. Each goes straight to where the listing lives now. The rule
 * after them catches the next one: any listing shaped path with no file goes
 * through /business/<slug>/, which resolves the slug or falls back to search.
 */
const MOVED_LISTINGS = [
  ['/vic/beechworth/bars/bridge-road-brewers/', '/vic/beechworth/breweries/bridge-road-brewers-beechworth/'],
  ['/nsw/albury/bars/the-thirsty-devil-brewery/', '/nsw/albury/breweries/the-thirsty-devil-brewery-south-albury/'],
  ['/nsw/lake-albert/swimming-spots/lake-albert/', '/nsw/wagga-wagga/swimming-spots/lake-albert/'],
  ['/nsw/wagga-wagga/takeaway/knights-deli-wagga-wagga/', '/nsw/wagga-wagga/butchers/knights-deli-wagga-wagga/'],
].filter(([, to]) => fs.existsSync(path.join(DIST, to, 'index.html')));
const movedRedirects = [
  ...MOVED_LISTINGS.map(([from, to]) => from + '  ' + to + '  301'),
  ...['nsw', 'vic'].map((s) => '/' + s + '/:place/:category/:slug/  /business/:slug/  301'),
];

const redirectFile = [
  '# Generated by scripts/postbuild.mjs. Do not edit by hand.',
  '',
  '# A listing keeps one stable identifier even when it is recategorised.',
  ...redirects,
  '',
  '# Listing URLs that moved. The placeholder rules only fire where no file exists.',
  ...movedRedirects,
  '',
  '# A themed or guide page that fell below its threshold sends you to the town',
  '# rather than a 404. Only fires where no file exists.',
  ...softRedirects,
  '',
  '# Legacy shapes.',
  '/business/*  /search/?q=:splat  301',
  '',
  '# No trailing slash rules here on purpose. Netlify already 301s /nsw to /nsw/',
  '# for directory output, and a forced rule saying the same thing also matches',
  '# /nsw/ and redirects it to itself. That took both state hubs down with an',
  '# infinite loop while every local check passed, because only production was',
  '# broken. scripts/smoke.mjs now checks the deployed sitemap for exactly this.',
  '',
].join('\n');
fs.writeFileSync(path.join(DIST, '_redirects'), redirectFile);

// ---------------------------------------------------------------- headers

const headers = `/*
  X-Frame-Options: SAMEORIGIN
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), camera=(), microphone=(), interest-cohort=()
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload

/fonts/*
  Cache-Control: public, max-age=31536000, immutable

/_astro/*
  Cache-Control: public, max-age=31536000, immutable

/*.woff2
  Cache-Control: public, max-age=31536000, immutable

/brand/*
  Cache-Control: public, max-age=604800

/og/*
  Cache-Control: public, max-age=604800

/favicon.ico
  Cache-Control: public, max-age=604800

/favicon.svg
  Cache-Control: public, max-age=604800

/sitemap*.xml
  Cache-Control: public, max-age=3600
  Content-Type: application/xml; charset=utf-8

/llms.txt
  Content-Type: text/plain; charset=utf-8
  Cache-Control: public, max-age=3600

/llms-full.txt
  Content-Type: text/plain; charset=utf-8
  Cache-Control: public, max-age=3600
`;
fs.writeFileSync(path.join(DIST, '_headers'), headers);

// ---------------------------------------------------------------- report

const indexable = entries.filter((e) => e.indexable).length;
console.log('');
console.log('POSTBUILD');
console.log('  pages built     ' + entries.length);
console.log('  indexable       ' + indexable);
console.log('  noindex, follow ' + (entries.length - indexable));
console.log('  sitemap files   ' + files.length);
for (const f of files) console.log('    ' + f.name.padEnd(30) + f.count);
console.log('  redirects       ' + redirects.length);
console.log('  llms.txt        ' + Math.round(llms.length / 1024) + 'kb, llms-full.txt ' + Math.round(llmsFull.length / 1024) + 'kb');
console.log('  wrote robots.txt, llms.txt, llms-full.txt, _redirects, _headers');
