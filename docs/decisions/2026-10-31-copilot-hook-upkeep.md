---
id: 2026-10-31-copilot-hook-upkeep
status: current
summary: >-
  Copilot’s Claude-compatible events without tool IDs skip setup & formatting, while the independent
  generated-data guards continue to run.
evidence:
  - https://github.com/mrh-is/mistria-fyi/issues/315
  - scripts/agent-tool-hook.ts
  - scripts/agent-tool-hook.test.ts
relationships: []
---

# Copilot hook upkeep

## Context

A live Copilot CLI 1.0.105 probe reproduced the denial of `echo hello`. Its hook environment sets
`CLAUDE_PROJECT_DIR`, ruling out the issue’s proposed path-resolution failure for this version. Its
payload names `PreToolUse` & `Bash`, and includes `session_id` & `timestamp`, but omits
`tool_use_id`. The shell formatter cannot create its snapshot without that per-call ID.

## Decision

Keep Copilot’s existing no-upkeep behavior for Claude-compatible events that contain a nonempty
session ID & timestamp, but no tool ID. The setup & formatting handler returns before doing work.
The independent generated-data guards still inspect the normalized tool inputs. Native Copilot
payloads without an event name retain their existing no-upkeep behavior.

Claude & Codex events without Copilot’s signature still report missing tool IDs. Events with a tool
ID retain normal upkeep, even when they also carry a session ID & timestamp.

## Alternatives

- Deriving an ID from the timestamp cannot pair pre-tool & post-tool snapshots, whose timestamps
  differ.
- Deriving an ID from the session or command can collide when calls overlap or repeat.
- Skipping every event without a tool ID would hide malformed Claude & Codex payloads.
- Changing script-root resolution does not address the captured failure; Copilot supplies the root.

## Revisit if

Copilot supplies a stable per-tool ID across hook events, or another client starts sending the same
signature without a tool ID.
