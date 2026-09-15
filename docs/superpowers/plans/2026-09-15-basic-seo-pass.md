# Basic SEO pass implementation plan

Issue: #237

## Objective

Make each public Mistria Field Guide route independently understandable and discoverable to search
engines while preserving the app’s existing server-rendered content and semantic structure.

## Decisions

- Require every rendered route to provide typed metadata through `App.PageData`, colocated in its
  `+page.ts` module.
- Add the ` — Mistria Field Guide` title suffix in the shared head component so individual routes
  only own their meaningful page title, while the homepage uses the site name alone.
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

1. Add typed metadata to each page load, with `App.PageData` requiring the shared metadata contract.
2. Add one head component that appends the site name and renders the title, description, canonical
   URL, Open Graph text, Twitter Card text, and optional robots directive from current page data.
   Resolve error metadata from the response status in the root layout because missing routes cannot
   provide page data.
3. Remove the global canonical and generic SEO tags from `app.html`, plus route-local titles and
   descriptions now owned by page data, so each document has one authoritative set.
4. Discover rendered page modules, derive their paths from the route structure, and generate and
   prerender the sitemap from their indexable metadata. Exclude the legacy `/settings` redirect and
   pages with a `noindex` directive.
5. Add the targeted sprite exclusion to `robots.txt` while retaining the sitemap declaration and
   general page access.
6. Add focused tests that compare rendered page routes with metadata providers and cover canonical
   URLs, index policies, rendered head tags, generated sitemap membership, and crawler directives.

## Verification

- Run the focused metadata and crawler tests during implementation.
- Build the application and inspect server-rendered HTML with JavaScript disabled to confirm that
  titles, descriptions, canonicals, the main landmark, page heading, and representative tracker
  content are present without hydration.
- Run the existing critical semantic accessibility suite.
- Run `pnpm run lint:fix`, `pnpm run lint`, `pnpm run check`, `pnpm run test`, and `pnpm run build`.
