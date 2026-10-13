# Agent hook lint scope

## Context

Issue #56 moves agent formatting, lint, guarded-path, & subagent reminders into repository hooks.
The existing chained lint commands cannot accept a changed-file list without sending that list to
only their last command. Stop hooks must not repair unrelated files throughout the checkout.

## Decision

Share hook scripts between Claude Code & Codex. Preserve the existing full lint behavior through a
Node runner that also accepts `--files`, passing each filename as a separate process argument. Stop
hooks include committed branch changes relative to `origin/main`, staged & unstaged edits, and
untracked files, so committing during a turn does not evade the check. The first failure requests
continuation; an already active stop reports the failure without continuing again.

Bash formatting compares pre-tool fingerprints with post-tool contents, including commits made
during the command, so read-only commands do not format preexisting edits. Git enumeration & lint
execution normalize to the repository root to support sessions started in a subdirectory.

Shell guards cover direct paths & common commands, while retaining prose for arbitrary-program
boundaries. Hooks supplement the sandbox & CI rather than claiming complete shell enforcement.

## Alternatives

- Running full-repository autofixes on every stop would mutate unrelated files & cost more time.
- Using only the working-tree diff would omit changes committed during the turn.
- Passing filenames to the old chained scripts would apply them to only the final command.
- Parsing arbitrary shell programs would require an interpreter & still miss dynamic execution.

## Revisit if

The default integration branch changes, clients expose reliable per-turn changed-file tracking, or
native hooks provide filesystem access controls that supersede direct-path guards.
