/**
 * On page SEO audit.
 *
 * `verify-build.mjs` is a gate: it fails the build on things that are broken.
 * This is a report: it measures things that are legal but weak, so they can be
 * ranked and fixed rather than blocking a deploy.
 *
 * Run: node scripts/audit-seo.mjs
 *      node scripts/audit-seo.mjs --json
 */
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.join(process.cwd(), 'dist');
const SITE = (process.env.SITE_URL || 'https://localsknow.com.au').replace(/\/$/, '');
const asJson = process.argv.includes('--json');

const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.name.endsWith('.html')) files.push(full);
  }
};
walk(DIST);

const decode = (t) =>
  t
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    // Astro escapes " as &#34; and & as &#38;. Counting those raw made three
    // descriptions look over budget when the text was well inside it.
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
    .replace(/&middot;/g, '·')
    .replace(/&nbsp;/g, ' ');

const rx = {
  title: /<title>([\s\S]*?)<\/title>/i,
  desc: /<meta name="description" content="([^"]*)"/i,
  robots: /<meta name="robots" content="([^"]*)"/i,
  canonical: /<link rel="canonical" href="([^"]*)"/i,
  h1: /<h1[^>]*>([\s\S]*?)<\/h1>/i,
  h2: /<h2[^>]*>/gi,
  ogimg: /<meta property="og:image" content="([^"]*)"/i,
  jsonld: /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i,
  words: /<(?:p|li|td|h[1-6])[^>]*>([\s\S]*?)<\/(?:p|li|td|h[1-6])>/gi,
};

const urlPathOf = (f) => {
  const rel = path.relative(DIST, f).split(path.sep);
  if (rel[rel.length - 1] === 'index.html') {
    const d = rel.slice(0, -1).join('/');
    return d ? '/' + d + '/' : '/';
  }
  return '/' + rel.join('/');
};

const kindOf = (p) => {
  if (p === '/') return 'home';
  const s = p.split('/').filter(Boolean);
  if (['nsw', 'vic'].includes(s[0])) {
    if (s.length === 1) return 'state';
    if (s.length === 2) return 'place';
    if (s.length === 3) return s[2] === 'events' ? 'locality-events' : 'money';
    if (s[3] === 'page') return 'pagination';
    return 'business';
  }
  if (s[0] === 'categories') return s.length === 1 ? 'category-index' : 'category';
  if (['guides', 'lists', 'wire', 'tools', 'events'].includes(s[0])) return s.length === 1 ? s[0] + '-index' : s[0];
  return 'static';
};

const pages = [];
for (const f of files) {
  const html = fs.readFileSync(f, 'utf8');
  const p = urlPathOf(f);
  const title = decode((rx.title.exec(html)?.[1] ?? '').trim());
  const desc = decode(rx.desc.exec(html)?.[1] ?? '');
  const robots = rx.robots.exec(html)?.[1] ?? '';
  const h1 = decode((rx.h1.exec(html)?.[1] ?? '').replace(/<[^>]+>/g, '').trim());

  let words = 0;
  rx.words.lastIndex = 0;
  let m;
  while ((m = rx.words.exec(html))) {
    words += m[1].replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  }

  let types = [];
  const ld = rx.jsonld.exec(html);
  if (ld) {
    try {
      const parsed = JSON.parse(ld[1]);
      types = (parsed['@graph'] ?? [parsed]).map((n) => n['@type']).filter(Boolean);
    } catch {
      types = ['INVALID'];
    }
  }

  pages.push({
    p,
    kind: kindOf(p),
    title,
    desc,
    h1,
    words,
    types,
    indexable: robots ? !/noindex/i.test(robots) : true,
    ogimg: rx.ogimg.exec(html)?.[1] ?? '',
    size: html.length,
  });
}

const indexable = pages.filter((x) => x.indexable);

// ---------------------------------------------------------------- checks

const issues = [];
const add = (sev, code, page, detail) => issues.push({ sev, code, page, detail });

// Descriptions
const descSeen = new Map();
for (const x of indexable) {
  if (!x.desc) add('high', 'desc-missing', x.p, '');
  else {
    if (x.desc.length < 70) add('med', 'desc-short', x.p, x.desc.length + ' chars: ' + x.desc);
    if (x.desc.length > 158) add('med', 'desc-long', x.p, x.desc.length + ' chars');
    if (x.desc.endsWith('…')) add('low', 'desc-truncated', x.p, x.desc.slice(-60));
    if (/^\d+ /.test(x.desc) === false && x.kind === 'money') {
      // money pages should lead with the count, that is the differentiator
    }
    const key = x.desc.toLowerCase();
    const prev = descSeen.get(key);
    if (prev) add('high', 'desc-duplicate', x.p, 'same as ' + prev);
    else descSeen.set(key, x.p);
  }
}

// Titles
const titleSeen = new Map();
for (const x of indexable) {
  if (!x.title) add('high', 'title-missing', x.p, '');
  else {
    if (x.title.length > 60) add('low', 'title-long', x.p, x.title.length + ' chars');
    if (x.title.length < 20) add('med', 'title-short', x.p, x.title);
    const key = x.title.toLowerCase();
    const prev = titleSeen.get(key);
    if (prev) add('high', 'title-duplicate', x.p, 'same as ' + prev);
    else titleSeen.set(key, x.p);
  }
  if (!x.h1) add('high', 'h1-missing', x.p, '');
  if (x.h1 && x.title && x.h1.toLowerCase() === x.title.toLowerCase()) {
    add('low', 'h1-equals-title', x.p, '');
  }
}

// Thin content on indexable pages
for (const x of indexable) {
  if (x.words < 180) add('high', 'thin', x.p, x.words + ' words');
  else if (x.words < 300) add('med', 'thinnish', x.p, x.words + ' words');
}

// Structured data coverage
for (const x of indexable) {
  if (!x.types.length) add('high', 'no-schema', x.p, '');
  if (x.types.includes('INVALID')) add('high', 'schema-invalid', x.p, '');
  if (x.kind === 'business' && !x.types.some((t) => t !== 'Organization' && t !== 'WebSite' && t !== 'BreadcrumbList' && t !== 'WebPage' && t !== 'ItemPage' && t !== 'FAQPage')) {
    add('med', 'business-no-localbusiness', x.p, x.types.join(','));
  }
  if (!x.ogimg) add('low', 'og-missing', x.p, '');
}

// ---------------------------------------------------------------- report

const byKind = {};
for (const x of pages) {
  byKind[x.kind] = byKind[x.kind] ?? { total: 0, indexable: 0, words: [], desc: [], title: [] };
  byKind[x.kind].total++;
  if (x.indexable) {
    byKind[x.kind].indexable++;
    byKind[x.kind].words.push(x.words);
    byKind[x.kind].desc.push(x.desc.length);
    byKind[x.kind].title.push(x.title.length);
  }
}

const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
const counts = {};
for (const i of issues) counts[i.code] = (counts[i.code] ?? 0) + 1;

if (asJson) {
  console.log(JSON.stringify({ pages: pages.length, indexable: indexable.length, counts, issues }, null, 1));
} else {
  console.log('');
  console.log('SEO AUDIT  ' + SITE);
  console.log('  pages ' + pages.length + ', indexable ' + indexable.length);
  console.log('');
  console.log('  ' + 'page type'.padEnd(18) + 'total'.padStart(6) + 'index'.padStart(7) + 'med words'.padStart(11) + 'med desc'.padStart(10) + 'med title'.padStart(11));
  for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1].total - a[1].total)) {
    console.log(
      '  ' + k.padEnd(18) + String(v.total).padStart(6) + String(v.indexable).padStart(7) +
      String(med(v.words)).padStart(11) + String(med(v.desc)).padStart(10) + String(med(v.title)).padStart(11),
    );
  }

  console.log('');
  console.log('  findings, indexable pages only');
  const order = { high: 0, med: 1, low: 2 };
  const grouped = Object.entries(counts).sort((a, b) => {
    const sa = issues.find((i) => i.code === a[0]).sev;
    const sb = issues.find((i) => i.code === b[0]).sev;
    return order[sa] - order[sb] || b[1] - a[1];
  });
  if (!grouped.length) console.log('    nothing to report');
  for (const [code, count] of grouped) {
    const sev = issues.find((i) => i.code === code).sev;
    console.log('    [' + sev.toUpperCase().padEnd(4) + '] ' + String(count).padStart(5) + '  ' + code);
    for (const ex of issues.filter((i) => i.code === code).slice(0, 3)) {
      console.log('             ' + ex.page + (ex.detail ? '  ' + ex.detail.slice(0, 90) : ''));
    }
  }
  console.log('');
}
