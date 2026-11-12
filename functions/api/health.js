// Read-only setup check. Says whether each setting is present and how Airtable answers
// this token. Never returns a secret value and never saves a record.
const BASE = 'appViKsJKAMFDLBNO';
const TABLE = 'tbl1z3pxYBQU5bd8E';

async function errorType(r) {
  try { const j = await r.json(); return (j.error && (j.error.type || j.error)) || null; } catch (e) { return null; }
}

export async function onRequestGet({ env }) {
  const body = {
    airtableTokenSet: !!env.AIRTABLE_TOKEN,
    resendKeySet: !!env.RESEND_API_KEY,
    emailEnabled: env.EMAIL_ENABLED === 'true',
  };
  if (env.AIRTABLE_TOKEN) {
    const auth = { Authorization: `Bearer ${env.AIRTABLE_TOKEN.trim()}` };
    body.tokenHadSpaces = env.AIRTABLE_TOKEN !== env.AIRTABLE_TOKEN.trim();
    body.tokenPrefixOk = env.AIRTABLE_TOKEN.trim().startsWith('pat');
    const w = await fetch('https://api.airtable.com/v0/meta/whoami', { headers: auth });
    body.whoamiStatus = w.status;
    if (w.ok) { const j = await w.json(); body.scopes = j.scopes || null; } else { body.whoamiError = await errorType(w); }
    // An empty create saves nothing. A 403 or 404 here means the token cannot reach the base.
    const p = await fetch(`https://api.airtable.com/v0/${BASE}/${TABLE}`, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ records: [] }),
    });
    body.baseWriteProbeStatus = p.status;
    body.baseWriteProbeError = p.ok ? null : await errorType(p);
  }
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
