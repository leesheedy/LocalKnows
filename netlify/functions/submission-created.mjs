/**
 * submission-created: Netlify runs this for every verified form submission.
 *
 * It forwards claims, quote requests, lead buyer applications and badge
 * free-lead claims to the Automatrix CRM, where they land in the LocalsKnow
 * section. Netlify Forms
 * keeps its own copy and still emails hello@localsknow.com.au (which forwards
 * to info@automatrix.au), so a CRM outage costs nothing but a manual copy.
 *
 * Spam never reaches here: Netlify only fires this event for submissions that
 * passed the honeypot and Akismet.
 *
 * Needs LOCALSKNOW_INTAKE_SECRET in this site's environment, the same value as
 * on the CRM site. Without it the function logs and does nothing.
 */

const ENDPOINT = process.env.LOCALSKNOW_INTAKE_URL || 'https://automatrix.au/.netlify/functions/localsknow-intake';
const FORWARDED = new Set(['claim', 'verified', 'quote', 'lead-partner', 'badge']);
const DROP = new Set(['bot-field', 'form-name', 'ip', 'user_agent', 'referrer']);

/** Netlify hands file uploads over as objects. The CRM only wants the URL. */
function flatten(data = {}) {
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (DROP.has(k)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = String(v.url || '');
    else if (Array.isArray(v)) out[k] = v.map((x) => (x && typeof x === 'object' ? x.url || '' : String(x))).join(', ');
    else out[k] = v == null ? '' : String(v);
  }
  return out;
}

export const handler = async (event) => {
  let payload;
  try {
    payload = JSON.parse(event.body || '{}').payload;
  } catch {
    return { statusCode: 400, body: 'Bad payload' };
  }
  const form = payload?.form_name;
  if (!FORWARDED.has(form)) return { statusCode: 200, body: 'Not forwarded' };

  const secret = process.env.LOCALSKNOW_INTAKE_SECRET;
  if (!secret) {
    console.warn(`submission-created: LOCALSKNOW_INTAKE_SECRET is not set, ${form} ${payload.id} not forwarded`);
    return { statusCode: 200, body: 'Not configured' };
  }

  const body = JSON.stringify({
    form,
    submissionId: payload.id,
    createdAt: payload.created_at,
    data: flatten(payload.data),
  });

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-localsknow-secret': secret },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error(`submission-created: CRM answered ${res.status} for ${form} ${payload.id}`);
  } catch (err) {
    console.error(`submission-created: CRM unreachable for ${form} ${payload.id}: ${err?.message || err}`);
  }
  // Always 200: a failed forward must never make Netlify treat the submission as failed.
  return { statusCode: 200, body: 'ok' };
};
