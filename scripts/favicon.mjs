/**
 * Favicon raster generation.
 *
 * The site shipped an SVG favicon and nothing else. That is enough for a browser
 * tab and not enough for a search result: Google's icon fetcher asks for a square
 * raster whose side is a multiple of 48, and it will request /favicon.ico from the
 * document root whether or not a <link> declares one. A site with no ICO gets the
 * grey globe beside every result it owns.
 *
 * So the SVG stays the source of truth and this renders it to an ICO containing
 * 16, 32 and 48. Entries are PNG encoded rather than BMP, which every browser
 * since IE11 reads and which keeps the alpha channel intact at 16px where a BMP
 * mask would go ragged.
 *
 *   node scripts/favicon.mjs
 *
 * Run it after editing public/favicon.svg. It is wired into the build so a change
 * to the mark cannot ship with a stale ICO beside it.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'public', 'favicon.svg');
const TARGET = join(ROOT, 'public', 'favicon.ico');

/**
 * 48 is the one Google wants, 32 is what a Windows taskbar and a pinned tab
 * take, 16 is what a search result and a browser tab actually get.
 */
const SIZES = [16, 32, 48];

/**
 * At 16 pixels the counter inside the pin is two pixels across and anti-aliases
 * to a smudge, which is what made the old icon read as a blob beside a result.
 * The 16px slice is rendered from the mark with the counter filled in, so the
 * silhouette stays sharp. Every larger size keeps the mark whole.
 */
const SOLID_BELOW = 32;
const solidify = (svg) => Buffer.from(String(svg).replace(/\s*<circle[^>]*\/>/g, ''));

/** ICO is little endian throughout. */
function icoFrom(images) {
  const HEADER = 6;
  const ENTRY = 16;
  const dir = Buffer.alloc(HEADER + ENTRY * images.length);
  dir.writeUInt16LE(0, 0); // reserved
  dir.writeUInt16LE(1, 2); // 1 = icon, 2 = cursor
  dir.writeUInt16LE(images.length, 4);

  let offset = dir.length;
  images.forEach(({ size, data }, i) => {
    const at = HEADER + ENTRY * i;
    dir.writeUInt8(size >= 256 ? 0 : size, at + 0); // 0 means 256
    dir.writeUInt8(size >= 256 ? 0 : size, at + 1);
    dir.writeUInt8(0, at + 2); // palette size, 0 for true colour
    dir.writeUInt8(0, at + 3); // reserved
    dir.writeUInt16LE(1, at + 4); // colour planes
    dir.writeUInt16LE(32, at + 6); // bits per pixel
    dir.writeUInt32LE(data.length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });

  return Buffer.concat([dir, ...images.map((i) => i.data)]);
}

const svg = await readFile(SOURCE);
const images = [];
for (const size of SIZES) {
  // density is what makes sharp rasterise an SVG at the size asked for rather
  // than at its intrinsic 64px and then resample, which softens the edges of a
  // 16px glyph badly enough to notice.
  const art = size < SOLID_BELOW ? solidify(svg) : svg;
  const data = await sharp(art, { density: Math.ceil((size / 64) * 72 * 4) })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
  images.push({ size, data });
}

const ico = icoFrom(images);
await writeFile(TARGET, ico);
console.log(
  'favicon.ico written: ' +
    SIZES.join(', ') +
    ' at ' +
    (ico.length / 1024).toFixed(1) +
    ' kB total',
);
