# Copyright

Copyright 2026 Michael Helmbrecht and contributors.

## Project license

The source code of Mistria Field Guide is licensed under the
[GNU General Public License v3.0 only](LICENSE) (GPL-3.0-only).

### What the project license covers

The GPL-3.0-only license applies to all files in this repository **except** those listed under "What
the project license does not cover" below. This includes, but is not limited to:

- All TypeScript, Svelte, CSS, and HTML source code in `src/` and `pipeline/`
- Configuration files (Vite, ESLint, Prettier, Tailwind, tsconfig, etc.)
- Build scripts and tooling
- Documentation authored by this project's contributors
- Tests
- The generated `tracker-data.json` data file

### What the project license does not cover

The following files are **not** covered by GPL-3.0-only and are instead governed by their own
respective licenses:

- **Bundled fonts** in `static/fonts/` are licensed under the SIL Open Font License 1.1 or the ITF
  Free Font License. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for details.
- **Game-derived assets** (sprites in `static/sprites/`, game data files in `pipeline/input/`) are
  the property of NPC Studio and are **not** licensed for redistribution by this project. See
  [DISCLAIMER.md](DISCLAIMER.md).
- **Vendored UI components** in `src/lib/components/ui/` originate from
  [shadcn-svelte](https://www.shadcn-svelte.com/) and are licensed under the MIT License.
- **Third-party npm dependencies** in `node_modules/` are governed by their own licenses.
