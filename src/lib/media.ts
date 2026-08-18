/**
 * Build time image resolution.
 *
 * A listing stores only a path and, for photos, alt text. Everything else
 * about an image is read from the file on disk when the page is built: pixel
 * dimensions, format, and whether it exists at all. That is deliberate, and
 * the reasoning is in src/lib/imagesize.mjs — a width recorded in JSON is a
 * fact that can drift away from the file it describes, and nothing would
 * notice until a page started reflowing on load.
 *
 * Missing files are not silently skipped. scripts/preflight.mjs asserts that
 * every referenced image resolves, so a typo in a path fails the build rather
 * than quietly dropping a business's photo from their page.
 */
import fs from 'node:fs';
import path from 'node:path';
import { imageSize } from './imagesize.mjs';
import type { Listing, ListingImage, ListingPhoto } from './types';

export interface ResolvedImage {
  src: string;
  alt: string;
  width: number;
  height: number;
  format: string;
  /** width / height, rounded. Used for the CSS aspect-ratio box. */
  ratio: number;
}

const PUBLIC_DIR = path.resolve('public');

/**
 * 638 listings rendered across town pages, category pages, theme pages and
 * their own pages means the same logo is asked about hundreds of times in one
 * build. Read each file once.
 */
const cache = new Map<string, ResolvedImage | null>();

/** Absolute disk path for a site absolute src, or null if it escapes public/. */
function onDisk(src: string): string | null {
  if (!src.startsWith('/')) return null;
  const full = path.join(PUBLIC_DIR, src);
  // A src of "/../secrets" would otherwise read outside the served directory.
  // Nothing in this repository does that, and it stays that way by checking.
  const rel = path.relative(PUBLIC_DIR, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return full;
}

/**
 * Resolves one image. Returns null when the path is malformed, the file is
 * absent, or the bytes are not a format we can measure. Callers render the
 * fallback; preflight turns null into a build failure.
 */
export function resolveImage(img: ListingImage | undefined, fallbackAlt = ''): ResolvedImage | null {
  if (!img?.src) return null;

  const key = img.src;
  if (!cache.has(key)) {
    const full = onDisk(img.src);
    let out: ResolvedImage | null = null;
    if (full && fs.existsSync(full)) {
      const dim = imageSize(fs.readFileSync(full));
      if (dim && dim.width > 0 && dim.height > 0) {
        out = {
          src: img.src,
          alt: '',
          width: dim.width,
          height: dim.height,
          format: dim.format,
          ratio: dim.width / dim.height,
        };
      }
    }
    cache.set(key, out);
  }

  const base = cache.get(key);
  if (!base) return null;
  // alt varies by call site while the file does not, so it is applied after
  // the cache rather than baked into it.
  return { ...base, alt: img.alt ?? fallbackAlt };
}

export interface ListingMedia {
  /** The business's own logo, or null to fall back to the monogram tile. */
  logo: ResolvedImage | null;
  photos: ResolvedImage[];
  /**
   * The image for og:image, or null to fall back to the site's own card.
   *
   * Deliberately photos only, and only reasonably large ones. A 200px square
   * logo scaled into a 1200x630 social card looks like a mistake, and a
   * generic card is the better of two bad options there.
   */
  social: ResolvedImage | null;
}

/** Minimum width for a photo to be worth putting in a social card. */
const SOCIAL_MIN_WIDTH = 600;

/**
 * Everything renderable about a listing's imagery, in one call.
 *
 * Every consumer goes through here — templates, JSON-LD and the social card —
 * so that "does this business have a usable photo" is answered in exactly one
 * place. Re-deciding it at each call site is the drift this codebase has been
 * bitten by repeatedly.
 */
export function listingMedia(l: Listing): ListingMedia {
  const logo = resolveImage(l.logo, '');
  const photos = (l.photos ?? [])
    .map((p: ListingPhoto) => resolveImage(p, p.alt))
    .filter((p): p is ResolvedImage => p !== null);

  return {
    logo,
    photos,
    social: photos.find((p) => p.width >= SOCIAL_MIN_WIDTH) ?? null,
  };
}

/** Cleared between builds only in tests. Exported so selftest can measure it. */
export const _cacheSize = () => cache.size;
