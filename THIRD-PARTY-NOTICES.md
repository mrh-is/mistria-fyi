# Third-party notices

This file lists the third-party assets bundled with Mistria Field Guide and their applicable
licenses. Every production build generates `/licenses.txt` with the name, version, & license text of
each package bundled into the client (see `src/lib/build/licenses.ts`).

---

## Vendored UI components

`src/lib/components/ui/` contains components copied from
[shadcn-svelte](https://www.shadcn-svelte.com/) (itself a port of shadcn/ui) and kept under the MIT
License:

```
MIT License

Copyright (c) 2023 Hunter Johnston <https://github.com/huntabyte>
Copyright (c) 2023 CokaKoala <https://github.com/adriangonz97>
Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Upstream audit

Checked on November 24, 2026, against the
[shadcn-svelte 1.8.1 CLI release](https://github.com/huntabyte/shadcn-svelte/releases/tag/shadcn-svelte%401.8.1)
& the newer
[0.1.2 registry release](https://github.com/huntabyte/shadcn-svelte/releases/tag/%40shadcn-svelte%2Fregistry%400.1.2).
The registry includes a nullable file-input change beyond the CLI tag, so its
[source tree at `35554f2`](https://github.com/huntabyte/shadcn-svelte/tree/35554f246b65c264c79a160fd748cdff1688610f/docs/src/lib/registry/ui)
is the comparison target.

The local import commits did not record a CLI or registry revision. The closest dated registry
snapshots are
[`177f278d` (February 9)](https://github.com/huntabyte/shadcn-svelte/tree/177f278d157e9f467293b888964ce9c45cdaa57a/docs/src/lib/registry/ui),
[`2c1f74c5` (February 11)](https://github.com/huntabyte/shadcn-svelte/tree/2c1f74c5dfa2d994005f090299d3aa323e6633e3/docs/src/lib/registry/ui),
&
[`eb4d57a6` (February 27)](https://github.com/huntabyte/shadcn-svelte/tree/eb4d57a6e3208928602c163f6429c254fea945cb/docs/src/lib/registry/ui).
All three are from the shadcn-svelte 1.1.1 release era. The entries below identify the local import
& the closest comparable upstream source, with exact installation versions unknown.

The audit compared each import to its dated upstream source, then compared the local wrappers &
upstream changes to the 0.1.2 registry. It checked the current callers & the relevant Bits UI 2.22.0
primitive behavior. It kept local styling, theme, & component APIs where the upstream changes were
preset features.

| Component    | Local import | Comparable upstream source | Upstream changes & local disposition                                                                                                                                                                                                                                                                              |
| ------------ | ------------ | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alert dialog | `3c70fc22`   | `eb4d57a6`                 | The local dialog already centers with physical left positioning, as upstream does after its RTL fix. Upstream adds media, sizing, & button variants. Local confirmations use Bits UI’s alert dialog semantics & pass classes to their actions.                                                                    |
| Button       | `cfc8833c`   | `177f278d`                 | Upstream adds preset styles & sizes. Both wrappers still default native buttons to `type="button"` & make disabled links unfocusable and non-navigable. Local focus & disabled styling cover the current callers.                                                                                                 |
| Checkbox     | `cfc8833c`   | `177f278d`                 | Upstream extends the pointer target beyond the checkbox. Feedback extras already have a 44-pixel-tall label hit area. The attachment toggle in the preview sheet needs the same treatment ([#762](https://github.com/mrh-is/mistria-fyi/issues/762)). The checked & indeterminate states still come from Bits UI. |
| Collapsible  | `cfc8833c`   | `177f278d`                 | Upstream reorders barrel imports. The local binding & trigger behavior already match.                                                                                                                                                                                                                             |
| Dialog       | `4dfef0da`   | `eb4d57a6`                 | The local dialog already has RTL-safe centering & logical close-button placement. Upstream prevents trigger & close buttons from submitting forms and removes the content-to-barrel import cycle. Both changes are tracked in [#758](https://github.com/mrh-is/mistria-fyi/issues/758).                           |
| Input        | `cfc8833c`   | `177f278d`                 | The registry allows `FileList \| null` for SvelteKit remote-form bindings. Current wrapped fields take text & save import uses a native file input. The type change is tracked in [#761](https://github.com/mrh-is/mistria-fyi/issues/761).                                                                       |
| Separator    | `cfc8833c`   | `177f278d`                 | The local wrapper has the earlier vertical minimum-height fix. Upstream now uses cross-axis stretch. The current import-card divider is horizontal. The vertical change is tracked in [#760](https://github.com/mrh-is/mistria-fyi/issues/760).                                                                   |
| Sonner       | `3c05853e`   | `2c1f74c5`                 | Upstream switches to preset icons & toast classes. The local wrapper already supplies its own icons, focus style, & theme via the same svelte-sonner API.                                                                                                                                                         |
| Switch       | `63a2d100`   | `2c1f74c5`                 | Upstream reverses the checked thumb’s translation in RTL. Current locales are LTR. The thumb fix is tracked in [#759](https://github.com/mrh-is/mistria-fyi/issues/759). Upstream also adds a small-size preset.                                                                                                  |
| Toggle       | `cfc8833c`   | `177f278d`                 | Upstream moves styling into presets. The local toggle group uses this wrapper’s variant styles, and its pressed & focus states already have local styling.                                                                                                                                                        |
| Toggle group | `cfc8833c`   | `177f278d`                 | Upstream uses getters so Svelte 5 children see changes to size, spacing, & variant. The local wrapper already does this since `3e435f03`. Upstream also adds orientation-aware styles for vertical groups. The theme picker uses a horizontal group.                                                              |

---

## Wuchale runtime

Wuchale 0.26.7 and its Svelte adapter 0.21.4 declare MIT. The published packages omit the license
file, so the build includes the notice from the
[upstream repository](https://github.com/wuchalejs/wuchale/blob/main/LICENSE).

```
MIT License

Copyright (c) 2025 Kidus Adugna

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

```

---

## Fonts

### Instrument Serif

- **File:** `static/fonts/instrument-serif-italic.woff2`
- **Designer:** Rodrigo Fuenzalida
- **Source:** [Google Fonts](https://fonts.google.com/specimen/Instrument+Serif)
- **License:** SIL Open Font License 1.1 (full text below)

Copyright 2022 The Instrument Serif Project Authors (https://github.com/Instrument/instrument-serif)

### Petrona

- **Files:** `static/fonts/petrona-latin.woff2`, `static/fonts/petrona-italic-latin.woff2`
- **Designer:** Ringo R. Aguirre
- **Source:** [Google Fonts](https://fonts.google.com/specimen/Petrona)
- **License:** SIL Open Font License 1.1 (full text below)

Copyright 2011 The Petrona Project Authors (https://github.com/RingoRohe/Petrona)

### Fragment Mono

- **File:** `static/fonts/fragment-mono-regular.woff2`
- **Designer:** Wei Huang
- **Source:** [Google Fonts](https://fonts.google.com/specimen/Fragment+Mono),
  [GitHub](https://github.com/weiweihuanghuang/fragment-mono)
- **License:** SIL Open Font License 1.1 (full text below)

Copyright 2022 The Fragment Mono Project Authors (https://github.com/weiweihuanghuang/fragment-mono)

### IBM Plex Mono

- **File:** `static/fonts/ibm-plex-mono-latin.woff2`
- **Designer:** Mike Abbink, IBM Corp.
- **Source:** [Google Fonts](https://fonts.google.com/specimen/IBM+Plex+Mono),
  [GitHub](https://github.com/IBM/plex)
- **License:** SIL Open Font License 1.1 (full text below)

Copyright 2017 IBM Corp. (https://github.com/IBM/plex)

### Satoshi

- **Production asset:** `https://assets.mistria.fyi/fonts/satoshi-regular.woff2`
- **Designer:** Deni Anggara
- **Source:** [Fontshare](https://www.fontshare.com/fonts/satoshi) (Indian Type Foundry)
- **License:** ITF Free Font License

Satoshi is proprietary freeware distributed by Indian Type Foundry through Fontshare. It is
self-hosted for the deployed application under Fontshare’s published web-font guidance, but its font
file is not distributed through this source repository or licensed under GPL-3.0-only. Contributors
who need a local copy must obtain it directly from Fontshare. The license and self-hosting guidance
are available at [Fontshare’s license page](https://www.fontshare.com/licenses/itf-ffl) and
[FAQ](https://www.fontshare.com/faq).

Copyright Indian Type Foundry. All rights reserved.

### Locale fonts (Fontsource)

- **Production assets:** `https://assets.mistria.fyi/fonts/<package>-<version>/…`
- **Source:** [Fontsource](https://fontsource.org) packages under `@fontsource/*`, pinned in
  `scripts/locale-fonts/package.json` and its lockfile; the served chunks are copied unmodified by
  `scripts/locale-fonts`
- **License:** SIL Open Font License 1.1 (full text below)

| Family                 | Locale  | Copyright                                                                                                             |
| ---------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| Shippori Mincho        | ja      | Copyright 2021 The Shippori Mincho Project Authors (https://github.com/fontdasu/ShipporiMincho)                       |
| BIZ UDPMincho          | ja      | Copyright 2022 The BIZ UDMincho Project Authors (https://github.com/googlefonts/morisawa-biz-ud-mincho)               |
| M PLUS 1 Code          | ja      | Copyright 2021 The M+ FONTS Project Authors (https://github.com/coz-m/MPLUS_FONTS)                                    |
| M PLUS 1p              | ja      | Copyright 2016 The M+ Project Authors                                                                                 |
| Cactus Classical Serif | zh-Hant | Copyright 2024 The Cactus Classical Serif Project Authors (https://github.com/MoonlitOwen/CactusSerif)                |
| Noto Serif TC          | zh-Hant | Google Inc.                                                                                                           |
| Noto Sans TC           | zh-Hant | Google Inc.                                                                                                           |
| LXGW WenKai TC         | zh-Hant | Copyright 2024 The LXGW WenKai Project Authors (https://github.com/lxgw/LxgwWenkaiTC)                                 |
| LXGW WenKai Mono TC    | zh-Hant | Copyright 2024 The LXGW WenKai Project Authors (https://github.com/lxgw/LxgwWenkaiTC)                                 |
| Gowun Batang           | ko      | Copyright 2021 The Gowun Batang Project Authors (https://github.com/yangheeryu/Gowun-Batang)                          |
| Nanum Gothic           | ko      | Copyright © 2010 NHN Corporation. Font designed by Sandoll Communications Inc.                                        |
| Nanum Gothic Coding    | ko      | Copyright © 2009 NHN Corporation. Font designed by Sandoll Communications Inc.                                        |
| Lora                   | ru      | Copyright 2011 The Lora Project Authors (https://github.com/cyrealtype/Lora-Cyrillic), with Reserved Font Name "Lora" |
| Golos Text             | ru      | Copyright 2019 The Golos Text Project Authors (https://github.com/googlefonts/golos-text)                             |

### LXGW WenKai GB, LXGW WenKai Mono GB

- **Production assets:** `https://assets.mistria.fyi/fonts/lxgw-wenkai-gb-1.522/…`,
  `https://assets.mistria.fyi/fonts/lxgw-wenkai-mono-gb-1.522/…`
- **Designer:** LXGW (霞鹜), derived from Klee One by FONTWORKS
- **Source:** [GitHub](https://github.com/lxgw/LxgwWenkaiGB), release v1.522
- **License:** SIL Open Font License 1.1 (full text below)
- **Modification:** subset into `unicode-range` chunks and converted to WOFF2 by
  `scripts/locale-fonts`; glyphs are otherwise unmodified

Copyright 2021 The LXGW WenKai GB Project Authors (https://github.com/lxgw/LxgwWenkaiGB)

### Chill Round Gothic

- **Production asset:** `https://assets.mistria.fyi/fonts/chill-round-gothic-3.750/…`
- **Designer:** Warren2060, derived from Source Han Sans SC
- **Source:** [GitHub](https://github.com/Warren2060/ChillRoundGothic), release v3.750
- **License:** SIL Open Font License 1.1 (full text below)
- **Modification:** subset into `unicode-range` chunks and converted to WOFF2 by
  `scripts/locale-fonts`; glyphs are otherwise unmodified

Copyright 2023 The ChillRoundGothic Project Authors

### Smiley Sans

- **Production asset:** `https://assets.mistria.fyi/fonts/smiley-sans-2.0.1/…`
- **Designer:** atelier Anchor (锚点工作室)
- **Source:** [GitHub](https://github.com/atelier-anchor/smiley-sans), release v2.0.1
- **License:** SIL Open Font License 1.1 (full text below)
- **Modification:** subset into `unicode-range` chunks and converted to WOFF2 by
  `scripts/locale-fonts`; glyphs are otherwise unmodified

Copyright 2022 The Smiley Sans Project Authors (https://github.com/atelier-anchor/smiley-sans)

---

## SIL Open Font License, Version 1.1

This license applies to Instrument Serif, Petrona, Fragment Mono, IBM Plex Mono, the Fontsource
locale fonts, LXGW WenKai GB, LXGW WenKai Mono GB, Chill Round Gothic, and Smiley Sans as noted
above.

```
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007

PREAMBLE

The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply to any
document created using the fonts or their derivatives.

DEFINITIONS

"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components
as distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to
a new environment.

"Author" refers to any designer, engineer, programmer, technical writer
or other person who contributed to the Font Software.

PERMISSION & CONDITIONS

Permission is hereby granted, free of charge, to any person obtaining a
copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components, in
Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or in
the appropriate machine-readable metadata fields within text or binary
files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the
corresponding Copyright Holder. This restriction only applies to the
primary font name as presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any Modified
Version, except to acknowledge the contribution(s) of the Copyright
Holder(s) and the Author(s) or with their explicit written permission.

5) The Font Software, modified or unmodified, in part or in whole, must
be distributed entirely under this license, and must not be distributed
under any other license. The requirement for fonts to remain under this
license does not apply to any document created using the Font Software.

TERMINATION

This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER

THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF
COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM OTHER
DEALINGS IN THE FONT SOFTWARE.
```
