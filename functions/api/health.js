// Read-only setup check. Says whether each setting is present. Never returns a value.
export function onRequestGet({ env }) {
  const body = {
    airtableTokenSet: !!env.AIRTABLE_TOKEN,
    resendKeySet: !!env.RESEND_API_KEY,
    emailEnabled: env.EMAIL_ENABLED === 'true',
  };
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
