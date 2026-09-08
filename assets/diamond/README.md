# The Diamond branded demos

Shared assets for `/branded-inline/diamond-rentals-demo` and `/branded-corner/diamond-rentals-demo`.

The logo and property photographs are from The Diamond's public website; original URLs are recorded in `sources.json`. The original Adobe Fonts kit supplies Balboa Plus Fill and Proxima Nova. Desktop visitors can see the property's original background video; reduced-motion, data-saving, and mobile visitors get a local photograph instead.

Both pages connect to the existing `diamond-rentals-demo` CampusThreads tenant. The corner page uses the production popcard and a separate 400px widget frame, matching the real embed. Native page buttons open that same frame. Postmessage traffic is restricted to the expected iframe and origin.

These are concept demos with sample resident profiles. Their metadata and Vercel response headers exclude them from search indexing. They are not listed in the public sitemap.

Serve this repository as a static site for local review. Deploy the repository's existing Vercel project; no build step is required. Verify the two URLs on desktop and mobile, including launcher open/close, the last resident card, matchmaker, and sign-up scrolling. Do not send messages or submit sign-up forms while testing.
