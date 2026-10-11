# Font assets

## Satoshi

Mistria Field Guide uses Satoshi Regular for annotations and supporting text. Satoshi is proprietary
freeware from Indian Type Foundry, distributed through Fontshare. Fontshare permits downloaded fonts
to be self-hosted, but the font file is intentionally kept outside this source repository so the
project’s GPL-3.0-only license boundary remains unambiguous.

### Local development

The CSS checks for a locally installed font named “Satoshi Regular” or “Satoshi” before requesting
the hosted copy. A fresh clone remains usable with its system-sans-serif fallback.

For exact typography without a network connection:

1. Download Satoshi directly from [Fontshare](https://www.fontshare.com/fonts/satoshi).
2. Install the Regular face using your operating system’s font manager.
3. Restart the browser or development server if it was already running.

Do not add the font binary to Git. The legacy path `static/fonts/satoshi-regular.woff2` remains
ignored to prevent accidental recommits.

### Browser tests

CI copies the hosted font to the gitignored `tests/browser/fixtures/local/` and checks it against a
pinned SHA-256, so the geometry suite measures Satoshi’s production metrics without the font
entering the repository. See `tests/browser/fixtures/README.md` and
`docs/decisions/2026-10-08-browser-font-fidelity.md`.

### Production hosting

Production expects this public object:

```text
https://assets.mistria.fyi/fonts/satoshi-regular.woff2
```

Set it up in Cloudflare as follows:

1. Create an R2 bucket for Mistria Field Guide assets.
2. Connect the custom domain `assets.mistria.fyi` to that bucket.
3. Upload the unmodified Satoshi Regular WOFF2 file as `fonts/satoshi-regular.woff2`.
4. Set its HTTP metadata to `Content-Type: font/woff2` and, when replacing the object only at a new
   URL, `Cache-Control: public, max-age=31536000, immutable`.
5. Add the following bucket CORS policy so production and Cloudflare Pages previews may load the
   public font:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": []
  }
]
```

The application CSP permits fonts only from itself and `assets.mistria.fyi`. The service worker
runtime-caches this exact external font URL after its first successful request, retaining the
offline experience for returning visitors. Until the R2 object and custom domain exist, the app
continues to work with the local or system fallback.

### Repository history

Removing the font from the current tree does not remove the old blob from existing Git history. Do
not make the repository public on the strength of this current-tree change alone. Before
publication, either rewrite the public history to remove proprietary and unapproved assets or
publish from a clean repository containing only cleared material, as tracked by issue #218.

## Locale fonts

The base faces (Instrument Serif, Petrona, Fragment Mono, Satoshi, IBM Plex Mono) cover Latin only;
IBM Plex Mono also covers Cyrillic. Japanese, Chinese, Korean, and Russian pages swap the five
`--font-*` roles through `html:lang()` rules in `src/app.css`, and each of those locales links a
generated stylesheet, `src/lib/fonts/locale-fonts-<locale>.css`, from the root layout. The brand
mark uses `--font-brand` (Instrument Serif) in every locale. The picks and the reasoning are in
issue #269 (private beta).

The stylesheets and the woff2 chunks they reference are produced by `scripts/locale-fonts`:

- `manifest.ts` lists every family, weight, and locale. Fontsource families are pinned in the
  isolated `scripts/locale-fonts` package and copied with their pre-sliced `unicode-range` chunks.
  The Simplified Chinese faces are not on Google Fonts, so they are sliced here with the
  unicode-range table Google serves for Noto Sans SC (`simplified-chinese-unicode-ranges.json`).
- `pnpm run fonts:install` installs that package's locked dependencies. Run it once before the other
  font commands, and whenever `scripts/locale-fonts/pnpm-lock.yaml` changes. Ordinary root
  installation deliberately omits this roughly 430 MB maintainer-only toolchain.
- `pnpm run fonts:build` writes the stylesheets (committed) and stages the chunks under
  `.locale-fonts-dist/` (ignored). Only the stylesheets ship with the app; the chunks are served
  from `https://assets.mistria.fyi/fonts/<family>-<version>/…` so the service worker does not
  precache thousands of files and the Pages build stays small.
- `pnpm run fonts:check` type-checks the isolated builder, and `pnpm run fonts:lint` applies the
  repository's script lint rules to it.
- `pnpm run fonts:upload` pushes the staged chunks to the `mistria-fyi-assets` R2 bucket with the
  workspace `wrangler`, marked `immutable`. Keys embed the family version, so a font upgrade means
  bumping the version (or the Fontsource package), rebuilding, uploading, and committing the new
  stylesheets; old objects can stay.

### Rebuilding the Simplified Chinese faces

Download the release assets into `scripts/locale-fonts/input/` (ignored) before running the build:

| Family                         | Release                                                                                       | File(s)                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| LXGW WenKai GB, WenKai Mono GB | [lxgw/LxgwWenkaiGB v1.522](https://github.com/lxgw/LxgwWenkaiGB/releases)                     | `LXGWWenKaiGB-{Regular,Medium}.ttf`, `LXGWWenKaiMonoGB-Regular.ttf` |
| Chill Round Gothic             | [Warren2060/ChillRoundGothic v3.750](https://github.com/Warren2060/ChillRoundGothic/releases) | `ChillRoundGothic_Regular.otf` (inside the zip)                     |
| Smiley Sans                    | [atelier-anchor/smiley-sans v2.0.1](https://github.com/atelier-anchor/smiley-sans/releases)   | `SmileySans-Oblique.ttf` (inside the zip)                           |

Pass `--skip-sliced` to rebuild only the Fontsource stylesheets without these inputs. LXGW Neo XiHei
was considered for the annotation role but is IPA-licensed and its author advises against web-font
use, so Chill Round Gothic (OFL) fills that role instead.

### Specimen page

`/dev/fonts` (per locale, e.g. `/ja/dev/fonts`) renders each role with real UI strings, the body
weights, and a cross-locale switcher. It is `noindex` and exists for design review on preview
deployments.
