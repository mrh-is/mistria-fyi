---
id: 2026-10-20-prerender-csp
status: needs-review
summary: >-
  Historical scope: Prerendered pages get a per-route CSP header with script hashes. Current
  applicability is unverified.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-20-prerender-csp.md#decision
relationships: []
---

# Prerendered pages get a per-route CSP header with script hashes

## Context

Every page was rendered on demand by the Pages Function, and a server redirect ahead of the service
worker caused the offline-relaunch bug (#18). Issue #108 spiked prerendering locale-prefixed pages
under the existing Content-Security-Policy. Three constraints shaped it:

- SvelteKit refuses to prerender a template that contains `%sveltekit.nonce%`, and `app.html` had
  two nonce-tagged inline scripts (the theme & `theme-color` bootstraps).
- A prerendered page is a static file. Pages applies `_headers` to it, and the `/*` rule's CSP has
  no nonce or hash for SvelteKit's inline start script. SvelteKit's own `<meta http-equiv>` policy
  in the page can't help: a browser enforces every policy it receives, so the header policy still
  blocks the script. A `<meta>` policy also can't carry `frame-ancestors`.
- Pages joins a header set by two matching rules with a comma, which browsers read as two policies
  (both enforced), and caps `_headers` at 100 rules & 2,000 characters a line.

## Decision

- `app.html`'s inline scripts lose their nonce attribute and are allowed by SHA-256 hash in every
  policy, rendered or prerendered. The build hashes them from the file; `security-headers.test.ts`
  pins the values.
- An adapter wrapper (`withHeadersFile`) writes `_headers` after prerendering. Each prerendered
  route gets one rule, `/:locale/<route>`, that detaches the inherited CSP
  (`! Content-Security-Policy`) and sets the full directive set plus the hashes of every inline
  script in that route's pages. Locale homes keep literal paths, since `/:locale` would match every
  top-level file.
- Prerender entries list each prerendered route under every locale prefix
  (`src/lib/i18n/prerender-entries.ts`); SvelteKit's default `*` entry would prerender the
  unprefixed path, which only redirects.
- Query-dependent behavior on a prerendered route runs in the browser: `/data` opens the `?section=`
  tool in an effect. The obsolete beta route `/settings` is removed with the maintainer’s approval;
  see [the retirement decision](2026-10-20-retire-settings-route.md).

Detaching and resetting a header in one rule is not covered by Cloudflare's documentation. The
adapter's own `/_app/immutable/*` rule relies on it for `Cache-Control`, and production serves the
reset value, so the behavior is established; the branch preview's `curl -I` output in #108's PR
confirms it for the CSP.

## Alternatives

- **Meta-only policy for prerendered pages** (header carries only `frame-ancestors`, or a permissive
  `script-src`): rejected. Anything before the `<meta>` in `<head>` (the theme script) is
  ungoverned, and a header with `'unsafe-inline'` weakens every static file.
- **Every page's hashes on the `/*` rule**: rejected. It widens every static file's policy and grows
  with the page count toward the 2,000-character line cap.
- **No CSP on `/*`, one CSP rule per static path group**: avoids detaching, but a static path
  missing from the list ships with no header CSP at all, and the list duplicates `staticExcludes`.
- **Externalizing the `app.html` scripts**: works, but adds a render-blocking request before first
  paint on every cold load. Hashing costs nothing at runtime.
- **SPA mode**: rejected in the architecture rethink.

## Revisit if

- SvelteKit gains a way to load its start script externally, or hashes template scripts itself.
- Cloudflare documents (or changes) how a rule that detaches and sets the same header behaves.
- Prerendering expands until a single route's rule nears 2,000 characters (each locale's start
  script currently hashes identically, so a route adds one hash, not eight), or the rule count
  nears 100.
- The site moves off Cloudflare Pages `_headers` (Workers static assets, another host).
