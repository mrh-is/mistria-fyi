# Copyright

Copyright 2026 Michael Helmbrecht and contributors.

## Project license

The project-authored source code of Mistria Field Guide is licensed under the
[GNU General Public License v3.0 only](LICENSE) (GPL-3.0-only). This license grants rights only in
material that the project’s copyright holders are authorized to license.

### What the project license covers

Subject to the exclusions below, GPL-3.0-only applies to project-authored material including:

- Project-authored TypeScript, Svelte, CSS, and HTML source code in `src/` and `pipeline/`
- Configuration files (Vite, ESLint, Prettier, Tailwind, tsconfig, etc.)
- Build scripts and tooling
- Documentation authored by this project's contributors
- Tests

### What the project license does not cover

The following files are **not** covered by GPL-3.0-only and are instead governed by their own
respective licenses:

- **Bundled fonts** in `static/fonts/` are licensed under the SIL Open Font License 1.1 or the ITF
  Free Font License. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for details.
- **Game-derived material wherever it occurs**, including sprites in `static/sprites/`, source game
  data supplied locally through `pipeline/input/`, and game-derived portions of generated
  `tracker-data.json`, belongs to NPC Studio or its respective rights holders. It is **not**
  licensed under GPL-3.0-only or licensed for redistribution by this project. See
  [DISCLAIMER.md](DISCLAIMER.md).
- **Vendored UI components** in `src/lib/components/ui/` originate from
  [shadcn-svelte](https://www.shadcn-svelte.com/) and are licensed under the MIT License.
- **Third-party npm dependencies** in `node_modules/` are governed by their own licenses.
