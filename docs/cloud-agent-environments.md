# Cloud agent environments

Claude Code cloud and Codex cloud use fresh Linux checkouts that do not inherit local tools or
credentials. Configure both environments to install dependencies on a supported Node version, and
grant only read access to Cloudflare Pages build logs.

Both environments run Node 24, the repository’s version, but get it differently:

- **Claude Code cloud** ships Node 22.22.0, below the dependency floor of 24.15. Its setup script
  installs Node from `.node-version`.
- **Codex cloud** ships Node 24 (24.19 as of October 2026), which `package.json`’s `engines` range
  accepts. Its agent phase can write only under `/workspace` and temporary directories, and its home
  directory doesn’t persist from setup, so a downloaded runtime couldn’t reach the agent’s `PATH`
  anyway. Codex uses its preinstalled Node, which may trail `.node-version` by a few patch releases.

Revisit `.node-version` when both images ship a newer LTS line; Node 24 reaches end of life in
April 2028.

The checked-in Claude setup script downloads Node from `nodejs.org`, verifies its published SHA-256
checksum, adds it to `PATH` in the Bash startup files, and runs `pnpm install --frozen-lockfile`.
The frozen install runs the repository’s `prepare` lifecycle, including Paraglide compilation and
SvelteKit sync.

## Cloudflare credential

Create one account-scoped, read-only token for cloud diagnostics:

1. Open the Cloudflare dashboard, select the account that owns `mistria-fyi`, and go to **Manage
   account → API tokens**.
2. Select **Create token → Create custom token**.
3. Name it `Mistria cloud agent build logs`.
4. Add **Account → Cloudflare Pages → Read**. Do not grant **Edit** or **Write**.
5. Limit the token’s account resources to the account that owns the Pages project.
6. Leave client-IP filtering unset because hosted-agent egress addresses can change. Add a TTL only
   if rotating the token at expiry is acceptable.
7. Create the token, copy its value once, and store it in a password manager until both environments
   are configured.
8. Copy the account ID from the account’s Cloudflare overview. This ID is not secret.

The Cloudflare API accepts **Pages Read** for both the deployment list and build-log endpoints. The
project helper fetches a specific deployment’s build log:

```sh
pnpm run cloudflare:logs -- <deployment-id>
```

`CLOUDFLARE_PAGES_PROJECT` is optional and defaults to `mistria-fyi`.

## Claude Code cloud

These steps follow Anthropic’s
[cloud environment configuration](https://code.claude.com/docs/en/cloud-environments). API
credentials are available on Pro and Max plans; see the fallback below for plans where the control
is absent.

1. Open [Claude Code on the web](https://claude.ai/code), then select the cloud icon and current
   environment name above the prompt.
2. Select **Add cloud environment**, or hover over the existing environment and select its settings
   icon.
3. Name the environment `Mistria Field Guide`.
4. Set **Network access** to **Custom**, enable **Also include default list of common package
   managers**, and add `api.cloudflare.com` as an allowed domain. The default list already includes
   `nodejs.org` and `registry.npmjs.org` for setup.
5. Add this non-secret environment variable, replacing the placeholder:

   ```dotenv
   CLOUDFLARE_ACCOUNT_ID=your-account-id
   ```

6. Set the setup script to:

   ```sh
   bash mistria-fyi/scripts/setup-cloud-agent.sh
   ```

   Claude runs the setup script from the parent of the repository checkout (`/home/user`), not from
   the checkout itself, so the path must include the `mistria-fyi/` directory. The script resolves
   the repository root from its own location, so it works from any working directory.

7. Save the environment. Reopen its settings, find **API credentials**, and select **Add
   credential**.
8. Name the credential `Cloudflare Pages read`, set **Allowed websites** to `api.cloudflare.com`,
   retain the `Authorization` header with the `Bearer` prefix, paste the read-only token as its
   value, and select **Connect**.
9. Start a new cloud session in this environment. Existing sessions do not receive environment
   edits.

The setup script runs before Claude Code starts, but Claude’s Bash tool doesn’t pick up the `PATH`
line the script adds to the Bash startup files; without help, the agent’s shell resolves the image’s
`/opt/node22/bin/node`. A SessionStart hook in `.claude/settings.json` runs
`scripts/claude-session-env.sh`, which prepends the repository-managed Node directory to `PATH`
through `$CLAUDE_ENV_FILE` so every Bash call in the session uses it. The hook exits unless
`CLAUDE_CODE_REMOTE` is `true`, so local sessions keep their own Node. A cached environment skips
the setup script, so when the cached Node doesn’t match `.node-version`, the hook reruns the setup
script before exporting `PATH`.

A setup script that exits with `scripts/setup-cloud-agent.sh: No such file or directory` is using
the checkout-relative path; add the `mistria-fyi/` prefix. Claude does not cache a setup that exits
unsuccessfully, so no cache reset is required after fixing it. If an older successful setup is
cached, editing and saving the setup script invalidates that cache.

On Team and Enterprise plans, or whenever **API credentials** is unavailable, the only direct
fallback is adding `CLOUDFLARE_API_TOKEN=...` under **Environment variables**. Anyone who can use
the environment and any command running in the session can read that value. Use only the
account-scoped Pages Read token, and prefer a personal environment over an organization-shared
environment.

Claude’s GitHub proxy supplies authenticated `git` and `gh` access for the repository attached to
the session. No separate GitHub token belongs in the setup script or environment variables.

## Codex cloud

These steps follow OpenAI’s
[cloud environment configuration](https://learn.chatgpt.com/docs/environments/cloud-environment).

1. Open [Codex environment settings](https://chatgpt.com/codex/settings/environments), then create
   or edit the environment attached to this repository.
2. Name the environment `Mistria Field Guide`.
3. Leave Node at the preinstalled version (24.19 as of October 2026). Don’t download another
   runtime; see the explanation at the top of this page.
4. Add these environment variables, replacing both placeholders:

   ```dotenv
   CLOUDFLARE_ACCOUNT_ID=your-account-id
   CLOUDFLARE_API_TOKEN=your-pages-read-token
   ```

5. Set the install script to:

   ```sh
   pnpm install --frozen-lockfile
   ```

   Don’t use `scripts/setup-cloud-agent.sh`; it writes to the home directory, which is read-only
   during Codex’s agent phase.

   The checked-in `pnpm-workspace.yaml` puts pnpm’s store and metadata cache under the ignored
   `.pnpm-store/` directory. Both setup and agent commands read this configuration, so ordinary
   `pnpm install` and `pnpm run` commands work without writing to the home directory. Each worktree
   has its own store; pnpm’s setup action discovers this path for CI caching too. When moving an
   existing install from the default store, run `CI=true pnpm install --frozen-lockfile` once to
   allow pnpm to recreate `node_modules` without an interactive confirmation.

   Also add these non-secret **Environment variables**:

   ```dotenv
   XDG_CONFIG_HOME=/workspace/.config
   XDG_CACHE_HOME=/workspace/.cache
   WRANGLER_LOG_PATH=/workspace/.wrangler/logs/
   WRANGLER_REGISTRY_PATH=/workspace/.wrangler/registry
   ```

   The XDG settings give tools that honor them writable configuration and cache directories instead
   of the defaults under the read-only home directory. Keep them alongside the pnpm workspace
   settings and the explicit Wrangler paths; each controls a different set of writes. Changing
   `XDG_CONFIG_HOME` also changes where Wrangler looks for its local configuration, so use the
   environment's `CLOUDFLARE_API_TOKEN` for cloud diagnostics rather than relying on a
   home-directory login.

   SvelteKit loads the Cloudflare adapter during `prepare`, checks, and tests. Wrangler otherwise
   writes logs under `~/.config/.wrangler/logs`, and Miniflare writes its worker registry under
   `~/.config/.wrangler/registry`. The log failure is nonfatal, but the registry failure prevents
   Vitest from starting. The explicit Wrangler overrides keep both paths writable, and the XDG
   settings cover other configuration and cache writes without changing `HOME`.

6. Keep the start skill free of Node or `PATH` activation steps. The preinstalled runtime needs
   none.
7. Set agent internet access to the restricted or allowlist mode, and allow `api.cloudflare.com`.
   Setup scripts have internet access separately; the agent needs this host during its working phase
   to fetch Pages logs.
8. Save the environment and select **Reset cache** if it existed before these changes.
9. Start a new cloud task using this environment.

Codex secrets are available to setup scripts but are removed before the agent phase. The log helper
runs during the agent phase, so storing the token in Codex’s **Secrets** section does not work.
`CLOUDFLARE_API_TOKEN` is therefore agent-visible. Its account restriction and Pages Read permission
are the security boundary; never replace it with a broader Cloudflare token.

## Validation

In one new session for each environment, run the following commands from the repository checkout.
For Codex, first use `cd /workspace/mistria-fyi` if the shell starts in `/workspace`; the parent
directory has no package manifest and does not load the repository's pnpm workspace settings.

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm run check
pnpm run test
pnpm run paraglide:compile
pnpm run cloudflare:logs -- <deployment-id>
```

The Node command must match `.node-version` for Claude and print a 24.x release of at least 24.15
for Codex; Paraglide must compile without requesting jsDelivr; the log command must print
timestamped build-log lines. Use a real deployment ID from the Pages project; the command
intentionally rejects the `<deployment-id>` placeholder. For Claude with a protected API credential,
`CLOUDFLARE_API_TOKEN` should be unset even though the log request succeeds.

Install, check, and tests must exit successfully. When filtering their output with `tail`, enable
`set -o pipefail` first so the pipeline preserves failures from pnpm instead of reporting `tail`’s
successful exit status. Keep the full output when diagnosing failures: the last few stack frames can
hide the actual error message.

For Claude, also run:

```sh
gh auth status
```

Claude's GitHub proxy should authenticate `gh` for the attached repository. For Codex, an
unauthenticated `gh auth status` does not mean the repository integration is broken. Codex's product
integration can attach the repository and manage the task or pull request without placing a GitHub
token in the agent shell. Confirm that the task opened the requested branch and that
`git status --short --branch` reports the expected clean checkout; do not add a personal GitHub
token merely to make `gh auth status` pass.

If setup fails before the agent starts, inspect the setup output first. A checksum error means the
Node archive or checksum response was incomplete and the environment should be retried. A frozen
lockfile error means `package.json` and `pnpm-lock.yaml` disagree and must be fixed in the
repository, not bypassed with a non-frozen install. After changing either environment’s setup
fields, start a new session; for Codex, reset its cached container as well.
