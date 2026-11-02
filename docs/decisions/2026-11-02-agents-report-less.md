# Agents report less, in fewer places

## Context

Two owner requests made agents write too much. The first asked for decision records, so later
sessions could find out why the project works the way it does; agents read that as a rule to record
every choice. The folder grew to 109 records in about six weeks, with a generated index & a metadata
validator on top, and nobody could read it all. The second asked agents to file an issue for
anything they found & didn’t fix. Agents filed 84 issues from Oct 25 to Nov 1, and about half were
about guards, hooks, & CI edge cases rather than the product. Triage became a real cost.

The owner still wants both kinds of knowledge kept. A settled question shouldn’t be reopened, and a
friction that one agent works around in silence may be one that every agent works around.

## Decision

Each kind of “why” has one home, listed in
[agent-workflow.md](../agent-workflow.md#recording-decisions):

- the PR’s “Decisions” section, by default,
- a code comment, when the code would look wrong without one,
- the living docs, for the current design,
- a decision record, only when a capable newcomer would propose the rejected alternative.

Records are plain Markdown with Context, Decision, Alternatives, & Revisit if sections. They carry
no metadata headers, and nothing generates an index from them.

Agents still file their own issues for product bugs, blockers, & deferred review findings. Every
other workaround becomes one comment on the pinned “Agent friction log” issue, which covers a month.
Repeats are logged again, because the count is the signal. At the end of the month, the owner (or an
agent the owner asks) tallies the comments; anything logged about three times becomes an issue, and
a new log replaces the old one.

## Alternatives

- **Record every choice.** Rejected: it preserves the most history, but nobody reads a log that
  long, so it stops answering the question it exists for.
- **Drop decision records entirely.** Rejected: that would lose the “Revisit if” conditions that
  stop agents from reopening settled questions, such as save-driven sync with no logins.
- **Keep the generated index.** Rejected: with about 15 records, the folder listing is the index,
  and the index’s own formatting broke under union merges (#413).
- **Keep filing an issue for everything.** Rejected: the volume buried the product work.
- **Mention frictions only in the final report.** Rejected: findings mentioned only in a session get
  lost.
- **One friction log forever.** Rejected: GitHub collapses the middle of long threads, so old
  entries would disappear from view.

## Revisit if

- Agents reopen a question that a PR’s “Decisions” section had already settled, two or more times.
- A monthly tally finds a friction that blocked real work but wasn’t promoted in time, or the owner
  stops running the tallies.
