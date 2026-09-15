# Basic SEO pass implementation plan

Issue: #237

## Objective

Make each public Mistria Field Guide route independently understandable and discoverable to search
engines while preserving the app’s existing server-rendered content and semantic structure.

## Decisions

- Centralize route metadata in typed page data rather than scattering tags across route components.
- Give every public page a descriptive title, description, canonical URL, Open Graph text, and
  Twitter Card text.
- Defer `og:image`, its dimensions, and `twitter:image` to #171, where the share artwork will be
  designed deliberately.
- Keep the homepage, category pages, the combined tracker, About, and Privacy indexable.
- Mark Data management as `noindex, follow`; it is a local utility screen rather than a useful
  search landing page.
- Mark development and error pages as `noindex, nofollow`.
- Keep ordinary page crawlers allowed. Disallow `/sprites/` specifically for `Googlebot-Image` to
  signal that the game-derived icon files should not appear in Google Images without preventing
  Google’s page crawler from reading the tracker.
- Treat `robots.txt` as a cooperative crawler instruction, not access control or a license boundary.

## Implementation

1. Add a typed metadata registry covering every supported page path. Route literals must satisfy
   SvelteKit’s generated `Pathname` type, and exported indexable paths will be the sitemap contract.
2. Add one head component that renders the resolved title, description, canonical URL, Open Graph
   text, Twitter Card text, and optional robots directive. Resolve it from the current pathname and
   response status in the root layout.
3. Remove the global canonical and generic SEO tags from `app.html`, plus route-local titles and
   descriptions now owned by the registry, so each document has one authoritative set.
4. Replace the sitemap with the complete set of canonical, indexable routes. Exclude the legacy
   `/settings` redirect and non-indexable `/data` route.
5. Add the targeted sprite exclusion to `robots.txt` while retaining the sitemap declaration and
   general page access.
6. Add focused tests for registry completeness, canonical URLs, index policies, rendered head tags,
   sitemap membership, and crawler directives.

## Verification

- Run the focused metadata and crawler tests during implementation.
- Build the application and inspect server-rendered HTML with JavaScript disabled to confirm that
  titles, descriptions, canonicals, the main landmark, page heading, and representative tracker
  content are present without hydration.
- Run the existing critical semantic accessibility suite.
- Run `pnpm run lint:fix`, `pnpm run lint`, `pnpm run check`, `pnpm run test`, and `pnpm run build`.
