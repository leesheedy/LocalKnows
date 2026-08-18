/**
 * Build verifier.
 *
 * Walks every rendered page and asserts the things that are cheap to get wrong
 * at this page count: a dead internal link, two pages claiming the same
 * canonical, a page in the sitemap that says noindex, a missing H1, JSON-LD that
 * does not parse. Run with `npm run verify` after a build.
 *
 * Exit code 1 on any error so it can gate a deploy.
 */
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.join(process.cwd(), 'dist');
const SITE = (process.env.SITE_URL || 'https://localsknow.com.au').replace(/\/$/, '');

if (!fs.existsSync(DIST)) {
  console.error('no dist/, run npm run build first');
  process.exit(1);
}

const errors = [];
const warnings = [];

// ---------------------------------------------------------------- collect

const htmlFiles = [];
const allFiles = new Set();
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else {
      allFiles.add('/' + path.relative(DIST, full).split(path.sep).join('/'));
      if (entry.name.endsWith('.html')) htmlFiles.push(full);
    }
  }
};
walk(DIST);

const urlPathOf = (file) => {
  const rel = path.relative(DIST, file).split(path.sep);
  if (rel[rel.length - 1] === 'index.html') {
    const dir = rel.slice(0, -1).join('/');
    return dir ? '/' + dir + '/' : '/';
  }
  return '/' + rel.join('/');
};

const pageSet = new Set(htmlFiles.map(urlPathOf));

const rx = {
  title: /<title>([\s\S]*?)<\/title>/i,
  desc: /<meta name="description" content="([^"]*)"/i,
  canonical: /<link rel="canonical" href="([^"]*)"/i,
  robots: /<meta name="robots" content="([^"]*)"/i,
  lang: /<html lang="([^"]*)"/i,
  h1: /<h1[\s>]/gi,
  jsonld: /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  href: /\shref="(\/[^"#?]*)"/gi,
  imgNoAlt: /<img(?![^>]*\salt=)[^>]*>/gi,
  img: /<img\s[^>]*>/gi,
  imgSrc: /\ssrc="([^"]*)"/i,
  ogImage: /<meta property="og:image" content="([^"]*)"/i,
};

const canonicals = new Map();
const pages = [];

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const p = urlPathOf(file);
  // Titles are measured decoded. "&amp;" is one character to a search engine
  // and five to a regex, and the difference was flagging perfectly fine titles.
  const decode = (t) =>
    t
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'");
  const title = decode(rx.title.exec(html)?.[1]?.trim() ?? '');
  const desc = rx.desc.exec(html)?.[1] ?? '';
  const canonical = rx.canonical.exec(html)?.[1] ?? '';
  const robots = rx.robots.exec(html)?.[1] ?? '';
  const indexable = robots ? !/noindex/i.test(robots) : true;

  pages.push({ p, file, title, desc, canonical, indexable, size: html.length });

  // --- head essentials
  if (!title) errors.push(p + ' has no <title>');
  else if (title.length > 65) warnings.push(p + ' title is ' + title.length + ' chars: ' + title);
  if (!desc) errors.push(p + ' has no meta description');
  else if (desc.length > 165) warnings.push(p + ' description is ' + desc.length + ' chars');
  if (!rx.lang.exec(html)) errors.push(p + ' has no lang attribute');

  // --- canonical
  if (!canonical) {
    errors.push(p + ' has no canonical');
  } else {
    // The 404 is emitted as a file, not a directory, and its canonical points at
    // the route it represents. It is noindex, so the mismatch is intentional.
    const expected = p === '/404.html' ? SITE + '/404/' : SITE + p;
    if (canonical !== expected) errors.push(p + ' canonical points elsewhere: ' + canonical);
    if (canonicals.has(canonical)) {
      errors.push('duplicate canonical ' + canonical + ' on ' + p + ' and ' + canonicals.get(canonical));
    }
    canonicals.set(canonical, p);
  }

  // --- headings
  const h1s = (html.match(rx.h1) || []).length;
  if (h1s === 0) errors.push(p + ' has no H1');
  if (h1s > 1) errors.push(p + ' has ' + h1s + ' H1 elements');

  // --- structured data
  rx.jsonld.lastIndex = 0;
  let blocks = 0;
  let m;
  while ((m = rx.jsonld.exec(html))) {
    blocks++;
    try {
      const parsed = JSON.parse(m[1]);
      if (!parsed['@context']) errors.push(p + ' JSON-LD block has no @context');
      const nodes = parsed['@graph'] ?? [parsed];
      for (const node of nodes) {
        if (!node || !node['@type']) errors.push(p + ' JSON-LD node has no @type');
        if (node.aggregateRating && !/reviewBody|"review"/.test(html)) {
          errors.push(p + ' emits aggregateRating without visible reviews');
        }
      }
    } catch (e) {
      errors.push(p + ' has invalid JSON-LD: ' + e.message);
    }
  }
  if (blocks === 0) warnings.push(p + ' has no structured data');

  // --- images
  const noAlt = (html.match(rx.imgNoAlt) || []).length;
  if (noAlt > 0) warnings.push(p + ' has ' + noAlt + ' img without alt');

  for (const tag of html.match(rx.img) || []) {
    const src = (tag.match(rx.imgSrc) || [])[1];
    if (!src || !src.startsWith('/')) continue;

    // A business photo whose file did not ship is a broken image on a page
    // built to look credible, so it is an error rather than a warning.
    if (!allFiles.has(path.join(DIST, src.split('?')[0]))) {
      errors.push(p + ' references a missing image: ' + src);
    }

    // Dimensions are what stop the page reflowing when the image lands. They
    // are emitted from the file itself by src/lib/media.ts, so a tag without
    // them means something bypassed that path.
    if (!/\swidth="/.test(tag) || !/\sheight="/.test(tag)) {
      errors.push(p + ' has an img without width and height: ' + src);
    }
  }

  // --- weight
  if (html.length > 320_000) warnings.push(p + ' is ' + Math.round(html.length / 1024) + 'kb of HTML');
}

// ---------------------------------------------------------------- links

const linkTargets = new Map();
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const from = urlPathOf(file);
  rx.href.lastIndex = 0;
  let m;
  const seen = new Set();
  while ((m = rx.href.exec(html))) {
    let href = m[1];
    if (seen.has(href)) continue;
    seen.add(href);
    if (href.startsWith('//')) continue;
    // Assets resolve as files, pages as directories with an index.html.
    // Anything with an extension in its last segment is a file, which covers
    // .webmanifest and .xml as well as the short ones.
    const isAsset = /\/[^/]*\.[a-z0-9]+$/i.test(href);
    const ok = isAsset ? allFiles.has(href) : pageSet.has(href);
    if (!ok) {
      const list = linkTargets.get(href) ?? [];
      list.push(from);
      linkTargets.set(href, list);
    }
    if (!isAsset && !href.endsWith('/')) {
      errors.push(from + ' links to a path with no trailing slash: ' + href);
    }
  }
}

for (const [href, froms] of linkTargets) {
  errors.push(
    'dead internal link ' + href + ' (' + froms.length + ' page' + (froms.length === 1 ? '' : 's') + ', e.g. ' + froms[0] + ')',
  );
}

// ---------------------------------------------------------------- orphans

const linkedTo = new Set();
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  rx.href.lastIndex = 0;
  let m;
  while ((m = rx.href.exec(html))) linkedTo.add(m[1]);
}
const orphans = pages.filter((p) => p.indexable && p.p !== '/' && !linkedTo.has(p.p));
for (const o of orphans.slice(0, 20)) warnings.push('orphan page, nothing links to it: ' + o.p);
if (orphans.length > 20) warnings.push('...and ' + (orphans.length - 20) + ' more orphan pages');

// ---------------------------------------------------------------- sitemap

const sitemapIndex = path.join(DIST, 'sitemap.xml');
let sitemapUrls = 0;
if (!fs.existsSync(sitemapIndex)) {
  errors.push('no sitemap.xml');
} else {
  const idx = fs.readFileSync(sitemapIndex, 'utf8');
  const children = [...idx.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (!children.length) errors.push('sitemap.xml lists no child sitemaps');
  for (const child of children) {
    const name = child.split('/').pop();
    const p = path.join(DIST, name);
    if (!fs.existsSync(p)) {
      errors.push('sitemap index points at a missing file: ' + name);
      continue;
    }
    const xml = fs.readFileSync(p, 'utf8');
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      sitemapUrls++;
      const urlPath = m[1].replace(SITE, '');
      const page = pages.find((x) => x.p === urlPath);
      if (!page) errors.push('sitemap lists a URL that was not built: ' + m[1]);
      else if (!page.indexable) errors.push('sitemap lists a noindex page: ' + m[1]);
    }
  }
}

for (const f of ['robots.txt', 'llms.txt', '_headers', '_redirects', '404.html']) {
  if (!fs.existsSync(path.join(DIST, f))) errors.push('missing ' + f);
}

// ---------------------------------------------------------------- report

const indexable = pages.filter((p) => p.indexable).length;
const avgKb = Math.round(pages.reduce((t, p) => t + p.size, 0) / pages.length / 1024);
const biggest = pages.slice().sort((a, b) => b.size - a.size)[0];

console.log('');
console.log('VERIFY');
console.log('  pages            ' + pages.length);
console.log('  indexable        ' + indexable);
console.log('  noindex, follow  ' + (pages.length - indexable));
console.log('  sitemap urls     ' + sitemapUrls);
console.log('  avg page         ' + avgKb + 'kb');
console.log('  largest          ' + Math.round(biggest.size / 1024) + 'kb  ' + biggest.p);
console.log('  internal links   ' + linkedTo.size + ' distinct targets');

if (warnings.length) {
  console.log('');
  console.log('  ' + warnings.length + ' warnings');
  for (const w of warnings.slice(0, 30)) console.log('    ' + w);
  if (warnings.length > 30) console.log('    ...and ' + (warnings.length - 30) + ' more');
}

if (errors.length) {
  console.error('');
  console.error('  ' + errors.length + ' ERRORS');
  const shown = errors.slice(0, 60);
  for (const e of shown) console.error('    ' + e);
  if (errors.length > shown.length) console.error('    ...and ' + (errors.length - shown.length) + ' more');
  console.error('');
  process.exit(1);
}

console.log('');
console.log('  verify clean');
