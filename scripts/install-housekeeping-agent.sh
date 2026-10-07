#!/usr/bin/env bash
# Install (or, with --uninstall, remove) a macOS launchd agent that runs scripts/housekeeping.sh
# hourly from this repository's primary checkout. Agent worktrees come & go, so the agent never
# points into one.
set -euo pipefail

label=is.mrh.mistria-fyi.housekeeping
plist="$HOME/Library/LaunchAgents/$label.plist"
domain="gui/$(id -u)"

if [ "$(uname)" != Darwin ]; then
  echo "The housekeeping agent uses launchd, which needs macOS." >&2
  exit 1
fi

launchctl bootout "$domain/$label" 2>/dev/null || true
if [ "${1:-}" = --uninstall ]; then
  rm -f "$plist"
  echo "Removed $label."
  exit 0
fi

primary=$(git worktree list --porcelain | sed -n '1s/^worktree //p')
script="$primary/scripts/housekeeping.sh"
if [ ! -f "$script" ]; then
  echo "$script doesn't exist; update the primary checkout first." >&2
  exit 1
fi
# launchd starts jobs with a minimal PATH, so carry over where git & gh live.
path=$(dirname "$(command -v gh)"):$(dirname "$(command -v git)"):/usr/bin:/bin:/usr/sbin:/sbin

mkdir -p "$(dirname "$plist")"
cat >"$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$script</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$path</string>
  </dict>
  <key>StartInterval</key>
  <integer>3600</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
EOF
plutil -lint -s "$plist"
launchctl bootstrap "$domain" "$plist"
echo "Installed $label: runs $script hourly; logs to ~/Library/Logs/mistria-housekeeping.log."
