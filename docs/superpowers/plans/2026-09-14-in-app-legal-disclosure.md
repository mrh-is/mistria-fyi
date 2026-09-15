# In-app legal disclosure implementation plan

Issue #218 and PR #236. Implement the approved in-app legal disclosure design.

## One: lock the content contract

Add a server-rendered route test for `/about` that checks the core unofficial, noncommercial,
authorship, ownership, accuracy, data-distribution, and private-contact statements. Add the route to
the shared browser accessibility matrix so smoke, semantic-heading, theme, and axe coverage apply.

## Two: build the product surface

Create `src/routes/about/+page.svelte` using the established `PageHeader` and informational-page
layout patterns. Add About beside Data in a two-column quick-settings action row. Move the privacy
and AI disclosure controls from the data management footer into the About footer, leaving only the
version line on Data and making About the privacy page’s back target. Make the About header return
through browser history with a home fallback. Relocate the AI disclosure dialog to the shared
component boundary. Exclude the route from the floating tracker toolbar and add it to
`static/sitemap.xml`.

## Three: align repository statements

Revise `DISCLAIMER.md`, `COPYRIGHT.md`, and `README.md` to remove the fair-use conclusion, narrow
the GPL boundary to project-authored material, describe extracted icons and generated data
accurately, state the noncommercial posture, add the private rights-holder contact, and avoid
implying a license for game-derived material.

## Four: separate the proprietary font

Add a source-tree policy test for the Satoshi font boundary. Remove the tracked Satoshi binary,
ignore its expected local path, and point its `@font-face` source at the project-controlled R2
custom domain after preferring a local installation. Permit that exact domain in the font CSP and
allow its font response to participate in the service worker runtime cache. Document the direct
Fontshare download, local installation, R2 object path, CORS requirement, and Git-history caveat.

## Five: verify and deliver

Run focused route and component tests during implementation. Then run lint, check, test, build, PWA,
and accessibility verification. Commit with Codex attribution, push the rebased PR branch, and wait
for every hosted PR check to pass.
