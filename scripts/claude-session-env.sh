#!/usr/bin/env bash
# Claude Code SessionStart hook: expose the cloud setup script's Node runtime to the agent's shells.
#
# Claude Code captures its shell environment at startup, and the agent's Bash tool doesn't read the
# PATH line that scripts/setup-cloud-agent.sh appends to the Bash startup files. Lines written to
# $CLAUDE_ENV_FILE apply to every Bash call in the session. Local sessions exit without changes.
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
[ -n "${CLAUDE_ENV_FILE:-}" ] || exit 0

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
node_bin="$HOME/.local/share/mistria-node/current/bin"
expected="v$(tr -d '[:space:]' <"$repo_root/.node-version")"

# A cached environment keeps the Node its setup installed and skips the setup script, so rerun it
# after .node-version changes. Its output goes to stderr to stay out of Claude's context.
if [ ! -x "$node_bin/node" ] || [ "$("$node_bin/node" --version)" != "$expected" ]; then
  bash "$repo_root/scripts/setup-cloud-agent.sh" >&2
fi

printf 'export PATH="%s:$PATH"\n' "$node_bin" >>"$CLAUDE_ENV_FILE"
