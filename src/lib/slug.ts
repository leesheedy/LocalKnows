/** Slug helpers. One implementation, used by data loading and by tests. */

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Every internal href in this codebase goes through here. Trailing slash, always. */
export function path(...parts: (string | number | undefined | null)[]): string {
  const clean = parts
    .filter((p) => p !== undefined && p !== null && p !== '')
    .map((p) => String(p).replace(/^\/+|\/+$/g, ''))
    .filter(Boolean);
  return '/' + (clean.length ? clean.join('/') + '/' : '');
}
