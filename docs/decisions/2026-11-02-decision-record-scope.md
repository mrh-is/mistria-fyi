---
id: 2026-11-02-decision-record-scope
status: current
summary:
  Record decisions in the PR by default; keep decision records for choices a newcomer would reverse.
evidence:
  - docs/agent-workflow.md#recording-decisions
  - https://github.com/mrh-is/mistria-fyi/issues/417
relationships: []
---

# Decision records only for reversible-looking choices

## Context

The owner asked for decision records so later sessions could find out why the project works the way
it does. Agents read that as a rule to record every choice. The folder grew to 107 records in about
six weeks, with a generated index & a metadata validator on top. The records became too many & too
long to read, and reviewing PRs that added them got harder.

## Decision

Each kind of “why” has one home, listed in
[agent-workflow.md](../agent-workflow.md#recording-decisions):

- the PR’s “Decisions” section, by default,
- a code comment, when the code would look wrong without one,
- the living docs, for the current design,
- a decision record, only when a capable newcomer would propose the rejected alternative.

## Alternatives

Keeping a record for every choice preserves the most history, but nobody reads a log that long, so
it stops answering the question it exists for. Dropping decision records entirely would lose the
“Revisit if” conditions that stop agents from reopening settled questions, such as save-driven sync
with no logins.

## Revisit if

Agents reopen a question that a PR’s “Decisions” section had already settled, two or more times.
That would mean PR history is too hard to find, and some of those choices need records after all.
