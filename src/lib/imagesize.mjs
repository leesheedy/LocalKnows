/**
 * Intrinsic pixel dimensions, read from the file header.
 *
 * Every <img> on this site has to ship width and height or the page reflows
 * when the image arrives, and layout shift is the one Core Web Vital a static
 * site can still fail. The obvious way to get those numbers is to write them
 * into listings.json by hand, and that is exactly the kind of duplicated fact
 * that goes stale silently: somebody re-crops a photo, the file changes, the
 * JSON does not, and the browser reserves the wrong box forever.
 *
 * So the dimensions are never stored. They are read from the bytes at build
 * time, which makes the file the single source of truth and means a re-crop
 * needs no edit anywhere else.
 *
 * Zero dependencies, matching src/lib/markdown.ts. This lives in .mjs for the
 * same reason calculators.mjs and search.mjs do: scripts/selftest.mjs imports
 * it, and a header parser nobody can run in isolation is a header parser
 * nobody has checked.
 *
 * Four formats is not a general purpose decoder and is not trying to be. It is
 * the set a business can actually send us.
 */

/**
 * @typedef {{ width: number, height: number, format: 'png'|'jpeg'|'webp'|'svg' }} Dimensions
 */

/** JPEG markers that carry a frame header. Excludes DHT/JPG/DAC, which do not. */
const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

/** @param {Buffer} buf @returns {Dimensions|null} */
function png(buf) {
  if (buf.length < 24) return null;
  if (buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  // The IHDR chunk is mandated to be first, so its payload is always at 16.
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), format: 'png' };
}

/** @param {Buffer} buf @returns {Dimensions|null} */
function jpeg(buf) {
  if (buf.length < 4 || buf.readUInt16BE(0) !== 0xffd8) return null;
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) {
      // Fill bytes are legal between segments. Anything else means this is not
      // a JPEG we can read, and guessing our way through it would be worse
      // than saying so.
      i++;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    // Standalone markers carry no length field.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    if (SOF_MARKERS.has(marker)) {
      // Height precedes width in a frame header, which is the wrong way round
      // from every other format here and the usual source of a transposed bug.
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), format: 'jpeg' };
    }
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

/** @param {Buffer} buf @returns {Dimensions|null} */
function webp(buf) {
  if (buf.length < 30) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = buf.toString('ascii', 12, 16);

  if (chunk === 'VP8X') {
    // Canvas size is three byte little endian, stored minus one.
    return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1, format: 'webp' };
  }

  if (chunk === 'VP8 ') {
    // Lossy. The frame header follows a three byte start code.
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null;
    return {
      width: buf.readUInt16LE(26) & 0x3fff,
      height: buf.readUInt16LE(28) & 0x3fff,
      format: 'webp',
    };
  }

  if (chunk === 'VP8L') {
    // Lossless packs 14 bit width and height across bytes 21..24, minus one.
    if (buf[20] !== 0x2f) return null;
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, format: 'webp' };
  }

  return null;
}

/** @param {Buffer} buf @returns {Dimensions|null} */
function svg(buf) {
  // Only the opening tag is needed, and a logo can carry a large embedded
  // path, so this reads a window rather than the whole file.
  const head = buf.toString('utf8', 0, Math.min(buf.length, 2048));
  if (!/<svg[\s>]/i.test(head)) return null;

  const attr = (name) => {
    const m = head.match(new RegExp(name + '\\s*=\\s*["\']([\\d.]+)(px)?["\']', 'i'));
    return m ? Number(m[1]) : null;
  };

  const w = attr('width');
  const h = attr('height');
  if (w && h) return { width: Math.round(w), height: Math.round(h), format: 'svg' };

  // No width/height is normal and fine for a responsive logo. The viewBox
  // still fixes the aspect ratio, which is the part that prevents layout
  // shift, so it is enough on its own.
  const vb = head.match(
    /viewBox\s*=\s*["']\s*[\d.eE+-]+[\s,]+[\d.eE+-]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i,
  );
  if (vb) {
    return { width: Math.round(Number(vb[1])), height: Math.round(Number(vb[2])), format: 'svg' };
  }

  return null;
}

/**
 * Reads intrinsic dimensions, or returns null when the bytes are not one of
 * the four supported formats. Never throws: the caller decides how loud to be,
 * because preflight wants to fail the build and a template wants to fall back.
 *
 * @param {Buffer} buf
 * @returns {Dimensions|null}
 */
export function imageSize(buf) {
  return png(buf) ?? jpeg(buf) ?? webp(buf) ?? svg(buf);
}
