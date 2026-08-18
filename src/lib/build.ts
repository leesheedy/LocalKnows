/**
 * Build time constants.
 *
 * The build date is stamped once and reused everywhere so every "checked on"
 * line, every sitemap lastmod and every dateModified on a page agree with each
 * other. Inaccurate lastmod is worse than no lastmod.
 */
export const BUILD_DATE = (process.env.BUILD_DATE || new Date().toISOString().slice(0, 10)) as string;

export const humanDate = (iso: string): string => {
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
  return d.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

export const shortDate = (iso: string): string => {
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

export const chunk = <T>(rows: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out.length ? out : [[]];
};
