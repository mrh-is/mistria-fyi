# Cloud agent environments

Claude Code cloud and Codex cloud use fresh Linux checkouts that do not inherit local tools or
credentials. Configure both environments to run the repository bootstrap script, use Node from
`.node-version`, and grant only read access to Cloudflare Pages build logs.

The checked-in setup script downloads Node from `nodejs.org`, verifies its published SHA-256
checksum, persists it through `~/.bashrc`, and runs `pnpm install --frozen-lockfile`. The frozen
install runs the repository’s `prepare` lifecycle, including Paraglide compilation and SvelteKit
sync.

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
   bash scripts/setup-cloud-agent.sh
   ```

7. Save the environment. Reopen its settings, find **API credentials**, and select **Add
   credential**.
8. Name the credential `Cloudflare Pages read`, set **Allowed websites** to `api.cloudflare.com`,
   retain the `Authorization` header with the `Bearer` prefix, paste the read-only token as its
   value, and select **Connect**.
9. Start a new cloud session in this environment. Existing sessions do not receive environment
   edits.

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
3. If **Set package versions** offers Node 26.5.0, select it. The setup script still enforces
   `.node-version`, so this selection is an optimization rather than a requirement.
4. Add these environment variables, replacing both placeholders:

   ```dotenv
   CLOUDFLARE_ACCOUNT_ID=your-account-id
   CLOUDFLARE_API_TOKEN=your-pages-read-token
   ```

5. Set the setup script to:

   ```sh
   bash scripts/setup-cloud-agent.sh
   ```

6. Set the optional maintenance script to the same command. It is idempotent and refreshes the
   frozen install when Codex resumes a cached container on a newer commit.
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

In one new session for each environment, ask the agent to run:

```sh
node --version
pnpm --version
pnpm run paraglide:compile
pnpm run cloudflare:logs -- <deployment-id>
gh auth status
```

The Node command must match `.node-version`; Paraglide must compile without requesting jsDelivr; the
log command must print timestamped build-log lines; and GitHub authentication must cover the
attached repository. For Claude with a protected API credential, `CLOUDFLARE_API_TOKEN` should be
unset even though the log request succeeds.

If setup fails before the agent starts, inspect the setup output first. A checksum error means the
Node archive or checksum response was incomplete and the environment should be retried. A frozen
lockfile error means `package.json` and `pnpm-lock.yaml` disagree and must be fixed in the
repository, not bypassed with a non-frozen install. After changing either environment’s setup
fields, start a new session; for Codex, reset its cached container as well.
