# Sprite assets

Item and villager sprites (~2,500 WebP files) are extracted from the game's assets by the pipeline
and served from the `assets.mistria.fyi` R2 bucket rather than committed to Git, following the same
pattern established for [locale fonts](font-assets.md#locale-fonts). This keeps the source tree
small, avoids overflowing Cloudflare Pages' `_routes.json` 100-rule cap (#312), and stops the
service worker from precaching every sprite on install.

## Resolver

`src/lib/sprites/sprite-url.ts` is the single place in `src/` that builds a sprite URL. A
`SpriteRef` names an entity kind & the entity’s own ID:

- `spriteUrl({ kind, id })` → `<origin>/sprites/<kind>/<id>.webp?g=<generation>`
- `itemSpriteUrl(itemId)` & `villagerSpriteUrl(villagerId)` are the `items` & `villagers` cases.

The kinds are `items`, `villagers`, & the kinds Everything pictures beside items: `cosmetics`,
`animal-variants`, `animal-cosmetics`, `mount-appearances`, `mount-perks`, `pet-skins`,
`pet-cosmetics`, & `spells`. An animal row’s ID holds a slash (`alpaca/bowtie`), so its object nests
a level deeper.

The path is keyed by the entity's own ID, not the game version: icons change far more rarely than
the game does, and this layout means a patch that doesn't touch an icon doesn't invalidate its cache
or re-upload its object. `<generation>` is the `spriteGeneration` constant in `sprite-url.ts` — bump
it only when an existing sprite's pixels change (never for a newly-added sprite); the bump is a
global cache bust with no re-upload, since R2 ignores the query string while the edge cache and
service worker key on the full URL. `<origin>` defaults to `PRODUCTION_ASSET_ORIGIN`
(`https://assets.mistria.fyi`, in `src/lib/asset-origin.ts`), overridable via the
`PUBLIC_ASSET_ORIGIN` build-time env var (see [Local development](#local-development)). No other
module constructs a sprite path; `sprite-slot.svelte` and `villager-record.svelte` both call the
resolver.

Villager icons come from a different source than items: each `fiddle/npcs/<id>.toml` has an
`icon_sprite` field (e.g. `spr_ui_generic_icon_npc_adeline`), and the matching PNG lives under
`animations/UI NEW/Generic/Icons/NPC/<icon_sprite>.png`. That name is used only to locate the source
file, the same way an item's `icon_sprite` is — the output is still keyed by villager ID
(`sprites/villagers/<villagerId>.webp`), not by the sprite name.

## Everything’s rows

`src/lib/sprites/everything-sprites.ts` gives every Everything row its art: a `SpriteRef`, or the
designed placeholder (the category’s glyph in the sprite slot) for a row the game ships no picture
of. The pipeline resolves each kind’s source PNG in `pipeline/src/extract/entity-sprites.ts`:

| Kind                | Source PNG                                                                  |
| ------------------- | --------------------------------------------------------------------------- |
| `cosmetics`         | `spr_ui_item_wearable_<id>`, else `<that>_merged` (a look drawn on a head)  |
| `animal-cosmetics`  | `spr_ui_item_<animal>_cosmetic_<id>`                                        |
| `animal-variants`   | `spr_ui_icon_animal_<animal>_<ui_key>`, for a variant with its own look     |
| `mount-appearances` | `spr_ui_icon_animal_horse_<ui_key>`                                         |
| `mount-perks`       | the perk’s `icon` in `ui/skill_menu/mount.toml`                             |
| `pet-skins`         | the `icon_sprite` of the item that unlocks the skin                         |
| `pet-cosmetics`     | the set’s `ui_icon` in `pets.toml`                                          |
| `spells`            | the spell’s `icon_key` with `_main`, as the journal draws a learned spell   |
| `items` (Renown)    | each Renown reward item’s `icon_sprite`, for items the almanac doesn’t list |

Rows without art are listed, with a reason, in `src/lib/sprites/no-art.ts`: quests (the game has no
quest icon) & the animal variants the game only recolors at runtime. Keep the list exact:

- The pipeline fails on a row with no art that the list doesn’t name, & on a listed row that has art
  or no longer exists.
- In CI, `source-checklist.test.ts` fails when an Everything row maps to neither a sprite nor an
  entry, & `tests/browser/fixtures.test.ts` fails when a mapped sprite outside `items/` &
  `villagers/` has no staged file in the manifest.

`pnpm run sprites:report` prints the audit as Markdown: every row without a sprite, by category &
reason, & each Renown reward’s sprite. Add `-- --staged` to check each sprite against
`pipeline/output/sprites/`, or `-- --remote` to check it against the production bucket after an
upload.

## Production hosting

Objects are overwritten in place at a stable, entity-ID-keyed path and served with a revalidating
`Cache-Control`, so removing one reaches returning visitors. A content change is always accompanied
by a generation bump, which changes the URL's query string, not the object's key:

```text
https://assets.mistria.fyi/sprites/items/<itemId>.webp
https://assets.mistria.fyi/sprites/villagers/<villagerId>.webp
```

The kind directories (`items/`, `villagers/`, `cosmetics/`, & the rest) exist so entity kinds can't
shadow one another, and map one-to-one onto the resolver's `SpriteKind`. Duplicates are expected and
left alone: sprites shared by more than one item (Aldarian artifact pairs, `stone_cup`,
`vegetablesoup`) are written once per item ID rather than deduplicated.

Set it up in Cloudflare as follows:

1. Reuse the existing `mistria-fyi-assets` R2 bucket and its `assets.mistria.fyi` custom domain
   (shared with fonts).
2. Upload converted sprites under the `sprites/` prefix — `pnpm run sprites:upload` does this (see
   below).
3. Set uploaded objects' HTTP metadata to `Content-Type: image/webp` and
   `Cache-Control: public, max-age=86400, stale-while-revalidate=86400`. Objects uploaded earlier
   with the one-year immutable policy keep it until re-uploaded; run
   `FORCE=1 pnpm run sprites:upload` once to migrate them.
4. The bucket's existing CORS policy (permissive `GET`/`HEAD`, see [font-assets.md](font-assets.md))
   already covers sprites; no bucket-level change is needed.

The application CSP permits images only from itself and `assets.mistria.fyi`. The service worker
caches sprites in their own `sprites-v1` cache with a 400-entry LRU cap, separate from the general
50-entry runtime cache, and never precaches them. It serves a cached sprite immediately, revalidates
it in the background once it is a day old, & evicts it when the bucket answers 403, 404, or 410 with
CORS headers (see [takedown.md](takedown.md)). Until an object exists at a given URL,
`sprite-slot.svelte` and `villager-record.svelte` render their placeholder on image error — a fresh
clone with no sprites uploaded (or an unreachable bucket) degrades gracefully rather than breaking.

## Generating and uploading sprites

Item and villager sprites are extracted by `pipeline/src/emit/sprites.ts` and staged during a
pipeline run:

```bash
pnpm run pipeline -- <path-to-extracted-assets> --sprites
```

This writes converted WebP files to `pipeline/output/sprites/<kind>/<id>.webp` (gitignored) for
items, villagers, & [Everything’s other kinds](#everythings-rows), resolving each entity's source
PNG from the game's own `icon_sprite` name internally — that name never reaches `tracker-data.json`
or the app, since the resolver builds URLs from the entity's own ID alone. A missing sprite fails
the run before anything is published, the same way for both entity kinds.

To regenerate only villager sprites — no `fiddle/` extraction needed, works directly off a Steam
install's `assets.zip` — use the narrower command instead (see
[pipeline/README.md](../pipeline/README.md) for how the two commands differ):

```bash
pnpm run sprites:villagers
```

Upload either result with:

```bash
pnpm run sprites:upload
```

`scripts/sprites/upload-sprites.ts` (on the uploader it shares with locale fonts,
`scripts/lib/r2-upload.ts`) uploads via the workspace `wrangler`, marks objects
`max-age=86400, stale-while-revalidate=86400`, skips keys whose remote ETag already matches the
local file's MD5 (checked with a cache-busting query, so a stale edge copy can't mask a current
object; `FORCE=1` to re-upload everything regardless), and — since original game assets must never
reach the public bucket by accident — refuses to run if `pipeline/output/sprites/` contains anything
other than `.webp` files.

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
the pipeline. Set `PUBLIC_ASSET_ORIGIN` in the shell, `.env`, or `.env.local` to point at a
different origin (for example a local static file server rooted at `pipeline/output/`) when testing
freshly-generated sprites before they are uploaded; if that origin is unreachable, sprite slots
simply show their placeholder. `vite.config.ts` reads it once, at startup, and uses the same value
for the sprite URLs and the CSP's `img-src`, so the override never trips the CSP. Mode-specific
files such as `.env.development` are not read, and the value never reaches the client as an
environment variable.

## Repository history

Don’t commit sprites in any form, including base64 copies baked into a design mockup or JSON file.
Bake them into a gitignored file instead, as `docs/design/field-guide/generator/bake.mjs` does.
`scripts/check-vendored-assets.ts` fails lint on long inline base64 images. Screenshots that show
sprites are fine; a sprite file or its encoded bytes is not.

Sprites lived in `static/sprites/` (tracked in Git) before #247. Removing them from the current tree
does not remove the old blobs from existing Git history. As with fonts, do not make the repository
public on the strength of this current-tree change alone — see issue #218 for the history-rewrite
and blob-reachability work that gates publication.
