# Sprite assets

Item and villager sprites (~2,500 WebP files) are extracted from the game's assets by the pipeline
and served from the `assets.mistria.fyi` R2 bucket rather than committed to Git, following the same
pattern established for [locale fonts](font-assets.md#locale-fonts). This keeps the source tree
small, avoids overflowing Cloudflare Pages' `_routes.json` 100-rule cap (#312), and stops the
service worker from precaching every sprite on install.

## Resolver

`src/lib/sprites/sprite-url.ts` is the single place in `src/` that builds a sprite URL:

- `itemSpriteUrl(name)` → `<origin>/sprites/<game-version>/<name>.webp`
- `villagerSpriteUrl(name)` → `<origin>/villager-sprites/<game-version>/<name>.webp`

`<game-version>` comes from `TrackerData.version` (`src/lib/data/tracker-data.json`), and `<origin>`
defaults to `https://assets.mistria.fyi`, overridable via the `PUBLIC_ASSET_ORIGIN` build-time env
var (see [Local development](#local-development)). No other module constructs a sprite path;
`sprite-slot.svelte` and `villager-record.svelte` both call the resolver.

The villager path is resolver-only today: `Villager.smallIconSprite`
(`src/lib/types/tracker-data.ts`) is not yet populated by any pipeline extractor, so
`villager-record.svelte` falls through to its initials placeholder whenever a villager has no
`smallIconSprite`. The resolver, CSP, and service worker predicate cover `/villager-sprites/`
already so a future extractor is a drop-in.

## Production hosting

Objects are keyed by game version so they are immutable and cacheable forever — a version bump
changes the URL, not the object's contents:

```text
https://assets.mistria.fyi/sprites/<game-version>/<name>.webp
https://assets.mistria.fyi/villager-sprites/<game-version>/<name>.webp
```

Set it up in Cloudflare as follows:

1. Reuse the existing `mistria-fyi-assets` R2 bucket and its `assets.mistria.fyi` custom domain
   (shared with fonts).
2. Upload converted sprites under the `sprites/<game-version>/` prefix — `pnpm run sprites:upload`
   does this (see below).
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

This writes converted WebP files to `pipeline/output/sprites/<game-version>/` (gitignored). Upload
them with:

```bash
pnpm run sprites:upload
```

modeled on `scripts/locale-fonts/upload-locale-fonts.sh`: it uploads via `pnpx wrangler`, marks
objects immutable, skips keys that already serve publicly (`FORCE=1` to re-upload), and — since
original game assets must never reach the public bucket by accident — refuses to run if
`pipeline/output/sprites/` contains anything other than `.webp` files.

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
