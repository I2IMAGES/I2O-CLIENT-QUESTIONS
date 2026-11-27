// Cloudflare Pages Function for POST /api/submit.
// Saves a client question to the Client Questions base in Airtable, then (only when
// EMAIL_ENABLED is "true") sends the client receipt and EJ's alert through Resend.
// Secrets come only from Cloudflare Pages environment variables: AIRTABLE_TOKEN, RESEND_API_KEY,
// AIRTABLE_WEBHOOK_URL. If the token is missing or Airtable refuses it, the question goes to the
// Airtable automation "Save questions from the Questions for EJ page" through its webhook
// (AIRTABLE_WEBHOOK_URL), which creates the same record. Keep that URL out of this public repo.

const AIRTABLE_BASE = 'appViKsJKAMFDLBNO';
const AIRTABLE_TABLE = 'tbl1z3pxYBQU5bd8E';
const F = {
  name: 'fld3WX6tHc3L02MVA',
  email: 'fldTDx65QPEVosCXk',
  sessionDate: 'fldUCtVvK22PQhOtu',
  question: 'fldRe7NIROgzL7glv',
  background: 'fldVIpEnA6Myamiim',
  okToEmail: 'fldNZ0Ixpwcu1MvTD',
  permissionText: 'fld9LALaz63Rz0got',
};
// Must match the checkbox label in index.html word for word. Saved with each record as proof of consent.
export const PERMISSION_TEXT = "It's OK for EJ to email me about this question. I can ask him to stop at any time.";
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
    okToEmail: body.okToEmail === true,
  };
  d.permissionText = d.okToEmail ? PERMISSION_TEXT : '';
  if (!d.name || !d.question) return { error: 'missing' };
  if (!EMAIL_RE.test(d.email)) return { error: 'email' };
  if (!DATE_RE.test(d.sessionDate) || isNaN(Date.parse(d.sessionDate))) return { error: 'date' };
  return { data: d };
}

async function saveToAirtable(env, d) {
  const api = env.AIRTABLE_API_URL || 'https://api.airtable.com';
  const fields = { [F.name]: d.name, [F.email]: d.email, [F.sessionDate]: d.sessionDate, [F.question]: d.question };
  if (d.background) fields[F.background] = d.background;
  fields[F.okToEmail] = d.okToEmail;
  if (d.permissionText) fields[F.permissionText] = d.permissionText;
  const r = await fetch(`${api}/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: [{ fields }] }),
  });
  if (!r.ok) throw new Error(`airtable ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.records && j.records[0] && j.records[0].id;
}

async function saveViaWebhook(env, d) {
  const r = await fetch(env.AIRTABLE_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: d.name, email: d.email, sessionDate: d.sessionDate, question: d.question, background: d.background || '', okToEmail: d.okToEmail ? 'true' : 'false', permissionText: d.permissionText }),
  });
  const text = await r.text();
  if (!r.ok || !/"success"\s*:\s*true/.test(text)) throw new Error(`webhook ${r.status} ${text}`);
}

export function receiptText(d) {
  return `Hi ${d.name},\n\nYour question came through. I'll look into it.\n\nHere is what you sent:\n\n${d.question}\n\nYou can reply to this email to reach me.\n\nEJ`;
}

export function alertText(d, recordId) {
  return `${d.name} sent a question for the session on ${d.sessionDate}.\n\nTheir email: ${d.email}\n\nQuestion\n\n${d.question}\n\nBackground\n\n${d.background || '(none)'}\n\nIt is waiting under the New tab in Question Desk. ${recordId ? `Record: https://airtable.com/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${recordId}` : `Table: https://airtable.com/${AIRTABLE_BASE}/${AIRTABLE_TABLE}`}`;
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

  if (!env.AIRTABLE_TOKEN && !env.AIRTABLE_WEBHOOK_URL) {
    console.error('Neither AIRTABLE_TOKEN nor AIRTABLE_WEBHOOK_URL is set');
    return json(503, { ok: false, error: 'not_configured' });
  }

  let recordId = null;
  let saved = false;
  if (env.AIRTABLE_TOKEN) {
    try {
      recordId = await saveToAirtable(env, v.data);
      saved = true;
    } catch (e) {
      console.error('token save failed', e.message);
    }
  }
  if (!saved && env.AIRTABLE_WEBHOOK_URL) {
    try {
      await saveViaWebhook(env, v.data);
      saved = true;
    } catch (e) {
      console.error('webhook save failed', e.message);
    }
  }
  if (!saved) return json(502, { ok: false, error: 'save_failed' });

  const emailOn = env.EMAIL_ENABLED === 'true' && !!env.RESEND_API_KEY;
  if (emailOn) {
    const d = v.data;
    // Never email a client who did not tick the permission box.
    const sends = [sendEmail(env, { from: FROM, to: [EJ_EMAIL], reply_to: d.okToEmail ? d.email : EJ_EMAIL, subject: `New question from ${d.name}`, text: alertText(d, recordId) })];
    if (d.okToEmail) sends.push(sendEmail(env, { from: FROM, to: [d.email], reply_to: EJ_EMAIL, subject: 'Your question for EJ', text: receiptText(d) }));
    const results = await Promise.allSettled(sends);
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
