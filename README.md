# resthreads.com

Static marketing site for ResThreads (resident-ambassador chat for multifamily). Deployed via Vercel. Canonical source for the site going forward; originally authored in campusthreads/marketing/resthreads.

## Branded previews

The landing-page form posts to `api/preview.js`, which asks the CampusThreads preview service to crawl the site and store a 30-day preview record in Firestore. The selected presentation opens at a shareable `connect.campusthreads.co/preview/<slug>/<mode>` URL backed by the live ResThreads demo residents.

`api/preview.js` requires `RESTHREADS_PREVIEW_SIGNING_SECRET` in the Vercel
production environment. It signs the exact upstream body, timestamp, nonce, and
original client IP. The same secret must be configured for the CampusThreads
Firebase Function; never expose it to browser code or commit it.

The preview service is private. The Vercel function uses its short-lived OIDC
token with Google Workload Identity Federation to impersonate the dedicated
`resthreads-preview-invoker` service account. Only the `flockly/resthreads`
production workload is trusted, the service account can only invoke this Cloud
Run service, and no long-lived Google key is stored in Vercel. GET requests for
capability-protected preview slugs use this same authenticated gateway so the
CampusThreads-hosted presentation can read the allowlisted preview payload.

Set `LEAD_WEBHOOK_URL` in Vercel to send each website submission to a CRM, Zapier, or Slack incoming webhook. Without it, submissions are logged in the Vercel function logs as `RESTHREADS_LEAD`.
