# Questions for EJ: Cloudflare Pages version

Same page, styles and footer as the Vercel build in ../i2o-page. The Vercel function api/submit.js is rewritten as a Cloudflare Pages Function at functions/api/submit.js (POST /api/submit). Security headers move from vercel.json to _headers.

## Settings for the Cloudflare Pages project
- Framework preset: None. Build command: leave empty. Build output directory: `/`.
- Settings > Variables and Secrets, Production:
  - AIRTABLE_TOKEN: type Secret. Airtable personal access token "Questions page", scope data.records:write, Client Questions base only.
  - RESEND_API_KEY: type Secret. Resend sending key for inward2onward.com.
  - AIRTABLE_WEBHOOK_URL: type Secret. The webhook URL of the Airtable automation "Save questions from the Questions for EJ page" (Client Questions base > Automations). Used when the token is missing or refused. Keep it out of this public repo. The automation must be switched On, or Airtable accepts the post and saves nothing.
  - EMAIL_ENABLED: type Text, value false. Set true only after EJ reconfirms email.
- Variables apply to the next deployment. Redeploy after adding them.

## Tested Nov 11, 2026 in Cloudflare's local runtime (wrangler 3.114.17, pages dev)
- Page 200, footer Privacy Policy link https://legal.inward2onward.com/legal, nosniff and X-Frame-Options DENY headers present.
- GET /api/submit 405. Missing fields 400. Honeypot 200 with nothing saved. No AIRTABLE_TOKEN 503 "not_configured".
- With fake Airtable and Resend servers on localhost: one Airtable record POST with the right field IDs, then the receipt and the alert emails with the right from, to and reply_to. No real email was sent.

## Nov 27, 2026: questions were not being saved
- Live test: POST /api/submit returned 502 save_failed. The Questions table had 0 records. The token passed whoami but got 403 INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND on the base, even though the token's scope and base access looked right in Airtable.
- Fix: if the token save fails, submit.js posts to the Airtable automation webhook (AIRTABLE_WEBHOOK_URL), which creates the record with Status New. /api/health now shows webhookUrlSet.
- Checked with stubbed fetch: token fails then webhook works 200; token works with no webhook call 200; both fail 502; token fails with no webhook set 502; nothing set 503.
- Last check before calling it done: one real submission on the live site, then confirm the record in Airtable.
