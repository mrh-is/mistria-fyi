# Sprite assets

Item and villager sprites (~2,500 WebP files) are extracted from the game's assets by the pipeline
and served from the `assets.mistria.fyi` R2 bucket rather than committed to Git, following the same
pattern established for [locale fonts](font-assets.md#locale-fonts). This keeps the source tree
small, avoids overflowing Cloudflare Pages' `_routes.json` 100-rule cap (#312), and stops the
service worker from precaching every sprite on install.

## Resolver

`src/lib/sprites/sprite-url.ts` is the single place in `src/` that builds a sprite URL:

- `itemSpriteUrl(itemId)` → `<origin>/sprites/items/<itemId>.webp?g=<generation>`
- `villagerSpriteUrl(villagerId)` → `<origin>/sprites/villagers/<villagerId>.webp?g=<generation>`

The path is keyed by the entity's own ID, not the game version: icons change far more rarely than
the game does, and this layout means a patch that doesn't touch an icon doesn't invalidate its cache
or re-upload its object. `<generation>` is the `spriteGeneration` constant in `sprite-url.ts` — bump
it only when an existing sprite's pixels change (never for a newly-added sprite); the bump is a
global cache bust with no re-upload, since R2 ignores the query string while the edge cache and
service worker key on the full URL. `<origin>` defaults to `https://assets.mistria.fyi`, overridable
via the `PUBLIC_ASSET_ORIGIN` build-time env var (see [Local development](#local-development)). No
other module constructs a sprite path; `sprite-slot.svelte` and `villager-record.svelte` both call
the resolver.

The villager path is resolver-only today: no pipeline extractor yet populates villager sprites, so
`villager-record.svelte`'s `<img>` always points at a `sprites/villagers/<id>.webp` URL that 404s,
and falls through to its initials placeholder on that image error. The resolver, CSP, and service
worker predicate cover `sprites/villagers/` already so a future extractor is a drop-in.

## Production hosting

Objects are overwritten in place at a stable, entity-ID-keyed path and marked immutable — a content
change is always accompanied by a generation bump, which changes the URL's query string, not the
object's key:

```text
https://assets.mistria.fyi/sprites/items/<itemId>.webp
https://assets.mistria.fyi/sprites/villagers/<villagerId>.webp
```

The type directories (`items/`, `villagers/`) exist so entity kinds can't shadow one another, and
map one-to-one onto the resolver's two functions. Duplicates are expected and left alone: sprites
shared by more than one item (Aldarian artifact pairs, `stone_cup`, `vegetablesoup`) are written
once per item ID rather than deduplicated.

Set it up in Cloudflare as follows:

1. Reuse the existing `mistria-fyi-assets` R2 bucket and its `assets.mistria.fyi` custom domain
   (shared with fonts).
2. Upload converted sprites under the `sprites/` prefix — `pnpm run sprites:upload` does this (see
   below).
3. Set uploaded objects' HTTP metadata to `Content-Type: image/webp` and
   `Cache-Control: public, max-age=31536000, immutable`.
4. The bucket's existing CORS policy (permissive `GET`/`HEAD`, see [font-assets.md](font-assets.md))
   already covers sprites; no bucket-level change is needed.

The application CSP permits images only from itself and `assets.mistria.fyi`. The service worker
caches sprites in their own `sprites-v1` cache with a 400-entry LRU cap, separate from the general
50-entry runtime cache, and never precaches them. Until an object exists at a given URL,
`sprite-slot.svelte` and `villager-record.svelte` render their placeholder on image error — a fresh
clone with no sprites uploaded (or an unreachable bucket) degrades gracefully rather than breaking.

## Generating and uploading sprites

Item sprites are extracted by `pipeline/src/extractors/sprites.ts` and staged during a pipeline run:

```bash
pnpm run pipeline -- <path-to-extracted-assets> --sprites
```

This writes converted WebP files to `pipeline/output/sprites/items/<itemId>.webp` (gitignored),
resolving each item's source PNG from the game's own `icon_sprite` name internally — that name never
reaches `tracker-data.json` or the app, since the resolver builds URLs from the item ID alone.
Upload the result with:

```bash
pnpm run sprites:upload
```

modeled on `scripts/locale-fonts/upload-locale-fonts.sh`: it uploads via `pnpx wrangler`, marks
objects immutable, skips keys whose remote ETag already matches the local file's MD5 (`FORCE=1` to
re-upload everything regardless), and — since original game assets must never reach the public
bucket by accident — refuses to run if `pipeline/output/sprites/` contains anything other than
`.webp` files.

## Rollout order for an icon change

Because objects are overwritten in place rather than version-prefixed, upload before deploy so icons
are never broken in between:

1. Land the pipeline change, run the pipeline, and `pnpm run sprites:upload` the new sprites before
   merging any app change that depends on them. The previously-served objects keep serving
   production in the meantime.
2. Merge and deploy the app change (a generation bump in `sprite-url.ts`, if any sprite's pixels
   changed).
3. After the deploy is verified, the old objects are simply overwritten — there is no stale prefix
   to clean up, unlike the version-prefixed scheme this replaced (see #348).

## Local development

Sprites are not required for local development. With `PUBLIC_ASSET_ORIGIN` unset, `pnpm run dev`
resolves sprite URLs against the production bucket, so contributors get real artwork without running
the pipeline. Set `PUBLIC_ASSET_ORIGIN` in a local `.env.local` to point at a different origin (for
example a local static file server rooted at `pipeline/output/`) when testing freshly-generated
sprites before they are uploaded; if that origin is unreachable, sprite slots simply show their
placeholder.

## Repository history

Sprites lived in `static/sprites/` (tracked in Git) before #247. Removing them from the current tree
does not remove the old blobs from existing Git history. As with fonts, do not make the repository
public on the strength of this current-tree change alone — see issue #218 for the history-rewrite
and blob-reachability work that gates publication.
