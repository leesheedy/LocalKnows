/**
 * Generated prose.
 *
 * Every locality x category page carries a paragraph built from that page's own
 * listing rows. It is the difference between twenty thousand near duplicate
 * pages and twenty thousand pages that each say something only this site knows.
 *
 * Two rules:
 *   - Never state a number the data does not support. Every sentence below is
 *     gated on the value existing.
 *   - Vary the sentence shape by a stable hash of the page, so neighbouring
 *     pages do not read as one template with the nouns swapped.
 */
import type { Category, Locality } from './types';
import type { LocalityCategoryStats } from './repo';
import { STATES } from './site';

/** Deterministic, stable across builds. Same page, same wording, every time. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const pick = <T>(options: T[], seed: string): T => options[hash(seed) % options.length];

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const money = (n: number) => '$' + Math.round(n).toLocaleString('en-AU');

/**
 * The data block sentences. Returns an array so the template can render them as
 * separate paragraphs or as a single block without the copy caring.
 */
export function statSentences(
  locality: Locality,
  category: Category,
  stats: LocalityCategoryStats,
  otherState: string,
): string[] {
  const seed = locality.slug + ':' + category.slug;
  const out: string[] = [];
  const noun = stats.listingCount === 1 ? category.nameSingular.toLowerCase() : category.name.toLowerCase();

  out.push(
    pick(
      [
        'We list ' + stats.listingCount + ' ' + noun + ' covering ' + locality.name + '.',
        'There are ' + stats.listingCount + ' ' + noun + ' on LocalsKnow that work in ' + locality.name + '.',
        locality.name + ' has ' + stats.listingCount + ' ' + noun + ' listed here.',
      ],
      seed,
    ),
  );

  if (stats.fromOtherLocality > 0) {
    const pct = Math.round((stats.fromOtherLocality / stats.listingCount) * 100);
    out.push(
      stats.fromOtherLocality +
        ' of them are based somewhere else and travel in, which is ' +
        pct +
        '% of the list. Address and service area are held separately, so a business that works here appears here.',
    );
  }

  if (stats.crossBorderCount > 0) {
    out.push(
      stats.crossBorderCount +
        ' ' +
        plural(stats.crossBorderCount, 'is', 'are') +
        ' based in ' +
        otherState +
        ' and ' +
        plural(stats.crossBorderCount, 'crosses', 'cross') +
        ' the border to work in ' +
        locality.name +
        '. Most directories will not show you those.',
    );
  }

  if (stats.licencedCount > 0) {
    out.push(
      'We have checked ' +
        stats.licencedCount +
        ' ' +
        plural(stats.licencedCount, 'licence', 'licences') +
        ' against the ' +
        (locality.state === 'NSW' ? 'NSW Fair Trading' : 'Victorian Building Authority') +
        ' public register.',
    );
  }

  if (stats.avgCalloutFee && stats.calloutFeeLow && stats.calloutFeeHigh) {
    out.push(
      'Call out fees on this page run from ' +
        money(stats.calloutFeeLow) +
        ' to ' +
        money(stats.calloutFeeHigh) +
        ', averaging ' +
        money(stats.avgCalloutFee) +
        '. That is the fee to attend, before any labour or parts.',
    );
  }

  if (stats.openSaturdayCount > 0 || stats.openSundayCount > 0) {
    const parts: string[] = [];
    if (stats.openSaturdayCount > 0) parts.push(stats.openSaturdayCount + ' open Saturdays');
    if (stats.openSundayCount > 0) parts.push(stats.openSundayCount + ' open Sundays');
    out.push(parts.join(' and ') + '.');
  }

  if (stats.emergencyCount > 0) {
    out.push(
      stats.emergencyCount +
        ' ' +
        plural(stats.emergencyCount, 'takes', 'take') +
        ' after hours and emergency call outs.',
    );
  }

  if (stats.medianResponseHours) {
    out.push(
      'Median time to reply to an enquiry sent through this site is ' +
        stats.medianResponseHours +
        ' ' +
        plural(stats.medianResponseHours, 'hour', 'hours') +
        '.',
    );
  }

  return out;
}

/** One sentence version for meta descriptions and answer engine summaries. */
export function statSummary(
  locality: Locality,
  category: Category,
  stats: LocalityCategoryStats,
): string {
  const bits: string[] = [
    stats.listingCount + ' ' + category.name.toLowerCase() + ' in ' + locality.name + ' ' + locality.state,
  ];
  if (stats.licencedCount) bits.push(stats.licencedCount + ' with a checked licence');
  if (stats.openSaturdayCount) bits.push(stats.openSaturdayCount + ' open Saturdays');
  if (stats.avgCalloutFee) bits.push('call out from ' + money(stats.calloutFeeLow ?? stats.avgCalloutFee));
  return bits.join(', ') + '.';
}

/**
 * H1 for a money page. Locality first, then category, then state.
 * The state code is in the H1 on purpose: "plumbers albury nsw" is a real query
 * and the border corridor makes the state ambiguous without it.
 */
export function moneyPageTitle(locality: Locality, category: Category): string {
  return category.name + ' in ' + locality.name + ', ' + locality.state;
}

/**
 * Money page description.
 *
 * Aim for 140 to 155 characters. The audit found these coming in at 44, which
 * leaves Google to write its own snippet out of whatever is on the page, and
 * the count is the one thing this site has that competitors do not.
 *
 * Built by adding proof clauses in order of usefulness until the budget is
 * spent, so a page with a lot to say uses the space and a sparse one still ends
 * on a complete sentence.
 */
export function moneyPageDescription(
  locality: Locality,
  category: Category,
  stats: LocalityCategoryStats,
): string {
  const lead =
    stats.listingCount +
    ' ' +
    category.name.toLowerCase() +
    ' serving ' +
    locality.name +
    ' ' +
    locality.state +
    ' ' +
    locality.postcode +
    '.';

  const proof: string[] = [];
  if (stats.licencedCount) proof.push(stats.licencedCount + ' with a licence we checked');
  if (stats.crossBorderCount) proof.push(stats.crossBorderCount + ' crossing the border to get here');
  if (stats.openSaturdayCount) proof.push(stats.openSaturdayCount + ' trading Saturdays');
  if (stats.emergencyCount) proof.push(stats.emergencyCount + ' taking after hours work');
  if (stats.avgCalloutFee) proof.push('call out averaging ' + money(stats.avgCalloutFee));
  if (stats.fromOtherLocality) proof.push(stats.fromOtherLocality + ' travelling in');

  let out = lead;
  for (const clause of proof) {
    const next = out + ' ' + clause[0].toUpperCase() + clause.slice(1) + '.';
    if (next.length > 155) break;
    out = next;
  }

  // Still short because the page has little to say about itself. Close with the
  // thing that is true of every page on the site rather than leave it stubby.
  if (out.length < 110) {
    const tail = ' Contact details, hours and sources on every listing.';
    if (out.length + tail.length <= 158) out += tail;
  }
  return out;
}

/** Region and state hub intro sentences, built from counts rather than adjectives. */
export function hubSummary(opts: {
  scope: string;
  localityCount: number;
  listingCount: number;
  categoryCount: number;
  verifiedCount: number;
}): string {
  return (
    opts.listingCount.toLocaleString('en-AU') +
    ' listings across ' +
    opts.localityCount +
    ' ' +
    plural(opts.localityCount, 'locality', 'localities') +
    ' and ' +
    opts.categoryCount +
    ' categories in ' +
    opts.scope +
    '. ' +
    opts.verifiedCount.toLocaleString('en-AU') +
    ' have been through verification.'
  );
}

// ------------------------------------------------------------------ hours

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const dayName = (d: number) => DAYS[d];
export const dayShort = (d: number) => DAYS[d].slice(0, 3);

export function formatTime(t?: string): string {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? hour12 + suffix : hour12 + ':' + String(m).padStart(2, '0') + suffix;
}

export function stateLabel(code: 'NSW' | 'VIC'): string {
  return STATES[code].name;
}

export function otherStateLabel(code: 'NSW' | 'VIC'): string {
  return code === 'NSW' ? 'Victoria' : 'New South Wales';
}

/** "1,240" not "1240". Used everywhere a count appears in prose. */
export const n = (v: number) => v.toLocaleString('en-AU');
