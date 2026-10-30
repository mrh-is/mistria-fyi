---
id: 2026-10-30-reader-first-agent-guidance
status: current
summary: >-
  Agent-facing guidance is written in reader-first prose, because agents imitate its style in PR
  bodies.
evidence:
  - AGENTS.md
  - docs/agent-workflow.md
  - docs/agent-verification.md
  - docs/agent-reference.md
  - .github/pull_request_template.md
relationships: []
---

# Reader-first agent guidance

## Context

Codex’s PR descriptions in this repository were hard to read on a first pass. Compared with
Claude’s, they used about three times as many abstract nouns and about a third as many concrete
examples. Their sentences packed several facts into comma runs and cited bare issue numbers. The
repository’s own agent guidance (`AGENTS.md` and the `docs/agent-*.md` guides) used the same dense
style, and Codex reads `AGENTS.md` in every session, so the guidance was a likely model for that
prose.

## Decision

Write agent-facing guidance in plain, reader-first prose:

- one main fact per sentence,
- a list for three or more parallel items,
- verbs instead of abstract nouns,
- a named subject in each sentence,
- a short gloss for any term a cold reader wouldn’t know.

The rewrite keeps every rule & its meaning. Existing headings stay, so links to their anchors still
resolve. The PR template’s headings each carry a comment saying what belongs there.

## Alternatives

- **Leave the guidance alone and rely on personal instructions.** The contributor’s own guide &
  `writing-for-reviewers` skill address PR bodies directly, but agents still read the dense
  repository docs in every session & may copy them.
- **Add a style rule to `AGENTS.md` without rewriting it.** A rule stated in dense prose argues
  against itself, and a new rule adds to the per-turn context cost.

## Revisit if

- The measurement in [#259](https://github.com/mrh-is/mistria-fyi/issues/259) (whether agents follow
  the rules in root `AGENTS.md`) shows the longer root file costs too much context per turn.
- Agent PR bodies stay as dense after this change, which would mean the docs weren’t the source.
