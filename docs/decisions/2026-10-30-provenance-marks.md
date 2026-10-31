---
id: 2026-10-30-provenance-marks
status: current
summary: >-
  Every checked box draws the same green X (obtained: amber slash); provenance only changes the tool
  that drew it, seeded per entry, and it’s decorative to assistive tech.
evidence:
  - docs/design/provenance-marks/README.md
  - https://github.com/mrh-is/mistria-fyi/pull/284
relationships: []
---

# Provenance marks: one X, four tools

## Context

Every progress fact records where it came from (`manual`, `save`, `inferred`, or `unknown`), but the
tracker draws every checked box alike (#276). The first proposal on
[#284](https://github.com/mrh-is/mistria-fyi/pull/284) gave each source its own shape (an X, a
check, a ditto, a small x). The maintainer’s review set the direction instead: the shape is the
status, and only the way it was made varies.

## Decision

- Completed is always a green X and obtained is always an amber slash. The source picks the tool:
  - `manual`: pen, with nib blots & strokes that can overrun the box.
  - `save`: rubber stamp, with ink specks & an uneven-pressure fade.
  - `inferred`: green colored pencil at 75% of the pen’s strength.
  - `unknown`: typewriter, a small serifed x.
- Each entry’s id seeds its mark: the filter seed (one of eight per tool), the pen’s stroke ends,
  bow, & weight, the stamp’s angle & fade, and a quest’s second-stroke registration.
- Most entries are done in one moment and get one X. A quest takes two: its slash turns green when
  done, and the crossing stroke lands slightly out of register.
- A quest’s two moments keep their own tools (the design’s option A), so a stamped slash can sit
  under an inked stroke.
- A manual mark stays manual when a save agrees with it, since only `unknown` facts are promoted to
  `save`. So a mixed quest keeps its mixed mark.
- Provenance is decorative: the checkbox keeps its name & state, and the tool isn’t announced.
- Only the inked X animates its second stroke.

## Alternatives

- A different shape per source: rejected, since the shape already means done or obtained.
- A green X stamped over the amber slash, and a stamp mount’s edge kiss: tried and dropped as too
  busy.
- One provenance per quest, with the finish redrawing the whole mark (option B): simpler to store,
  but it erases the obtained moment’s source.
- A screen reader description per source: dropped, since the distinction is texture, not something a
  player acts on.
- A graphite pencil: dropped, since done is green.

## Revisit if

- Players report confusing a tool for a different status.
- Rendering many filtered marks measurably slows long tracker lists.
- Provenance starts carrying information a player needs to act on, such as what sync will overwrite;
  then it needs a text equivalent.
