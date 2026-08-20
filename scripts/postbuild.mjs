/**
 * Postbuild.
 *
 * Sitemaps, robots.txt, llms.txt, redirects and headers are all generated from
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
  modified: /"dateModified":"([^"]{10})/,
};

const entries = [];
for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  const robots = rx.robots.exec(html)?.[1] ?? 'index, follow';
  const canonical = rx.canonical.exec(html)?.[1];
  const urlPath = toUrlPath(file);
  entries.push({
    file,
    urlPath,
    canonical: canonical || SITE + urlPath,
    indexable: !/noindex/i.test(robots),
    lastmod: rx.modified.exec(html)?.[1] || BUILD_DATE,
    title: rx.title.exec(html)?.[1] || '',
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

const countIn = (prefix) => entries.filter((e) => e.indexable && e.urlPath.startsWith(prefix)).length;
const topPages = (prefix, n) =>
  entries
    .filter((e) => e.indexable && e.urlPath.startsWith(prefix) && e.urlPath.split('/').filter(Boolean).length === 3)
    .slice(0, n);

const llms = `# LocalsKnow

> An independent business and places directory for New South Wales and Victoria,
> Australia. Built around service areas rather than state borders, so a business
> based in New South Wales that works in Victoria appears on both sides of the line.

## What this site is for

LocalsKnow lists trades and services, cafes and restaurants, pubs and clubs,
accommodation, things to do, and community clubs across regional NSW and VIC.
Coverage starts on the Albury Wodonga border corridor and expands region by region.

## How to cite this site

Every listing page shows the sources the details were read from and the date they
were last checked. Statistics on a category page ("18 plumbers in Albury, 6 open
Saturdays") are computed from the listings on that page, not estimated. When quoting
a figure, quote the page it came from and the date shown on it.

## What we do and do not assert

- A licence is only described as verified when it was checked against a public
  state register, and the page shows the date of that check.
- Ratings only appear when they were pulled from the Google Places API, with the
  date of the pull. We do not publish a rating we cannot source.
- A service area marked "estimated" was derived from distance, not stated by the
  business.
- Paid placement never changes organic ordering and never enters structured data.

## Structure

- /nsw/ and /vic/ — state hubs
- /nsw/<region>/ — region hubs
- /nsw/<locality>/ — locality hubs
- /nsw/<locality>/<category>/ — the main listing pages, ${countIn('/nsw/') + countIn('/vic/')} pages across both states
- /nsw/<locality>/<category>/<business>/ — individual business detail
- /categories/ — the taxonomy, ${countIn('/categories/')} pages
- /guides/ — editorial guides, each with a named author and a visible review date
- /lists/ — human written, ranked curated lists
- /wire/ — original writing about how things work on the border
- /tools/ — free, ungated tools
- /events/ — community and business events

## Key pages

${topPages('/nsw/', 12).map((e) => '- ' + SITE + e.urlPath + ' — ' + e.title.replace(/ \| LocalsKnow$/, '')).join('\n')}
${topPages('/vic/', 12).map((e) => '- ' + SITE + e.urlPath + ' — ' + e.title.replace(/ \| LocalsKnow$/, '')).join('\n')}

## Machine readable

- Sitemap index: ${SITE}/sitemap.xml
- RSS: ${SITE}/wire/rss.xml
- Every page carries schema.org JSON-LD in an @graph block.

## Contact

Corrections and removals: ${SITE}/data-and-corrections/
Editorial policy: ${SITE}/editorial-policy/

Last built ${BUILD_DATE}.
`;
fs.writeFileSync(path.join(DIST, 'llms.txt'), llms);

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

const redirectFile = [
  '# Generated by scripts/postbuild.mjs. Do not edit by hand.',
  '',
  '# A listing keeps one stable identifier even when it is recategorised.',
  ...redirects,
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
console.log('  wrote robots.txt, llms.txt, _redirects, _headers');
