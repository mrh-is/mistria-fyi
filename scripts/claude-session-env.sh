#!/usr/bin/env bash
# Claude Code SessionStart hook: expose the cloud setup script's Node runtime to the agent's shells.
#
# Claude Code captures its shell environment at startup, and the agent's Bash tool doesn't read the
# PATH line that scripts/setup-cloud-agent.sh appends to the Bash startup files. Lines written to
# $CLAUDE_ENV_FILE apply to every Bash call in the session. Local sessions exit without changes.
set -euo pipefail

node_bin="$HOME/.local/share/mistria-node/current/bin"

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
[ -n "${CLAUDE_ENV_FILE:-}" ] || exit 0
[ -x "$node_bin/node" ] || exit 0

printf 'export PATH="%s:$PATH"\n' "$node_bin" >>"$CLAUDE_ENV_FILE"
