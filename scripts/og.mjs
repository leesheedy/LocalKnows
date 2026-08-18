/**
 * Open Graph images.
 *
 * Built from SVG at build time rather than checked in as binaries, so the
 * palette and wordmark stay in one place. Rasterised with sharp when it is
 * installed; without it the SVGs are still written and the default PNG that
 * ships in the repo is used, because a missing optional dependency should not
 * fail a build.
 *
 * Run: node scripts/og.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'public', 'og');
const DATA = path.join(ROOT, 'src', 'data');
fs.mkdirSync(OUT, { recursive: true });

const INK = '#131E19';
const PAPER = '#EFEDE4';
const RIVER = '#1F6B5C';
const WATTLE = '#E8B21F';

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Wrap a headline onto at most three lines at a rough character budget. */
const wrap = (text, perLine = 22, maxLines = 3) => {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > perLine && line) {
      lines.push(line);
      line = w;
    } else {
      line = (line + ' ' + w).trim();
    }
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
};

const card = ({ eyebrow, headline, footnote }) => {
  const lines = wrap(headline);
  const size = lines.length >= 3 ? 66 : lines.length === 2 ? 78 : 90;
  const startY = 300 - ((lines.length - 1) * size * 1.06) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="Segoe UI, Helvetica, Arial, sans-serif">
  <rect width="1200" height="630" fill="${PAPER}"/>
  <rect x="0" y="0" width="1200" height="8" fill="${WATTLE}"/>

  <g opacity="0.5">
    <path d="M0 588 C 180 556, 320 620, 520 588 S 900 556, 1200 596" stroke="${RIVER}" stroke-width="3" fill="none" stroke-dasharray="10 9"/>
    <path d="M0 612 C 200 584, 340 644, 560 612 S 940 584, 1200 620" stroke="${RIVER}" stroke-width="2" fill="none" stroke-dasharray="10 9" opacity="0.55"/>
  </g>

  <g transform="translate(72,74)">
    <rect x="0" y="-22" width="5" height="30" fill="${WATTLE}" transform="skewX(-14)"/>
    <text x="18" y="2" font-size="30" font-weight="800" fill="${INK}" letter-spacing="-1.4">LocalKnows</text>
  </g>

  <text x="72" y="180" font-size="21" font-weight="600" fill="${RIVER}" letter-spacing="3.4">${esc(String(eyebrow).toUpperCase())}</text>

  ${lines
    .map(
      (l, i) =>
        `<text x="72" y="${startY + i * size * 1.06}" font-size="${size}" font-weight="800" fill="${INK}" letter-spacing="-2.6">${esc(l)}</text>`,
    )
    .join('\n  ')}

  <text x="72" y="540" font-size="24" fill="${INK}" opacity="0.62">${esc(footnote)}</text>
</svg>`;
};

const cards = [
  {
    name: 'default',
    eyebrow: 'NSW & Victoria',
    headline: 'The directory that ignores the river',
    footnote: 'Trades, food, pubs, stays and things to do across the border',
  },
  {
    name: 'nsw',
    eyebrow: 'New South Wales',
    headline: 'Business directory for NSW',
    footnote: 'Service areas that do not stop at the state line',
  },
  {
    name: 'vic',
    eyebrow: 'Victoria',
    headline: 'Business directory for Victoria',
    footnote: 'Service areas that do not stop at the state line',
  },
  {
    name: 'trades',
    eyebrow: 'Trades and services',
    headline: 'Licensed trades, checked against the register',
    footnote: 'NSW Fair Trading and the Victorian Building Authority',
  },
  {
    name: 'eat-drink',
    eyebrow: 'Eat and drink',
    headline: 'Cafes, bakeries and kitchens worth the drive',
    footnote: 'Hours and details read from each venue’s own sources',
  },
  {
    name: 'pubs-clubs',
    eyebrow: 'Pubs and clubs',
    headline: 'Beer gardens, counter meals and courtesy buses',
    footnote: 'Country pubs and licensed clubs across the corridor',
  },
  {
    name: 'stay',
    eyebrow: 'Stay',
    headline: 'Motels, cabins and campgrounds',
    footnote: 'Regional accommodation with real published detail',
  },
  {
    name: 'things-to-do',
    eyebrow: 'Things to do',
    headline: 'Parks, trails, wineries and days out',
    footnote: 'Including the free ones nobody lists properly',
  },
  {
    name: 'clubs-hobbies',
    eyebrow: 'Clubs and hobbies',
    headline: 'The clubs no other directory bothers with',
    footnote: 'Sporting clubs, men’s sheds, historical societies and more',
  },
  {
    name: 'guides',
    eyebrow: 'Guides',
    headline: 'What things actually cost, and who can legally do them',
    footnote: 'Named author, visible review date, reviewed every six months',
  },
  {
    name: 'tools',
    eyebrow: 'Free tools',
    headline: 'Check a licence before you hand over a deposit',
    footnote: 'No signup, no gate, straight through to the official register',
  },
];

let sharp = null;
try {
  ({ default: sharp } = await import('sharp'));
} catch {
  console.log('sharp not installed, writing SVG only');
}

let png = 0;
for (const c of cards) {
  const svg = card(c);
  fs.writeFileSync(path.join(OUT, c.name + '.svg'), svg);
  if (sharp) {
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(path.join(OUT, c.name + '.png'));
    png++;
  }
}

// Brand marks used by the Organization node and the manifest.
const mark = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="8" fill="${INK}"/>
  <path d="M14 12h5v34h-5z" fill="${WATTLE}" transform="skewX(-14) translate(6 0)"/>
  <path d="M24 44V20h6v18h13v6H24z" fill="${PAPER}"/>
  <path d="M8 52c8-4 16-4 24 0s16 4 24 0" stroke="${RIVER}" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`;
const BRAND = path.join(ROOT, 'public', 'brand');
fs.mkdirSync(BRAND, { recursive: true });
fs.writeFileSync(path.join(BRAND, 'localknows-logo.svg'), mark);
if (sharp) {
  for (const [name, size] of [
    ['localknows-logo.png', 512],
    ['icon-512.png', 512],
    ['icon-192.png', 192],
    ['apple-touch-icon.png', 180],
  ]) {
    await sharp(Buffer.from(mark)).resize(size, size).png({ compressionLevel: 9 }).toFile(path.join(BRAND, name));
    png++;
  }
}

console.log('og: ' + cards.length + ' svg, ' + png + ' png');
