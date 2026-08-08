# resthreads.com

Static marketing site for ResThreads (resident-ambassador chat for multifamily). Deployed via Vercel. Canonical source for the site going forward; originally authored in campusthreads/marketing/resthreads.

## Branded previews

The landing-page form posts to `api/preview.js`, which asks the CampusThreads preview service to crawl the site and store a 30-day preview record in Firestore. The selected presentation opens at a shareable `connect.campusthreads.co/preview/<slug>/<mode>` URL backed by the live ResThreads demo residents.

Set `LEAD_WEBHOOK_URL` in Vercel to send each website submission to a CRM, Zapier, or Slack incoming webhook. Without it, submissions are logged in the Vercel function logs as `RESTHREADS_LEAD`.
