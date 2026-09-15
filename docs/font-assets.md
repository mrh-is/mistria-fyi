# Font assets

Mistria Field Guide uses Satoshi Regular for annotations and supporting text. Satoshi is proprietary
freeware from Indian Type Foundry, distributed through Fontshare. Fontshare permits downloaded fonts
to be self-hosted, but the font file is intentionally kept outside this source repository so the
project’s GPL-3.0-only license boundary remains unambiguous.

## Local development

The CSS checks for a locally installed font named “Satoshi Regular” or “Satoshi” before requesting
the hosted copy. A fresh clone remains usable with its system-sans-serif fallback.

For exact typography without a network connection:

1. Download Satoshi directly from [Fontshare](https://www.fontshare.com/fonts/satoshi).
2. Install the Regular face using your operating system’s font manager.
3. Restart the browser or development server if it was already running.

Do not add the font binary to Git. The legacy path `static/fonts/satoshi-regular.woff2` remains
ignored to prevent accidental recommits.

## Production hosting

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

## Repository history

Removing the font from the current tree does not remove the old blob from existing Git history. Do
not make the repository public on the strength of this current-tree change alone. Before
publication, either rewrite the public history to remove proprietary and unapproved assets or
publish from a clean repository containing only cleared material, as tracked by issue #218.
