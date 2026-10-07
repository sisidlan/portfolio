# Contact delivery on Vercel

The Astro pages remain static. Vercel discovers `api/contact.ts` as a Node.js
function at `/api/contact/`. The function reads private credentials at runtime;
the browser receives only the public endpoint and Turnstile site identifier.
Astro's local dev/preview server serves the UI but does not run the standalone
Vercel function. Test actual delivery on Vercel, using your production domain.

## Environment variables

Set these variables for **Production** in the Vercel project:

| Name                           | Type   | Value                                                                       |
| ------------------------------ | ------ | --------------------------------------------------------------------------- |
| `PUBLIC_CONTACT_FORM_ENDPOINT` | Config | `/api/contact/`                                                             |
| `PUBLIC_TURNSTILE_SITE_ID`     | Config | Cloudflare Turnstile site key                                               |
| `TURNSTILE_SECRET`             | Secret | Cloudflare Turnstile secret key                                             |
| `RESEND_API_TOKEN`             | Secret | Resend API key with Sending access restricted to `contact.kevindegraaf.com` |
| `CONTACT_FROM_EMAIL`           | Config | `Kevin de Graaf <contact@contact.kevindegraaf.com>`                         |
| `CONTACT_TO_EMAIL`             | Config | `kdegraaf97@icloud.com`                                                     |

Use a Managed Turnstile widget, restricted to `kevindegraaf.com` and
`www.kevindegraaf.com`. Pre-clearance is unnecessary. Keep the private credentials
out of `PUBLIC_` variables, source files, logs, and screenshots. Vercel's Config
and Secret labels control dashboard visibility, not browser exposure.

The form needs JavaScript for Turnstile. If the widget needs a checkbox, it appears
in the contact section after confirmation. Each attempt gets a fresh token.
The backend refuses missing configuration, invalid inputs, missing/expired/reused
tokens, unexpected origins/hostnames, and tokens whose action is not `contact`.
Origin checking supplements Turnstile; a non-browser caller can forge Origin.

Messages go only to the configured recipient. The visitor's address is used only
for Reply-To, and message content is plain text. Success means Resend accepted the
message, not guaranteed inbox delivery. Failed or timed-out requests preserve the
draft and are not automatically retried. Providers' internal errors and private
credentials are never returned to visitors or logged by this handler.

## Before the first production deployment

Confirm Resend has verified the sending domain. Then configure a Vercel Firewall
rate-limit rule so throttling also works across function instances:

1. Open your Vercel project, **Firewall → Configure → New Rule**.
2. Name it `Contact form submissions`.
3. Match **Request Path starts with `/api/contact`** and
   **Request Method equals POST**, with both conditions required.
4. Choose **Rate Limit**, **Fixed Window**, **5 requests per 10 minutes**,
   counting by **IP address**, with **429** as the blocking action.
5. Save, review the changes, and publish the rule.

The function additionally has a bounded per-instance limiter, but serverless
instances do not share that memory. The Firewall rule is the deployment-wide
backstop; Vercel tracks its counters per region. Hobby supports one rate-limit
rule per project. See [Vercel's rate-limit documentation](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).

## Deploy and verify

Commit and push the updated code to the Vercel production branch. That deployment
uses the variables you saved. Clicking Redeploy on an older deployment only
rebuilds its old source, which does not contain the new delivery integration.

After deployment:

1. Check **Vercel → Functions** lists the contact function.
2. Open `https://www.kevindegraaf.com/`, complete the footer, choose Send, then Confirm.
3. Confirm the request to `/api/contact/` returns 200 and the footer shows success.
4. Check Resend's email log and the iCloud inbox/Junk folder.
5. Reply to the message and confirm the recipient is the visitor's address.
6. Check that submitting without a valid Turnstile token is rejected.

The handler deliberately accepts only the two production website origins. Preview
deployment domains are not allowed, and production secrets need not be copied to
Preview. For local UI checks, use mocked Turnstile/provider responses in the tests;
dummy keys and mocked verification must never bypass production checks.

DMARC remains optional for sending and was not added as part of this setup.

## Validation

`npm run check`, `npm run format:check`, and `npm test` check types, formatting,
the existing website interactions, the Turnstile confirmation flow, and backend
rejection paths. The tests use mock provider responses and do not send real email.
