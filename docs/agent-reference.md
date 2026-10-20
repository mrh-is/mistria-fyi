# Agent technical reference

Read the relevant heading before implementation, dependency changes, asset work, or tool
configuration. Architecture, localization, styling, save formats, wiki APIs, & cloud setup retain
their own canonical guides.

## Worktree mechanics

Worktrees are optional; use them when several sessions work at once. Harness-created worktrees and
branches (such as Claude Code’s `.claude/worktrees/` with `claude/issue-<number>-<suffix>` branches,
or Codex’s `codex/…` branches) are equally acceptable.

Create and set up a worktree with one command:

```sh
pnpm run worktree:new <issue-number>-<short-description>
```

Refresh the starting branch (usually `main`) before beginning work. This script fetches the latest
`origin/main` before creating the worktree; pass a second argument to start from another branch. For
a harness-created worktree, fetch its intended starting branch and ensure the new worktree starts at
that refreshed remote tip before setup or edits. If working directly on an existing starting branch,
use `git pull --ff-only`. Never reset existing work, switch a shared checkout, or discard local
changes to refresh a base.

This creates `.worktrees/<slug>` on a matching branch (`<issue-number>-<short-description>`),
symlinks the `.worktreeinclude` entries in from the main checkout, and runs
`pnpm install --frozen-lockfile` and `pnpm run prepare`. It never copies dependencies, caches, build
artifacts, or other writable generated directories. See
[docs/development-workflow.md §2](development-workflow.md#2-git-worktree-mechanics--workspace-isolation)
for the manual steps and troubleshooting. Inside a harness-created worktree, run
`node scripts/setup-worktree.ts` for the same symlink & install steps. It is deliberately not a pnpm
script: `verifyDepsBeforeRun: error` in `pnpm-workspace.yaml` makes `pnpm run` & `pnpm exec` refuse
to start on absent or stale dependencies rather than installing them implicitly.

**Subagent worktrees:** an orchestrator gives each editing subagent a worktree its harness lets that
subagent edit. In Claude Code, the session’s edit guard refuses Write/Edit outside the session’s own
worktree, including `.worktrees/`, so spawn editing subagents with the Agent tool’s
`isolation: "worktree"` and have each run `node scripts/setup-worktree.ts` first.

**Previews:** `preview_start` by `name` serves the session’s original folder, not the worktree. That
is the orchestrator’s checkout for a subagent, and the main checkout for a session that moved into
`.worktrees/`. Any agent working in a worktree previews its own dev server by URL & confirms it
serves the branch’s code; see
[docs/development-workflow.md](development-workflow.md#preview-from-a-worktree).

**Stashes are shared:** `refs/stash` is one stack for every linked worktree, so a bare
`git stash pop` or `apply` can restore another session’s edits. Prefer a temporary WIP commit; if
you must stash, address your entry by its commit ID (see
[docs/development-workflow.md](development-workflow.md#set-work-aside-without-the-shared-stash)).

## Asset inputs

**Check `pipeline/input/` before assuming a machine has no game files.** Worktree setup symlinks it
from the main checkout (`.worktreeinclude`), so `ls pipeline/input` settles the question; a
`needs game installation` label is not, by itself, a blocker. When present, it holds one `vX.Y.Z/`
folder per release, each with `assets/` (`fiddle/` TOML, `localization/` translation tables, `gml/`,
`tiled/`) and/or `save/`. Regenerate data from it with `pnpm run pipeline:assets`, which stamps
`CURRENT_GAME_VERSION` (`pipeline/src/game-version.ts`). Relative paths passed to the plain
`pipeline` script resolve from where you run `pnpm`; `--version` is required there (see
[pipeline/README.md](../pipeline/README.md#setup--commands)). Read
[game-asset-format.md](game-asset-format.md) before exploring the files themselves, and run
`pnpm run pipeline:atlas` for per-file keys instead of opening each file.

## Package commands

Use **pnpm** exclusively. Do **not** use `npm`, `npx`, `yarn`, `bun`, or `pnpx`. Wrangler is
installed in the workspace through `@sveltejs/adapter-cloudflare`, and `allowBuilds` in
`pnpm-workspace.yaml` approves its native dependencies (`esbuild`, `workerd`), so run it as
`pnpm exec wrangler <command>` (including `pnpm exec wrangler login`). `pnpx wrangler` installs a
separate copy that ignores `allowBuilds` and fails with `ERR_PNPM_IGNORED_BUILDS`. The R2 uploader
(`scripts/lib/r2-upload.ts`, behind `sprites:upload` & `fonts:upload`) runs the workspace binary the
same way. Wrangler may need access to Cloudflare’s API and to its stored credentials (on macOS,
under `~/Library/Preferences/.wrangler/`; on Windows, under `%APPDATA%\xdg.config\.wrangler\`);
never read or expose the stored OAuth token.

**Adding or bumping a dependency:** run `pnpm audit --audit-level=moderate` before committing, and
check what the new package pulls in (`pnpm why <transitive>` for anything flagged). Don’t add a
package whose tree carries an unpatched advisory; find an alternative. CI’s “Audit dependencies” job
enforces the same threshold. Ignore an advisory only when it’s disputed or has no fix, through
`auditConfig.ignoreGhsas` in `pnpm-workspace.yaml` with a comment linking the reason.

| Command                       | Purpose                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| `pnpm run dev`                | Dev server                                                         |
| `pnpm run preview`            | Preview the production build locally                               |
| `pnpm run build`              | Production build (Cloudflare Pages)                                |
| `pnpm run check`              | SvelteKit type checking                                            |
| `pnpm run check:i18n`         | Verify locale files match `en.json`’s keys                         |
| `pnpm run check:routes`       | Verify built static assets bypass Functions                        |
| `pnpm run lint`               | oxfmt, oxlint, ESLint, Stylelint, & ShellCheck                     |
| `pnpm run lint:fix`           | Auto-fix formatting & lint                                         |
| `pnpm run test`               | Complete Vitest suite (asset-independent)                          |
| `pnpm run test:changed`       | Vitest tests affected by branch changes                            |
| `pnpm run test:coverage`      | Complete suite plus coverage (opt-in)                              |
| `pnpm run test:app`           | App tests (`src/`)                                                 |
| `pnpm run test:client`        | App component tests (`*.client.test.ts`)                           |
| `pnpm run test:pipeline`      | Pipeline tests (`pipeline/`)                                       |
| `pnpm run test:accessibility` | Browser accessibility matrix (Playwright)                          |
| `pnpm run verify`             | Full CI matrix locally (exception-only; see agent-verification.md) |
| `pnpm run pipeline -- <path>` | Regenerate `tracker-data.json` from assets                         |
| `pnpm run data:diff [ref]`    | Path-level `tracker-data.json` changes from a ref (`origin/main`)  |

## Enforcement boundaries

- Claude Code & Codex share `PreToolUse`, `PostToolUse`, `Stop`, & `SubagentStart` command hooks in
  `.claude/settings.json` & `.codex/hooks.json`. Codex skips new or changed hooks until they are
  re-trusted in its hook review (`/hooks`); review & trust them before relying on enforcement.
- `guard-generated-paths.ts` denies file-tool edits, patch headers (including deletions & moves),
  and direct shell writes referring to generated tracker data or vendored UI. Recover by running the
  pipeline or vendor CLI. CODEOWNERS & the “Guarded paths” workflow still enforce PR ownership and
  the `shadcn-update` or `generated-data` label.
- `guard-generated-reads.ts` denies file-tool & direct shell reads of generated tracker data; read
  `src/lib/types/tracker-data.ts` or pipeline source instead. Existing symlinks are resolved.
- Shell guards check each command segment (split at `;`, `&&`, `||`, `|`, & newlines) on its own, so
  a path counts only in a segment that reads or writes it. Heredoc bodies & here-strings are text
  unless fed, directly or through a pipe, to a shell or to an interpreter (Python, Node, & similar)
  whose code calls a file-reading or file-writing API. When a target is dynamic (an expansion,
  `xargs`, or a non-literal API target), every path in the command counts; a `cd` or `pushd` widens
  writes the same way only when a write target is relative.
- Shell guards recognize direct path arguments & common read/write commands, not arbitrary shell
  programs, dynamically constructed paths, or every MCP tool. They supplement repository rules; they
  are not a filesystem sandbox. Pipeline commands remain permitted.
- `format-agent-edit.ts` formats surviving edit or patch targets with oxfmt. For Bash, a pre-tool
  snapshot identifies files changed by that invocation, including changes committed during it; shell
  reads leave existing edits untouched. Deleted files, outside-worktree symlink targets, & guarded
  paths are excluded; report formatter failures before continuing.
- `lint-agent-stop.ts` runs `lint:fix --files <paths...>` then `lint --files <paths...>` for
  existing staged, unstaged, untracked, & committed branch changes relative to `origin/main`. Lint
  errors block the first stop & return diagnostics; `stop_hook_active` permits the next stop with a
  visible failure report instead of another continuation. Fix errors or report the blocker.
- Git enumeration & lint execution use the repository root, even when clients start below it.
- `agent-subagent-start.ts` injects the focused-test command & file-ownership reminder in both
  clients; if the hook is unavailable, supply them explicitly in the delegation prompt.
- Hooks are conveniences, not verification evidence; run the required checks directly before
  committing. `pnpm run lint` & `pnpm run lint:fix` retain their full-repository behavior without
  `--files`; changed-file mode uses the same lint tools, scopes, & zero-warning checks.
- `.claude/settings.json` and `.codex/rules/default.rules` allow the same `pnpm` scripts;
  `tests/agent-permissions.test.ts` fails when a `package.json` script is in neither the allowlists
  nor its explicit exclusion list.

## Code conventions

- **TypeScript**: type-aware oxlint with every non-nursery category on (each disabled rule states
  why) + `strict: true` & `noImplicitReturns` tsconfigs. Use `type` imports
  (`consistent-type-imports`).
- **Formatting**: oxfmt; double quotes, no tabs, trailing commas, 100 char width, semicolons.
- **Linting**: oxlint for every script, ESLint only for Svelte templates. See
  [docs/development-workflow.md](development-workflow.md#linting--formatting) for which tool owns
  which rule and how to suppress each.
- **Imports**: Auto-sorted by oxfmt; externals first, then `#lib`/`#scripts`/`$app` internals, then
  relative. Import `src/lib` through the `#lib` subpath import (declared in `package.json`’s
  `imports`); SvelteKit 3 removed the `$lib` alias. Always write the file extension: `#lib` subpath
  imports don’t resolve without one, and relative imports follow the same rule for consistency. Name
  a TypeScript module by its `.js` output (`./availability.js`, `#lib/utils.js`,
  `./store.svelte.js`) and every other file by its real extension (`.svelte`, `.json`, `.css`).
  SvelteKit’s virtual `./$types` modules are the one exception. `vi.mock(...)` specifiers must match
  the import path exactly, so update them alongside the imports they mock. Scripts run under plain
  `node` can’t resolve a `.js` specifier to a `.ts` sibling, so they share modules through
  `#scripts/*`, which maps an extensionless specifier to the `.ts` source
  (`#scripts/lib/pnpm-command`).
- **Paths**: manipulate paths with `node:path`, never by splitting, joining, or slicing strings, and
  keep them working on Windows. Use the default functions for filesystem paths and `path.posix` for
  paths that are `/`-separated everywhere (repo-relative doc paths, git pathspecs, URLs, zip
  entries). See [the decision record](decisions/2026-10-13-path-apis.md).
- **Styling**: Tailwind utilities & scoped `<style>` blocks, both on the design tokens in
  `src/app.css`; Stylelint rejects color, type-size, shadow, & radius literals in scoped CSS. See
  [docs/styling.md](styling.md).
- **Svelte**: Use `let` (not `const`) for `$props()` destructuring. Use runes (`$state`, `$derived`,
  `$effect`), not legacy stores.
- **Naming**: `camelCase` variables/functions, `PascalCase` types/components, `kebab-case` files.
  Branded IDs for type safety.
- **Tests**: Colocate as `foo.test.ts` beside `foo.ts`; no `__tests__/` directories. See
  [docs/development-workflow.md §4](development-workflow.md#test-file-placement).
- **Rules**: `eqeqeq`, `prefer-const` (oxlint for scripts, `svelte/prefer-const` for Svelte files;
  `$props()` destructuring must use `let`, which is linted), `no-var`, `object-shorthand`,
  `prefer-template`, `curly` (multi-line).
