# Questions for EJ: Cloudflare Pages version

Same page, styles and footer as the Vercel build in ../i2o-page. The Vercel function api/submit.js is rewritten as a Cloudflare Pages Function at functions/api/submit.js (POST /api/submit). Security headers move from vercel.json to _headers.

## Settings for the Cloudflare Pages project
- Framework preset: None. Build command: leave empty. Build output directory: `/`.
- Settings > Variables and Secrets, Production:
  - AIRTABLE_TOKEN: type Secret. Airtable personal access token "Questions page", scope data.records:write, Client Questions base only.
  - RESEND_API_KEY: type Secret. Resend sending key for inward2onward.com.
  - EMAIL_ENABLED: type Text, value false. Set true only after EJ reconfirms email.
- Variables apply to the next deployment. Redeploy after adding them.

## Tested Nov 11, 2026 in Cloudflare's local runtime (wrangler 3.114.17, pages dev)
- Page 200, footer Privacy Policy link https://legal.inward2onward.com/legal, nosniff and X-Frame-Options DENY headers present.
- GET /api/submit 405. Missing fields 400. Honeypot 200 with nothing saved. No AIRTABLE_TOKEN 503 "not_configured".
- With fake Airtable and Resend servers on localhost: one Airtable record POST with the right field IDs, then the receipt and the alert emails with the right from, to and reply_to. No real email was sent.
