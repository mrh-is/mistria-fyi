# In-app legal disclosure implementation plan

Issue #218 and PR #236. Implement the approved in-app legal disclosure design.

## One: lock the content contract

Add a server-rendered route test for `/about` that checks the core unofficial, noncommercial,
authorship, ownership, accuracy, data-distribution, and private-contact statements. Add the route to
the shared browser accessibility matrix so smoke, semantic-heading, theme, and axe coverage apply.

## Two: build the product surface

Create `src/routes/about/+page.svelte` using the established `PageHeader` and informational-page
layout patterns. Add “About this guide” links to `quick-settings-panel.svelte` and the data
management footer. Exclude the route from the floating tracker toolbar and add it to
`static/sitemap.xml`.

## Three: align repository statements

Revise `DISCLAIMER.md`, `COPYRIGHT.md`, and `README.md` to remove the fair-use conclusion, narrow
the GPL boundary to project-authored material, describe extracted icons and generated data
accurately, state the noncommercial posture, add the private rights-holder contact, and avoid
implying a license for game-derived material.

## Four: verify and deliver

Run focused route and component tests during implementation. Then run lint, check, test, build, PWA,
and accessibility verification. Commit with Codex attribution, push the rebased PR branch, and wait
for every hosted PR check to pass.
