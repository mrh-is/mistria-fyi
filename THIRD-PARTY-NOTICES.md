# Third-party notices

This file lists the third-party assets bundled with Mistria Field Guide and their applicable
licenses. npm dependencies are not listed here; see `package.json` and each package's own license
file under `node_modules/`.

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
  `package.json`; the served chunks are copied unmodified by `scripts/locale-fonts`
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
