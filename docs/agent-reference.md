# Agent technical reference

Read the relevant heading before implementation, dependency changes, asset work, or tool
configuration. Architecture, localization, styling, save formats, wiki APIs, & cloud setup each keep
their own canonical guide.

`docs/decisions/` holds the few choices a newcomer would propose reversing. Each record says what
was decided, what was rejected, & when to revisit it.

## Worktree mechanics

Worktrees are optional; use them when several sessions work at once. Worktrees & branches that a
harness creates are equally acceptable. Examples include Claude Code’s `.claude/worktrees/` with
`claude/issue-<number>-<suffix>` branches, and Codex’s `codex/…` branches.

[Worktrees](../AGENTS.md#worktrees) has the rules, including which setup command to run & what’s
preauthorized.
[docs/development-workflow.md §2](development-workflow.md#2-git-worktree-mechanics--workspace-isolation)
has what those commands do, the base-branch steps, & the manual fallback.

The setup script is deliberately not a pnpm script. `verifyDepsBeforeRun: error` in
`pnpm-workspace.yaml` makes `pnpm run` & `pnpm exec` refuse to start when dependencies are missing
or stale, instead of installing them implicitly.

**No automatic setup:** no hook links files or installs dependencies, apart from a cloud environment
rerunning setup when `.node-version` mismatches, so setup is one explicit step (see the
[decision record](decisions/2026-11-05-explicit-worktree-setup.md)).

- A new editing worktree runs `node scripts/setup-worktree.ts` once, before the first edit.
- A read-only session runs nothing. It can read, search, & use `git` & `gh` without dependencies.
  Its `pipeline/input/` link may be absent, so it looks in the main checkout’s instead.
- The main checkout & cloud environments use `pnpm install --frozen-lockfile`. Cloud environments
  have no linked worktrees, so they need no links.
- Until setup runs, a linked worktree may have no Git hooks, because `prepare` generates them. CI
  still runs the checks they would have run.
- Rerunning setup is safe: it skips entries that are already linked. If setup fails, diagnose with
  `node scripts/machine-doctor.ts --for core`.

**No shared dependencies:** a worktree never links `node_modules` from another checkout, for two
reasons:

- pnpm records each install’s workspace layout, so `verifyDepsBeforeRun` refuses a linked directory
  with `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN`.
- Vitest & Vite write caches beneath `node_modules`, so a link would share them between concurrent
  sessions.

An isolated frozen install from the shared global store takes seconds. It gives each worktree its
own caches & build state. With `enableGlobalVirtualStore`, a worktree’s `node_modules` holds
symlinks into one package tree under the pnpm store’s `links/` folder, so it takes a few megabytes
rather than a gigabyte. Without hoisting, a package that imports an undeclared dependency (often
only in its type declarations) fails to resolve; declare that dependency under `packageExtensions`
in `pnpm-workspace.yaml`.

**Subagent worktrees:** an orchestrator gives each editing subagent a worktree that its harness lets
the subagent edit. In Claude Code, the session’s edit guard refuses Write & Edit outside the
session’s own worktree, including in `.worktrees/`. So spawn editing subagents with the Agent tool’s
`isolation: "worktree"`, and have each run `node scripts/setup-worktree.ts` first.

**Previews & stashes:** see
[Preview from a worktree](development-workflow.md#preview-from-a-worktree) &
[Set work aside without the shared stash](development-workflow.md#set-work-aside-without-the-shared-stash).

## Asset inputs

**Check `pipeline/input/` before assuming a machine has no game files.** Worktree setup symlinks it
from the main checkout (`SHARED_DIRECTORIES` in `scripts/setup-worktree.ts`), so `ls pipeline/input`
settles the question once setup has run. Before setup, look in the main checkout’s
`pipeline/input/`. A `needs game installation` label alone doesn’t block a task.

When present, `pipeline/input/` holds one `vX.Y.Z/` folder per release. Each has `assets/`, `save/`,
or both. The `assets/` folder holds:

- `fiddle/` TOML,
- `localization/` translation tables,
- `gml/`,
- `tiled/`.

To work with these files:

- Regenerate data with `pnpm run pipeline:assets`, which stamps `CURRENT_GAME_VERSION`
  (`pipeline/src/game-version.ts`).
- The plain `pipeline` script resolves relative paths from where you run `pnpm`, and it requires
  `--version` (see [pipeline/README.md](../pipeline/README.md#setup--commands)).
- Read [game-asset-format.md](game-asset-format.md) before exploring the files themselves.
- Run `pnpm run pipeline:atlas` for each file’s keys instead of opening every file.

## Package commands

Use **pnpm** only. Do **not** use `npm`, `npx`, `yarn`, `bun`, or `pnpx`.

Wrangler comes into the workspace through `@sveltejs/adapter-cloudflare`. `allowBuilds` in
`pnpm-workspace.yaml` approves its native dependencies, `esbuild` & `workerd`. So run Wrangler as
`pnpm exec wrangler <command>`, including `pnpm exec wrangler login`. `pnpx wrangler` installs a
separate copy that ignores `allowBuilds` and fails with `ERR_PNPM_IGNORED_BUILDS`. The R2 uploader
(`scripts/lib/r2-upload.ts`, behind `sprites:upload` & `fonts:upload`) runs the workspace binary the
same way. It loads `R2_UPLOAD_TOKEN` from the main checkout's `.env.r2-upload` or the shell, hands
it to Wrangler as `CLOUDFLARE_API_TOKEN`, and refuses a real upload without that token rather than
falling back to a stored login.

Wrangler may need access to Cloudflare’s API & to its stored credentials. Those live under
`~/Library/Preferences/.wrangler/` on macOS and under `%APPDATA%\xdg.config\.wrangler\` on Windows.
Never read or expose the stored OAuth token.

**Adding or bumping a dependency:**

1. Run `pnpm audit --audit-level=moderate` before committing.
2. Check what the new package pulls in, with `pnpm why <transitive>` for anything flagged.
3. Don’t add a package whose tree carries an unpatched advisory; find an alternative.

CI’s “Audit dependencies” job enforces the same threshold. Ignore an advisory only when it’s
disputed or has no fix. Do that through `auditConfig.ignoreGhsas` in `pnpm-workspace.yaml`, with a
comment linking the reason.

The build publishes `/licenses.txt` for every package bundled into the client. It fails when a
package ships no license text. Instead of weakening that check, list the package in
`LICENSE_ALLOWLIST` (`src/lib/build/licenses.ts`) with the reason it was reviewed.

| Command                       | Purpose                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| `pnpm run dev`                | Dev server                                                         |
| `pnpm run preview`            | Preview the production build locally                               |
| `pnpm run build`              | Production build (Cloudflare Pages)                                |
| `pnpm run check`              | SvelteKit type checking                                            |
| `pnpm run check:i18n`         | Verify Wuchale extraction and translation completeness             |
| `pnpm run check:routes`       | Verify built static assets bypass Functions                        |
| `pnpm run knip`               | Find unused files, exports, & dependencies                         |
| `pnpm run lint`               | oxfmt, oxlint, ESLint, Stylelint, directive reasons, & ShellCheck  |
| `pnpm run lint:fix`           | Auto-fix formatting & lint                                         |
| `pnpm run test`               | Complete Vitest suite (asset-independent)                          |
| `pnpm run test:coverage`      | Complete suite plus coverage (opt-in)                              |
| `pnpm run test:app`           | App tests (`src/`)                                                 |
| `pnpm run test:client`        | App component tests (`*.client.test.ts`)                           |
| `pnpm run test:pipeline`      | Pipeline tests (`pipeline/`)                                       |
| `pnpm run test:accessibility` | Browser accessibility matrix (Playwright)                          |
| `pnpm run verify`             | Full CI matrix locally (exception-only; see agent-verification.md) |
| `pnpm run pipeline -- <path>` | Regenerate `tracker-data.json` from assets                         |
| `pnpm run data:diff [ref]`    | Path-level `tracker-data.json` changes from a ref (`origin/main`)  |
| `pnpm run game-update:report` | Game-update review report (ID inventory, keys, sprite deltas)      |

## Enforcement boundaries

### Codex filesystem sandbox

Codex’s “workspace-write” policy protects Git metadata independently of checkout files. For linked
worktrees, it follows the “.git” pointer & protects the external target too. Command approval rules
& repository hooks cannot make that target writable. See [Codex Git sandbox](codex-git-sandbox.md)
for the verified diagnostic syntax, exact-path workaround limits, & fresh-session checks.

### Hooks

- **Shared hooks:** Claude Code & Codex share one upkeep hook, configured in `.claude/settings.json`
  & `.codex/hooks.json`: edit formatting at `PostToolUse`. Claude Code also exposes the cloud Node
  runtime at `SessionStart`, which reinstalls only when the cloud Node is out of date. No other hook
  installs dependencies.
- **No blocking hooks:** none of these hooks blocks a tool call when it fails. The repository
  enforces file boundaries with permission rules & CI instead (see below). Shell-command guards were
  removed in #417, after they refused legitimate commands dozens of times and caught no real
  violation.
- **Copilot CLI:** in a trusted folder, Copilot also reads `.claude/settings.json`.
  [Its reference](https://docs.github.com/en/copilot/reference/hooks-reference) documents
  Claude-style payloads for PascalCase events, alongside native camelCase payloads. The upkeep
  handler formats Claude-style edits, which need no tool ID, and skips native payloads.
- **Codex trust:** Codex skips new or changed hooks until they’re trusted again in its hook review
  (`/hooks`).
- **When hook changes apply:** hook changes take effect in the next session. Claude Code runs each
  hook from `$CLAUDE_PROJECT_DIR`, which is fixed at session start to the session’s original
  checkout. So an edit to a hook script or its settings in a worktree, including a subagent’s,
  doesn’t change the hooks of that session.
- **Hooks aren’t evidence:** run the required checks directly before committing. Without `--files`,
  `pnpm run lint` & `pnpm run lint:fix` still cover the full repository. Changed-file mode uses the
  same lint tools, scopes, & zero-warning checks.

### File deny rules

Claude Code’s `permissions.deny` in `.claude/settings.json` blocks these paths for its file tools:

| Rule                                      | Covers                                                               |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `Read(**/.env.r2-upload)`                 | Read, Grep, & Glob of the R2 upload token                            |
| `Read(**/src/lib/data/tracker-data.json)` | Reading the generated tracker data into context                      |
| `Edit(**/src/lib/data/tracker-data.json)` | Edit, Write, MultiEdit, & NotebookEdit on the generated tracker data |

The `**/` prefix also matches the copies in nested `.worktrees/<name>/` checkouts, which a session
rooted at the original checkout would otherwise miss.

These rules don’t cover shell commands while Claude Code’s sandbox is off, and Codex & Copilot have
no equivalent. Both Claude Code (`sandbox.enabled` merges `Read` deny rules into the sandbox) &
Codex (a `[permissions.<name>]` profile with `"deny"` paths) can deny shell reads, but neither is
on, so the rules in `AGENTS.md` stand for every client.

### CI checks

- **Generated tracker data:** CODEOWNERS & the “Guarded paths” workflow require the `generated-data`
  label & `pnpm run data:diff` output on any PR that changes the tracker data.
  `src/lib/components/ui/` is project-owned & isn’t guarded.

### Rules without enforcement

These rules rest on `AGENTS.md` alone:

- **OAuth tokens:** never read gh’s `hosts.yml` or Wrangler’s config. Use `gh auth status` or
  `pnpm exec wrangler whoami`.
- **Assets:** list `assets.zip` or extract named entries; extracting the whole archive needs the
  user’s approval.
- **Releases:** change `package.json`’s version or create tags only for an approved release.
- **Shared stash:** never use bare `git stash` or `git stash pop`.
- **Agent authorship:** add a `Co-Authored-By` trailer to agent-authored commits. Sign
  agent-authored issue bodies & substantive comments with `Agent: <agent-id>`.
- **GitHub bodies:** pass multiline text with `--body-file`.
- **Dependencies:** follow [Package commands](#package-commands) before adding or bumping one.

### Formatting hook

- **Formatter:** `format-agent-edit.ts` formats surviving edit or patch targets with oxfmt. Shell
  commands aren’t formatted; `pnpm run lint:fix` & the pre-commit `lint-staged` hook cover them.
  - It skips files with unresolved index stages, so it never rewrites conflict markers. Those files
    get formatted once they’re resolved & staged.
  - It excludes deleted files, symlink targets outside the worktree, & guarded paths.
  - Report formatter failures before continuing. The exception is pnpm’s stale-dependency error,
    which fires in a worktree that hasn’t been set up or after a manifest edit. The hook then names
    the setup command to run.
- **Repository root:** formatting runs from the repository root, even when a client starts below it.

### Subagents & permissions

- **Subagent prompts:** put the focused-test command & the subagent’s file ownership in its
  delegation prompt.
- **Permission parity:** `.claude/settings.json` & `.codex/rules/default.rules` allow the same
  `pnpm` scripts. `tests/agent-permissions.test.ts` fails when a `package.json` script is in neither
  the allowlists nor the test’s explicit exclusion list.

## Code conventions

- **TypeScript:** type-aware oxlint runs with every non-nursery category on, and each disabled rule
  states why. The tsconfigs set `strict: true` & `noImplicitReturns`. Use `type` imports
  (`consistent-type-imports`).
- **Formatting:** oxfmt, with double quotes, no tabs, trailing commas, a 100-character width, &
  semicolons.
- **Linting:** oxlint covers every script, and ESLint covers only Svelte templates.
  [docs/development-workflow.md](development-workflow.md#linting--formatting) says which tool owns
  which rule & how to suppress each.
- **Imports:**
  - oxfmt sorts imports: externals first, then `#lib`, `#scripts`, & `$app` internals, then relative
    imports.
  - Import `src/lib` through the `#lib` subpath import, declared in `package.json`’s `imports`.
    SvelteKit 3 removed the `$lib` alias.
  - Always write the file extension. `#lib` subpath imports don’t resolve without one, and relative
    imports follow the same rule for consistency.
  - Name a TypeScript module by its `.js` output (`./availability.js`, `#lib/utils.js`,
    `./store.svelte.js`). Name every other file by its real extension (`.svelte`, `.json`, `.css`).
    SvelteKit’s virtual `./$types` modules are the one exception.
  - `vi.mock(...)` specifiers must match the import path exactly, so update them along with the
    imports they mock.
  - Scripts run under plain `node` can’t resolve a `.js` specifier to a `.ts` sibling. They share
    modules through `#scripts/*`, which maps an extensionless specifier to the `.ts` source
    (`#scripts/lib/pnpm-command`).
- **Paths:** manipulate paths with `node:path`, never by splitting, joining, or slicing strings, and
  keep them working on Windows. Use the default functions for filesystem paths. Use `path.posix` for
  paths that are `/`-separated everywhere: repo-relative doc paths, git pathspecs, URLs, & zip
  entries. See
  [the decision record](https://github.com/mrh-is/mistria-fyi/blob/2941c9bf35350d638b77d2d28160556dc76f85de/docs/decisions/2026-10-13-path-apis.md).
- **Styling:** Tailwind utilities & scoped `<style>` blocks, both built on the design tokens in
  `src/app.css`. Stylelint rejects literal colors, type sizes, shadows, & radii in scoped CSS. See
  [docs/styling.md](styling.md).
- **Svelte:** use `let`, not `const`, for `$props()` destructuring. Use runes (`$state`, `$derived`,
  `$effect`), not legacy stores.
- **Naming:** `camelCase` for variables & functions, `PascalCase` for types & components, &
  `kebab-case` for files. Use branded IDs for type safety.
- **Tests:** colocate each test as `foo.test.ts` beside `foo.ts`, with no `__tests__/` directories.
  See [docs/development-workflow.md §4](development-workflow.md#test-file-placement).
- **Rules:** `eqeqeq`, `prefer-const`, `no-var`, `object-shorthand`, `prefer-template`, & `curly`
  (multi-line). oxlint applies `prefer-const` to scripts, and `svelte/prefer-const` applies it to
  Svelte files. `$props()` destructuring must use `let`, which lint checks.
