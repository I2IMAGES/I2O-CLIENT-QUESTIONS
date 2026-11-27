# Questions for EJ page: project record and SOP

Last updated: Nov 27, 2026

## 1. Executive summary

**Goal:** clients send questions before a coaching session, EJ is told right away, and every question lands in one place so EJ can prepare answers before the meeting.

**What exists now:**
- A branded form at `https://i2o-client-questions.pages.dev` (Cloudflare Pages, built from the `main` branch of this repo).
- Every question becomes a record in the Airtable base **Client Questions**, table **Questions**, with Status **New**.
- Each question also triggers an email to EJ at `ai@inward2onward.com`. Reply-to is set to the client's address, so hitting Reply answers the client directly.

**What changed on Nov 27, 2026:** the form had been failing since launch (around Nov 12). Every submission returned an error and nothing was saved. It now saves through an Airtable automation, sends the email alert, and was tested end to end in a real browser.

## 2. Problem statement

- A live test on Nov 27 returned `502 save_failed`, and the Questions table had **0 records**. Any question sent before this fix was lost unless the client emailed EJ after seeing the error message.
- **Root cause:** Airtable accepted the API token as valid (`whoami` 200) but refused it on the Client Questions base with `403 INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND`. In Airtable's Builder Hub the token showed the right scope (`data.records:write`) and the right base, so the exact reason is still unknown. Most likely the token stored in Cloudflare is not that token.
- **Gap that let it ship:** the Nov 11 testing used fake Airtable and Resend servers. No real submission was made on the live site after launch.
- There was also no notification. Even a working form would have left EJ unaware of new questions.

## 3. How it works

```
Client's browser
   |  fills in the form, clicks "Send question"
   v
index.html  --POST /api/submit (JSON)-->  functions/api/submit.js  (Cloudflare Pages Function)
                                              |
                                              | 1. validate fields, drop honeypot bots
                                              | 2. if AIRTABLE_TOKEN is set: try the Airtable REST API
                                              | 3. if that fails or no token: POST to AIRTABLE_WEBHOOK_URL
                                              v
                    Airtable automation "Save questions from the Questions for EJ page"
                         trigger: When webhook received
                         step:    Create record in Questions (Status = New)
                                              |
                                              v
                    Airtable automation "Email EJ when a website question arrives"
                         trigger: When a record is created in Questions
                         step:    Send email to ai@inward2onward.com (reply-to = client)
```

Today step 2 (the token) always fails, so every question goes through the webhook. That's expected, not an error.

### Files
| File | Purpose |
|---|---|
| `index.html`, `design.css` | The form and its styling |
| `functions/api/submit.js` | Validates and saves a question. Token first, webhook second |
| `functions/api/health.js` | Read-only setup check at `/api/health`. Never returns a secret |
| `_headers` | Security headers |

### Cloudflare settings (Workers & Pages > i2o-client-questions > Settings > Variables and Secrets > Production)
| Name | Type | Notes |
|---|---|---|
| `AIRTABLE_WEBHOOK_URL` | Secret | The automation's webhook URL. **Never commit it: this repo is public.** Anyone who has it can add rows. |
| `AIRTABLE_TOKEN` | Secret | Currently refused by Airtable (403). Harmless: the site falls back to the webhook |
| `RESEND_API_KEY` | Secret | Only used if `EMAIL_ENABLED` is `true` |
| `EMAIL_ENABLED` | Text | `false`. Leave it off: alerts now come from Airtable |

New or changed variables only apply after the next deployment. Merging to `main` deploys automatically.

### Airtable automations in Client Questions
| Automation | Trigger | State | Notes |
|---|---|---|---|
| Save questions from the Questions for EJ page | Webhook from the website | **ON** | Creates the record. Without it, website questions are lost |
| Email EJ when a website question arrives | Record created in Questions | **ON** | Emails EJ. Without it, nobody is told about new questions |
| Email EJ when a new question arrives | Airtable form `pagBHzdTxhqAPg9iy` | ON | Only fires for the Airtable form. A question sent through that form sends two alerts, because the record-created automation also fires |
| Acknowledge the client's question | Airtable form `pagBHzdTxhqAPg9iy` | ON | Sends the client a receipt, Airtable form only |

**Airtable rule to remember:** when an automation is ON, edits to it stay a draft until they are published in the Airtable editor. Airtable's help pages don't say exactly which button does this. To avoid it, add new behavior as a new automation and switch that one ON (the switch is in the editor's top bar, next to the word "Automations").

## 4. Standard operating procedures

### 4.1 Live end-to-end test (run after ANY change: code, Cloudflare variable, Airtable automation)
1. Open `https://i2o-client-questions.pages.dev/api/health`. Expect `"webhookUrlSet": true`.
2. Open the form, fill in name `TEST - your initials`, a real email you can read, any session date, and a question starting with `TEST`. Click **Send question**.
3. Expect the green "Thank you. Your question came through." message.
4. Within about a minute: the record appears in Airtable > Client Questions > Questions with Status New, and the alert email arrives at `ai@inward2onward.com`.
5. Delete the test record.

The change is done only when all of steps 3 and 4 pass.

### 4.2 Weekly prep routine for EJ
1. Before each session day, open the Questions table and filter Status = **New**.
2. Move each question to **Researching**, add notes in **Research notes**, write the reply in **EJ's answer**, and set **Answer ready**.
3. After the session, set **Covered in session**.

### 4.3 Troubleshooting
| Symptom | Likely cause | Fix |
|---|---|---|
| Client sees "Your question did not go through" | Both save paths failed | Check `/api/health`. If `webhookUrlSet` is false, re-add the secret and redeploy. If true, check the automation is ON |
| "Thank you" shows but no record appears | Automation is **OFF** (Airtable accepts the post and drops it) | Airtable > Automations > turn it ON |
| Record appears but no email | "Email EJ when a website question arrives" is OFF, or the email was filtered | Turn it ON. Check spam for sender "Questions for EJ". Open the automation's run history for a failure |
| Airtable editor shows "Fix configuration" | A step with an empty required field was added | Remove that step or fill it in, then Update |
| Webhook URL leaked | It was shared or committed | In the automation's trigger, re-create the webhook (this changes the URL), then update `AIRTABLE_WEBHOOK_URL` in Cloudflare and redeploy |

### 4.4 Changing the alert recipient
Airtable > Client Questions > Automations > "Email EJ when a website question arrives" > **Send email** step > change **To**. Because the automation is ON, the edit must be published before it takes effect. If you can't find how, turn the automation OFF, make the edit, then turn it back ON. Then run 4.1.

## 5. Reference

### Payload the site sends to the webhook
```json
{"name":"Client Name","email":"client@example.com","sessionDate":"2026-11-28","question":"...","background":""}
```

### IDs (not secret)
- Base: `appViKsJKAMFDLBNO` (Client Questions). Table: `tbl1z3pxYBQU5bd8E` (Questions).
- Automations: save `wflSRXl91p6bqa859`, email `wflKZvAdMozzNoE5h`.
- Fields: Client name `fld3WX6tHc3L02MVA`, Client email `fldTDx65QPEVosCXk`, Session date `fldUCtVvK22PQhOtu`, Question `fldRe7NIROgzL7glv`, Background `fldVIpEnA6Myamiim`, Status `fldSVCkMJoiKTiEKF` (New = `sel6SFUW6QcbasQeL`).

### Checklists
**Developer, before calling a change done:** fallback tests pass locally, preview deploy succeeded on the PR, merged, `/api/health` shows the new version, live test 4.1 passed, test records deleted.

**EJ, after changing anything in Airtable:** both website automations still ON, change published, ran 4.1.

## 6. Results

| | Before (Nov 12 to Nov 27) | After (Nov 27) |
|---|---|---|
| Live submission | `502 save_failed` | `200 ok`, thank-you shown |
| Records saved | 0 | Every test saved with all fields and Status New |
| EJ notified | Never | Email per question. Airtable run history shows the send succeeded on the live test; delivery to the inbox is confirmed by EJ |
| Secrets in public repo | None | None (webhook URL is a Cloudflare secret) |

## 7. Next steps

**Immediate**
- Questions sent before Nov 27 are not recoverable from the system. Check the inward2onward.com inbox for clients who emailed after seeing the error.

**Short term**
- Decide whether clients should get a receipt email from the website too (the Airtable-form automation "Acknowledge the client's question" does this for the Airtable form only).
- Replace or delete the refused `AIRTABLE_TOKEN` so the setup check stops reporting a 403. Optional: the site works without it.

**Long term**
- Add a daily or pre-session digest email listing every question with Status New.
- Add spam protection (for example Cloudflare Turnstile) if junk submissions appear.
