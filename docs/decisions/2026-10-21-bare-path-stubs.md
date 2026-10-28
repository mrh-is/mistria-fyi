---
id: 2026-10-21-bare-path-stubs
status: needs-review
summary: >-
  Historical scope: Bare paths are static stubs; only `/api` reaches the Function. Current
  applicability is unverified.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-21-bare-path-stubs.md#decision
relationships: []
---

# Bare paths are static stubs; only `/api` reaches the Function

## Context

Issue #109 rolled prerendering out to every page after the #108 spike. With no unprefixed default
locale, a bare path (`/`, `/almanac`) had no page: the Function redirected it (307) after reading
the locale cookie & `Accept-Language`. An installed app launches at `start_url: "/"`, so that server
hop sat ahead of every launch. Pages caps `_routes.json` & dynamic `_redirects` at 100 rules each,
and `_headers` applies only to static files.

## Decision

- Every page is prerendered per locale. `_routes.json` is an include list of `/api/*` alone.
- Each bare path with a page is a static stub written by an adapter wrapper (`withBarePathStubs`):
  one inline script picks the locale (cookie, then `navigator.languages`, then `en`), keeps path,
  query, & fragment, and calls `location.replace`. The script text is identical in every stub, and
  the stubs are listed among the prerendered pages so `withHeadersFile` gives each path a literal
  `_headers` rule with its hash. Without JavaScript, the stub lists every locale's copy of the page.
- Miscased locale prefixes are `_redirects` rules: the all-lowercase & all-uppercase spelling of
  each locale, 20 rules. Arbitrary mixed casings are no longer redirected.
- The dev server & `vite preview` have no `build/` files, so the `barePathStub` hook serves the same
  stub HTML & the same casing redirect there.
- `x-default` hreflang, on each page & in the sitemap, points at that page's bare path, the URL that
  picks a visitor's locale (`/` for the home page).
- Offline, the service worker redirects a bare navigation to a cached locale page before it tries
  the bare path's cached stub, which could pick a locale with nothing cached.
- Unknown paths get the adapter's plain-text `404.html`.

## Alternatives

- **Stubs as SvelteKit routes** (a reroute to a prerendered `+server.ts`): would keep one mechanism
  in dev & production, but needs a reroute rule for every bare path, and an endpoint's prerendered
  file isn't a page, so its hash would still need adding to `_headers` by hand.
- **Stubs in `static/`**: hand-maintained copies of one script, with the CSP hash added separately;
  the `/*` rule would block them.
- **A Function for bare paths only** (an include list naming each bare slug): keeps the server hop
  on the installed app's launch path, which this change exists to remove.
- **A styled, prerendered 404**: Pages serves `404.html` at every unmatched path, so its inline
  start script would need its hash on the `/*` rule, widening every static file's policy.

## Revisit if

- Cloudflare matches `_redirects` sources case-insensitively (a canonical prefix would then loop).
- A real need for the styled not-found page outweighs the `/*` policy cost.
- The route list nears `_headers`' 100-rule cap (each route adds one `/:locale/…` & one bare rule).
