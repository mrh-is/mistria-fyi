# Agent technical reference

Read the relevant heading before implementation, dependency changes, asset work, or tool
configuration. Architecture, localization, styling, save formats, wiki APIs, & cloud setup each keep
their own canonical guide.

The [decision index](decision-index.md) says which decisions still apply and links each replaced one
to its replacement. It’s generated from each record’s [metadata header](decision-metadata.md).

## Worktree mechanics

Worktrees are optional; use them when several sessions work at once. Worktrees & branches that a
harness creates are equally acceptable. Examples include Claude Code’s `.claude/worktrees/` with
`claude/issue-<number>-<suffix>` branches, and Codex’s `codex/…` branches.

Create & set up a worktree with one command:

```sh
pnpm run worktree:new <issue-number>-<short-description>
```

The command creates `.worktrees/<slug>` on a matching branch (`<issue-number>-<short-description>`).
Then it:

- symlinks `pipeline/input/` & the `.worktreeinclude` entries in from the main checkout,
- runs `pnpm install --frozen-lockfile`,
- runs `pnpm run prepare`.

It never copies dependencies, caches, build artifacts, or other writable generated directories.
[docs/development-workflow.md §2](development-workflow.md#2-git-worktree-mechanics--workspace-isolation)
has the manual steps & troubleshooting.

**Refreshing the base:** refresh the starting branch, usually `main`, before beginning work.

- `worktree:new` fetches the latest `origin/main` before it creates the worktree. Pass a second
  argument to start from another branch.
- For a harness-created worktree, fetch its intended starting branch. Make sure the worktree starts
  at that refreshed remote tip before setup or edits.
- If you work directly on an existing starting branch, use `git pull --ff-only`.

Never reset existing work, switch a shared checkout, or discard local changes to refresh a base.

**Harness-created worktrees:** inside one, run `node scripts/setup-worktree.ts` for the same symlink
& install steps. This standard setup is preauthorized when dependencies or included links are
missing, even if a dependency preflight check already failed. It needs no further confirmation. If
setup fails, follow the stop & report procedure in AGENTS.md.

The setup script is deliberately not a pnpm script. `verifyDepsBeforeRun: error` in
`pnpm-workspace.yaml` makes `pnpm run` & `pnpm exec` refuse to start when dependencies are missing
or stale, instead of installing them implicitly.

**Automatic initialization:** Claude Code & Codex `SessionStart` hooks run
`node scripts/setup-worktree.ts --session-start`, the harness entry point:

- In a linked worktree, it links any missing `pipeline/input/` & `.worktreeinclude` entries.
- In any checkout, including the main one, it runs the frozen install & `prepare` when dependencies
  are missing or stale. It detects that with pnpm’s own `verifyDepsBeforeRun` check.
- It leaves a current checkout alone.

Install output goes to the hook’s stderr, and the outcome arrives as session context. A failed setup
never blocks the session, but its context message is a tooling failure to report under AGENTS.md.

**Mid-session upkeep:** both clients share synchronous setup & formatting through
`scripts/agent-tool-hook.ts`. Claude Code also watches manifests & directory changes.

- `FileChanged` with matcher `pnpm-lock.yaml|package.json|pnpm-workspace.yaml` runs
  `setup-worktree.ts --file-changed`. Claude Code’s file watcher fires it for any writer (a merge, a
  pull, or an external process), so a lockfile change starts a repair. The matcher is also the watch
  list (literal names in the working directory). The script acts only on a manifest at the root of a
  checkout of this repository, skips deletions, waits three seconds (`MISTRIA_SETUP_SETTLE_MS`) for
  a burst of manifest writes such as `pnpm add` to finish, then runs the session-start probe: a
  frozen install & `prepare` only when pnpm reports stale dependencies.
- `CwdChanged` runs `setup-worktree.ts --cwd-changed` with `new_cwd` & `old_cwd`. When the move
  crosses into a different checkout of this repository, it links & installs as at session start. It
  always returns `watchPaths` (both top-level & under `hookSpecificOutput`, since the docs don’t say
  which nesting applies) for the new checkout’s manifests (`[]` outside this repository), so the
  `FileChanged` watch follows the session. Per the docs it fires for shell `cd` in the main
  conversation; whether the harness’s own move into a worktree fires it is unconfirmed.

Neither Claude event can add context for the agent or block anything. The hooks always exit 0, & an
install or failure reaches the user as a `systemMessage` terminal notification. The shared tool
handler also reports a previous setup failure to the agent at the next command boundary. The frozen
install is preauthorized, & AGENTS.md’s stop & report rule still applies to a failed setup. Setups
of one checkout (session start, file change, directory change, or tool call) serialize on a
`mistria-setup.lock` directory in that checkout’s git directory, & a waiter re-probes after
acquiring it. The lock serializes setups; it does not lock every pnpm command across sessions.

- Both clients’ `PreToolUse` hook matches `Bash`, including Codex’s unified `exec_command`. It
  checks the target checkout before taking the formatter’s snapshot, so a stale lockfile or a new
  worktree is repaired before the command starts. It probes on every shell call; there is no
  HEAD-only cache that could miss uncommitted manifest changes.
- Both clients’ `PostToolUse` hook matches shell calls & file edits, including `MultiEdit` &
  `NotebookEdit`. Claude’s `PostToolUseFailure` also reaches the shared handler for failed shell
  calls. The handler runs setup before formatting. Separate matching hooks run concurrently, so
  adding another setup handler beside the formatter would leave a race.
- The handler probes around shell calls & edits to root dependency manifests only. A root
  `package.json` edit triggers setup; a nested fixture manifest, an ordinary source edit, or a
  manifest name in patch content does not. Ordinary edits still get formatted.
- Both hooks validate the target against the configured script’s Git common directory. They use the
  payload’s `cwd`, including a per-call directory on runtimes that expose it, & support literal
  `cd … &&` plus pnpm’s directory options. They never evaluate shell text. Dynamic pnpm directory
  options remain unsupported.
- An unresolved `cd` only blocks a call when a later segment runs pnpm. Otherwise, directory
  resolution stops & the formatter keeps its last known checkout. Ordinary navigation such as
  `cd "$TMPDIR" && ls` or `cd scripts; ls` stays available.
- Commands such as `pnpm run lint:fix && pnpm run lint` & `pnpm exec vitest run … | tail` stay
  allowed. An earlier manifest-changing Git operation still blocks a later pnpm segment, such as
  `git pull && pnpm exec vitest`; split that call so setup can run between the operations. A
  compound call spanning checkouts keeps separate formatter snapshots.
- Both clients receive event-specific context when setup changes anything. A setup or formatter
  failure exits 2, preventing a pending command or returning feedback after a completed command.
  Hooks cannot undo a completed command, & an asynchronous command’s post-hook arrives when it
  finishes.

**Failure recovery:** automatic setup records a failed install, `prepare`, or link operation in
`mistria-tool-setup.failure` in the checkout’s git directory. Later automatic hooks report the
failure without retrying. Follow AGENTS.md’s stop & report procedure;
`node scripts/machine-doctor.ts --for core` remains available through the shared handler. After
explicit direction, run `node scripts/setup-worktree.ts --repair` in the affected checkout. This
forces the frozen install & `prepare`, permits dependency repair in the main checkout, & clears the
marker only on success. The main checkout still receives no worktree links. Ordinary manual worktree
setup also clears the marker on success.

Note: the standalone Codex CLI 0.165.0 drops unified exec’s `workdir` from hook input; its `cwd`
remains the session directory. Use the session directory or a literal directory in the command on
that runtime. Newer upstream code supplies the resolved command directory as `cwd`; fixture tests
cover that contract, but a trusted live session still needs to verify the installed client.

**No shared dependencies:** a worktree never links `node_modules` from another checkout, for two
reasons:

- pnpm records each install’s workspace layout, so `verifyDepsBeforeRun` refuses a linked directory
  with `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN`.
- Vitest & Vite write caches beneath `node_modules`, so a link would share them between concurrent
  sessions.

An isolated frozen install from the shared global store takes seconds. It gives each worktree its
own caches & build state.

**Subagent worktrees:** an orchestrator gives each editing subagent a worktree that its harness lets
the subagent edit. In Claude Code, the session’s edit guard refuses Write & Edit outside the
session’s own worktree, including in `.worktrees/`. So spawn editing subagents with the Agent tool’s
`isolation: "worktree"`, and have each run `node scripts/setup-worktree.ts` first.

**Previews:** `preview_start` by `name` serves the session’s original folder, not the worktree. For
a subagent, that’s the orchestrator’s checkout. For a session that moved into `.worktrees/`, it’s
the main checkout. An agent working in a worktree previews its own dev server by URL & confirms it
serves the branch’s code; see
[docs/development-workflow.md](development-workflow.md#preview-from-a-worktree).

**Stashes are shared:** `refs/stash` is one stack for every linked worktree, so a bare
`git stash pop` or `apply` can restore another session’s edits. Prefer a temporary WIP commit. If
you must stash, address your entry by its commit ID (see
[docs/development-workflow.md](development-workflow.md#set-work-aside-without-the-shared-stash)).

## Asset inputs

**Check `pipeline/input/` before assuming a machine has no game files.** Worktree setup symlinks it
from the main checkout (`SHARED_DIRECTORIES` in `scripts/setup-worktree.ts`), so `ls pipeline/input`
settles the question. A `needs game installation` label alone doesn’t block a task.

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
same way.

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
| `pnpm run check:i18n`         | Verify locale files match `en.json`’s keys                         |
| `pnpm run check:locale-sync`  | Verify a changed English message changed in each locale too        |
| `pnpm run check:routes`       | Verify built static assets bypass Functions                        |
| `pnpm run knip`               | Find unused files, exports, & dependencies                         |
| `pnpm run lint`               | oxfmt, oxlint, ESLint, Stylelint, directive reasons, & ShellCheck  |
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
| `pnpm run game-update:report` | Game-update review report (ID inventory, keys, sprite deltas)      |

## Enforcement boundaries

### Codex filesystem sandbox

Codex’s “workspace-write” policy protects Git metadata independently of checkout files. For linked
worktrees, it follows the “.git” pointer & protects the external target too. Command approval rules
& repository hooks cannot make that target writable. See [Codex Git sandbox](codex-git-sandbox.md)
for the verified diagnostic syntax, exact-path workaround limits, & fresh-session checks.

### Hooks

- **Shared hooks:** Claude Code & Codex share the same command hooks, configured in
  `.claude/settings.json` & `.codex/hooks.json`:
  - `PreToolUse`,
  - `PostToolUse`,
  - `Stop`,
  - `SubagentStop`,
  - `SubagentStart`,
  - worktree `SessionStart`.
- **Copilot CLI:** in a trusted folder, Copilot also reads `.claude/settings.json`.
  [Its reference](https://docs.github.com/en/copilot/reference/hooks-reference) documents
  Claude-style payloads for PascalCase events, alongside native camelCase payloads. The guards
  inspect the former; native payloads aren't parsed. Setup & formatting compatibility is separate
  from guard enforcement. CLI 1.0.105 sets `$CLAUDE_PROJECT_DIR`, but omits `tool_use_id` from its
  Claude-compatible events. The upkeep handler skips native payloads & those ID-less events;
  timestamps change between events and cannot pair formatter snapshots. See
  [Copilot hook upkeep](decisions/2026-10-31-copilot-hook-upkeep.md).
- **Guard crashes:** Claude Code v2.1.295+ uses `onFailure: "block"` on all four `PreToolUse`
  guards; an exit-1 crash, missing command, invalid output, or timeout blocks the call. Setup,
  formatting, & stop lint keep their existing failure behavior. See
  [Claude's failure contract](https://code.claude.com/docs/en/hooks#block-the-action-when-a-hook-fails).
  A live v2.1.316 probe blocked exit 1 & named the guard; its control without `onFailure` ran the
  tool.
- **Codex failures:** a live 0.163.0-alpha.11.2 probe recorded the guard's invocation & exit 1, but
  the tool still ran. [Codex's hook contract](https://learn.chatgpt.com/docs/hooks) documents
  explicit exit-2/JSON denials, but no `onFailure` equivalent. Don't rely on a crash as a denial in
  Codex.
- **Copilot failures:** its reference says command `preToolUse` crashes deny the call, but timeouts
  let it continue. It doesn't document `onFailure`; compatibility with the new field still needs
  Michael's live test. Don't rely on the Claude timeout guarantee in Copilot.
- **Codex trust:** Codex skips new or changed hooks until they’re trusted again in its hook review
  (`/hooks`). Review & trust them before relying on their enforcement.
- **Mid-session setup:** both clients sequence setup & formatting in one tool handler. Claude Code
  also uses `FileChanged` & `CwdChanged` (see Mid-session upkeep above).
- **When hook changes apply:** hook changes take effect in the next session. Claude Code runs each
  hook from `$CLAUDE_PROJECT_DIR`, which is fixed at session start to the session’s original
  checkout. So an edit to a hook script or its settings in a worktree, including a subagent’s,
  doesn’t change the hooks guarding that session. Hooks deliberately don’t re-exec from the tool
  call’s tree, which would let a branch weaken its own guard.
- **Changing a guard:** a PR may change a guard & also need the edit that the change newly permits.
  Land the hook change first, then make the guarded edit in a later session. Record the deferred
  criterion in the PR.
- **Hooks aren’t evidence:** run the required checks directly before committing. Without `--files`,
  `pnpm run lint` & `pnpm run lint:fix` still cover the full repository. Changed-file mode uses the
  same lint tools, scopes, & zero-warning checks.

### Generated tracker data

- **Edits:** `guard-generated-paths.ts` denies edits that refer to the generated tracker data. That
  covers file-tool edits, patch headers (including deletions & moves), & direct shell writes. To
  recover, run the pipeline.
- **Reviews & labels:** CODEOWNERS & the “Guarded paths” workflow still enforce PR ownership & the
  `generated-data` label. `src/lib/components/ui/` is project-owned & isn’t guarded.
- **Gaps:** the hook matches the exact tracker-data file. It doesn’t catch a directory-level or
  `cd`-relative write that reaches the file, but the “Guarded paths” CI check does.
- **Reads:** `guard-generated-reads.ts` denies file-tool & direct shell reads of the generated
  tracker data. Read `src/lib/types/tracker-data.ts` or the pipeline source instead. The guard
  resolves existing symlinks.

### Shell guards

- **Segments:** shell guards check each command segment on its own, splitting at `;`, `&&`, `||`,
  `|`, & newlines. A path counts only in a segment that reads or writes it.
- **Heredocs:** heredoc bodies & here-strings count as text, with one exception. They count as code
  when they’re fed, directly or through a pipe, to a shell or to an interpreter (Python, Node, &
  similar) whose code calls a file-reading or file-writing API. An unquoted heredoc’s `$(…)` &
  backtick substitutions are always checked as commands.
- **Dynamic targets:** when a target is dynamic, such as an expansion, `xargs`, or a non-literal API
  target, every path in the command counts. A `cd` or `pushd` widens writes the same way, but only
  when a write target is relative.
- **Limits:** shell guards recognize direct path arguments & common read & write commands. They
  don’t recognize arbitrary shell programs, dynamically constructed paths, or every MCP tool. They
  supplement the repository’s rules and aren’t a filesystem sandbox. Pipeline commands stay
  permitted.

### Policy guards

Both clients register `guard-agent-policy.ts` for shell commands & `guard-release-version.ts` for
shell commands, file tools, & patches. The generated-path & read guards also cover history & known
token files. These guards supplement instructions; client crashes, unsupported tools, & arbitrary
programs can still bypass them.

| Rule          | Enforcement & permitted alternative                                                                                                                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| History       | The edit guard denies `docs/superpowers/`, including its directory root. Update current docs.                                                                                                                                                              |
| OAuth         | The read guard denies `.config/gh/hosts.yml` & `.wrangler/config/*.toml` suffixes, including literal `~/` paths. Use `gh auth status` or `pnpm exec wrangler whoami`. Other secret locations remain forbidden by instruction.                              |
| Assets        | Common `unzip`, `tar`, `7z`, & Python zipfile extraction forms require named entries/subtrees. Listing & archive tests stay allowed.                                                                                                                       |
| Releases      | File tools compare the top-level package version before/after the proposed edit. Patches must be predictable; opaque shell writes to `package.json`, `pnpm version`, & tag mutations are denied. Normal dependency commands & tag inspection stay allowed. |
| Shared stash  | Bare `git stash`, `pop`, unnamed `push`, & `apply` without a commit SHA are denied. Use `push -m <name>` or `apply <sha>`.                                                                                                                                 |
| GitHub bodies | `gh issue\|pr create\|comment\|edit` bodies must end in `Agent: <agent-id>`. Multiline text needs `--body-file`; label-only edits stay allowed.                                                                                                            |
| Dependencies  | `pnpm add`, `update`, & `remove` add the audit procedure as context and remain allowed. The hook doesn't prove an audit ran.                                                                                                                               |

Only the user may enable inherited `MISTRIA_ALLOW_FULL_ASSETS=1` after approving full extraction, or
`MISTRIA_RELEASE=1` after approving a release version. Assigning either variable in the inspected
command doesn't opt in. These aren't authorization tokens: an arbitrary program or separate tool can
evade a command guard, so the underlying approval rules still apply.

Policy commands use the shared segment/heredoc splitter, check shell-fed heredocs & literal shell
`-c` programs, & inspect command substitutions. They don't evaluate variables, aliases, arbitrary
interpreter programs, or every archive option. Body files must exist before the GitHub command;
dynamic stdin can't be verified, so use a file or a heredoc. Body-file inspection refuses known
guarded read targets and never prints body content in diagnostics. Package patches whose application
can't be predicted are denied; use a file edit preserving the version instead. After a
directory-changing command, use an absolute body-file path so the guard checks the same file GitHub
will receive.

### Formatting & lint hooks

- **Formatter:** `format-agent-edit.ts` formats surviving edit or patch targets with oxfmt.
  - It skips files with unresolved index stages, so it never rewrites conflict markers. Those files
    get formatted once they’re resolved & staged.
  - For Bash, a snapshot taken before the tool call identifies the files that call changed,
    including changes committed during it. Shell reads leave existing edits untouched.
  - It excludes deleted files, symlink targets outside the worktree, & guarded paths.
  - Report formatter failures before continuing.
- **Stop-time lint:** `lint-agent-stop.ts` runs `lint:fix --files <paths...>`, then
  `lint --files <paths...>`. It covers every existing file changed relative to `origin/main`,
  whether staged, unstaged, untracked, or committed on the branch.
  - Lint errors block the first stop & return diagnostics.
  - On the next stop, `stop_hook_active` lets the stop proceed with a visible failure report,
    instead of another continuation.
  - Fix the errors or report the blocker.
- **Subagent lint:** both clients also register `SubagentStop`, using the same one-continuation
  rule. Claude Code v2.1.316's live worktree probe confirmed that `cwd` is the subagent's worktree,
  with `stop_hook_active: false` followed by `true` after a block. A second live probe used the real
  lint hook & oxlint: `probe.ts`'s `no-debugger` error reached the subagent once, then the hook let
  it finish with a failure report. Tests run the hook against linked parent/child worktrees & prove
  that only the child's changed files are linted. Codex exposes a separate `SubagentStop` event in
  its hook contract; its `Stop` entry alone doesn't cover this case.
- **Repository root:** Git enumeration & lint run from the repository root, even when a client
  starts below it.

### Subagents & permissions

- **Subagent start:** `agent-subagent-start.ts` injects the focused-test command & a file-ownership
  reminder in both clients. If the hook isn’t available, put both in the delegation prompt yourself.
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
  entries. See [the decision record](decisions/2026-10-13-path-apis.md).
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
