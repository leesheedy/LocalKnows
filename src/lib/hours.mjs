/**
 * Opening hours, encoded for the search index and read back in the browser.
 *
 * This lives in .mjs for the same reason calculators.mjs and search.mjs do:
 * the encoder runs at build time in Astro and the decoder runs in the visitor's
 * browser, and if those two are written twice they will eventually disagree.
 * That is not hypothetical here — it is exactly how the search index came to
 * hold "cafe" while the query held "café", and the fix was this same pattern.
 * scripts/selftest.mjs imports both halves and checks them against times worked
 * out by hand.
 *
 * The format is one slot per day, Sunday first, comma separated:
 *
 *   "420-900,,,420-900,420-900,420-900,420-900"
 *
 * Each slot is minutes from midnight, open then close. An empty slot is a
 * closed day. A close at or before the open means the session runs past
 * midnight, which is ordinary for a pub: "660-60" is eleven in the morning
 * until one the next morning.
 */

/** Minutes from midnight for a "HH:MM" string, or null if unparseable. */
export function toMinutes(t) {
  if (typeof t !== 'string') return null;
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!isFinite(hh) || !isFinite(mm) || hh > 24 || mm > 59) return null;
  // 24:00 is a legitimate way to write midnight and has to fold to 0, or it
  // encodes as 1440 and every comparison against a clock reading fails.
  return (hh % 24) * 60 + mm;
}

/**
 * Builds the encoded week for one listing, or '' when it publishes no hours at
 * all. The empty string is meaningful: only some businesses tell us, and the
 * filter has to be able to say "we do not know" rather than "closed".
 */
export function encodeHours(hours) {
  const week = [0, 1, 2, 3, 4, 5, 6].map((day) => {
    const h = (hours ?? []).find((x) => x.day === day);
    if (!h || h.closed) return '';
    const open = toMinutes(h.opens);
    const close = toMinutes(h.closes);
    if (open === null || close === null) return '';
    return open + '-' + close;
  });
  // Every slot empty means the business publishes nothing, which the filter
  // has to be able to tell apart from "closed right now".
  return week.every((slot) => slot === '') ? '' : week.join(',');
}

/**
 * Is this business open at the given moment?
 *
 * `now` is injected rather than read from the clock so the behaviour can be
 * tested at three in the morning on a Saturday without waiting for one.
 */
export function isOpenAt(encoded, now) {
  if (!encoded) return false;
  const day = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  const parts = encoded.split(',');

  const slot = (d) => {
    const raw = parts[d];
    if (!raw) return null;
    const [a, b] = raw.split('-');
    const open = Number(a);
    const close = Number(b);
    return isFinite(open) && isFinite(close) ? { open, close } : null;
  };

  const today = slot(day);
  if (today) {
    if (today.close > today.open) {
      if (mins >= today.open && mins < today.close) return true;
    } else if (mins >= today.open) {
      // Runs past midnight, so it is open from the opening time to the end of
      // the day. The tail lands on tomorrow, handled below.
      return true;
    }
  }

  const yesterday = slot((day + 6) % 7);
  if (yesterday && yesterday.close <= yesterday.open && mins < yesterday.close) return true;

  return false;
}
