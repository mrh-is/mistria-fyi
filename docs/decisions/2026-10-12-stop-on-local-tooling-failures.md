# Stop & report local tooling failures

## Context

The recurring-friction guidance let agents work around a broken tool, then report the workaround
afterward. A workaround can install software, change configuration, or touch credentials (for
example a Wrangler login) without the user choosing it (#25). Per-machine setup was also scattered
across docs & issue comments (#17).

## Decision

Agents stop on the first local tooling failure, report the command, the redacted error, & the
blocked work, & wait for the user's direction. `node scripts/machine-doctor.ts` is the read-only
diagnostic (invoked directly since [2026-10-13](2026-10-13-no-implicit-dependency-installs.md)) &
`docs/machine-setup.md` is the repair procedure; the user or a human runs it. The doctor never
installs, configures, or authenticates.

## Alternatives

1. **A doctor that also installs what it safely can:** rejected for now; installing is the action
   the policy reserves for the user, & the doctor must be safe for agents to run.
2. **Keep the after-the-fact workaround report:** rejected; it authorizes the behavior the issue
   forbids.
3. **A shell/PowerShell script:** rejected; Node is already required, & type-stripped TypeScript
   runs with `node` alone before `pnpm install`.

## Revisit if

Setup drift keeps costing time after the doctor exists, in which case an opt-in `--install` mode for
package-manager installs is worth considering; or Linux becomes a supported contributor platform.
