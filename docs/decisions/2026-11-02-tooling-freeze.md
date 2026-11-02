# New agent tooling needs a repeated incident

## Context

By November, the repository’s agent tooling was a quarter the size of the app it supports: about
22,000 lines in `scripts/`, plus 15 Claude Code hooks & six CI workflows. The audit in #417 found
that the four shell-parsing guards refused legitimate commands 56 times across 542 Claude Code & 655
Codex sessions, and never caught a real violation. Most had been added to turn a prose rule into
code, not because anything had gone wrong. Each new guard then drew its own stream of bug reports,
such as PowerShell wildcards & Markdown headings mistaken for token reads.

## Decision

New agent tooling (a hook, a guard, a CI check, or a script that polices agent behavior) needs a
real incident that blocked work at least twice. Link both incidents in the PR that adds it. Until
then, the rule lives in `AGENTS.md` as prose.

Fixing or simplifying existing tooling isn’t new tooling. Product build & test infrastructure isn’t
covered.

## Alternatives

- **Tooling over prose, always.** Rejected: that was the previous rule, and it produced guards that
  cost more in false positives than the mistakes they were meant to stop.
- **No new tooling at all.** Rejected: some checks pay for themselves. The “Attribution” & “Guarded
  paths” CI checks caught 16 real mistakes in three weeks.
- **One incident is enough.** Rejected: a single incident can’t tell a pattern from a fluke, and
  most of the removed guards had zero.

## Revisit if

A mistake that a check would have caught reaches `main` or production twice while this rule held the
check back.
