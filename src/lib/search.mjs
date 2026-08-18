/**
 * Search tokenising.
 *
 * Both sides of the search have to agree exactly on what a word is. When they
 * did not, the index held "cafe" and the query held "café", and a perfectly
 * ordinary search returned nothing. Same for "Wello's", "B&B" and "fish & chips".
 *
 * So there is one function, used to build the index at build time and serialised
 * into the page to normalise the query at search time. scripts/selftest.mjs
 * asserts real queries against the real index so this cannot silently rot again.
 */

/**
 * Fold a string into comparable tokens.
 *
 * Diacritics are stripped so café and cafe are the same word. Everything that
 * is not a letter or a digit is a separator, so an apostrophe or an ampersand
 * never blocks a match. Single characters are dropped: matching is substring
 * based, so a lone "b" matches most of the directory and is worse than noise.
 */
export function tokenise(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1);
}

/** The haystack stored on each row. A deduplicated token set, space joined. */
export function buildHaystack(parts) {
  const tokens = new Set();
  for (const part of parts) {
    for (const w of tokenise(part)) tokens.add(w);
  }
  return [...tokens].join(' ');
}

/**
 * Does a row match a free text query?
 *
 * Every usable query token must appear somewhere in the haystack, as a
 * substring, so a prefix like "plumb" still finds "plumbing". A query that
 * yields no usable tokens matches everything, which is the same as an empty
 * box: showing the whole directory is a better answer than showing nothing
 * because somebody typed "B&B".
 */
export function matchesQuery(haystack, query) {
  const tokens = tokenise(query);
  if (!tokens.length) return true;
  for (const t of tokens) {
    if (haystack.indexOf(t) === -1) return false;
  }
  return true;
}
