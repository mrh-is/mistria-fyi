#!/usr/bin/env bash
# Run ShellCheck over every tracked shell script. ShellCheck comes from the system: Homebrew
# locally, the runner image in CI, and apt in cloud checkouts (scripts/setup-cloud-agent.sh).
set -euo pipefail

if ! command -v shellcheck >/dev/null 2>&1; then
  echo "error: shellcheck is not installed; run \`brew install shellcheck\` or \`apt-get install shellcheck\`" >&2
  exit 1
fi

git ls-files -z "*.sh" | xargs -0 shellcheck
