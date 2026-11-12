// Cloudflare Pages Function for POST /api/submit.
// Saves a client question to the Client Questions base in Airtable, then (only when
// EMAIL_ENABLED is "true") sends the client receipt and EJ's alert through Resend.
// Secrets come only from Cloudflare Pages environment variables: AIRTABLE_TOKEN, RESEND_API_KEY.

const AIRTABLE_BASE = 'appViKsJKAMFDLBNO';
const AIRTABLE_TABLE = 'tbl1z3pxYBQU5bd8E';
const F = {
  name: 'fld3WX6tHc3L02MVA',
  email: 'fldTDx65QPEVosCXk',
  sessionDate: 'fldUCtVvK22PQhOtu',
  question: 'fldRe7NIROgzL7glv',
  background: 'fldVIpEnA6Myamiim',
};
const EJ_EMAIL = 'ej@inward2onward.com';
const FROM = 'EJ Steele <ej@inward2onward.com>';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function clean(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function validate(body) {
  const d = {
    name: clean(body.name, 200),
    email: clean(body.email, 320),
    sessionDate: clean(body.sessionDate, 10),
    question: clean(body.question, 5000),
    background: clean(body.background, 5000),
  };
  if (!d.name || !d.question) return { error: 'missing' };
  if (!EMAIL_RE.test(d.email)) return { error: 'email' };
  if (!DATE_RE.test(d.sessionDate) || isNaN(Date.parse(d.sessionDate))) return { error: 'date' };
  return { data: d };
}

async function saveToAirtable(env, d) {
  const api = env.AIRTABLE_API_URL || 'https://api.airtable.com';
  const fields = { [F.name]: d.name, [F.email]: d.email, [F.sessionDate]: d.sessionDate, [F.question]: d.question };
  if (d.background) fields[F.background] = d.background;
  const r = await fetch(`${api}/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: [{ fields }] }),
  });
  if (!r.ok) throw new Error(`airtable ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.records && j.records[0] && j.records[0].id;
}

export function receiptText(d) {
  return `Hi ${d.name},\n\nYour question came through. I'll look into it.\n\nHere is what you sent:\n\n${d.question}\n\nYou can reply to this email to reach me.\n\nEJ`;
}

export function alertText(d, recordId) {
  return `${d.name} sent a question for the session on ${d.sessionDate}.\n\nTheir email: ${d.email}\n\nQuestion\n\n${d.question}\n\nBackground\n\n${d.background || '(none)'}\n\nIt is waiting under the New tab in Question Desk. Record: https://airtable.com/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${recordId}`;
}

async function sendEmail(env, payload) {
  const api = env.RESEND_API_URL || 'https://api.resend.com';
  const r = await fetch(`${api}/emails`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`resend ${r.status} ${await r.text()}`);
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch (e) { body = {}; }
  body = body || {};

  // Honeypot: bots fill the hidden field. Pretend success, save nothing.
  if (body.website) return json(200, { ok: true });

  const v = validate(body);
  if (v.error) return json(400, { ok: false, error: v.error });

  if (!env.AIRTABLE_TOKEN) {
    console.error('AIRTABLE_TOKEN is not set');
    return json(503, { ok: false, error: 'not_configured' });
  }

  let recordId;
  try {
    recordId = await saveToAirtable(env, v.data);
  } catch (e) {
    console.error('save failed', e.message);
    return json(502, { ok: false, error: 'save_failed' });
  }

  const emailOn = env.EMAIL_ENABLED === 'true' && !!env.RESEND_API_KEY;
  if (emailOn) {
    const d = v.data;
    const results = await Promise.allSettled([
      sendEmail(env, { from: FROM, to: [d.email], reply_to: EJ_EMAIL, subject: 'Your question for EJ', text: receiptText(d) }),
      sendEmail(env, { from: FROM, to: [EJ_EMAIL], reply_to: d.email, subject: `New question from ${d.name}`, text: alertText(d, recordId) }),
    ]);
    results.forEach((r) => { if (r.status === 'rejected') console.error('email failed', r.reason && r.reason.message); });
  }

  return json(200, { ok: true });
}

export function onRequest({ request }) {
  return new Response(JSON.stringify({ ok: false }), {
    status: 405,
    headers: { Allow: 'POST', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
