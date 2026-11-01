---
id: 2026-10-22-perks-count-toward-completion
status: needs-review
summary: >-
  Every perk is a completion step. A skill is complete at level 60 with every perk in its tiers
  bought; the skills total counts each level and each perk as one step. The Mistmare's perks count
  toward the animals total and the Mount section the same way.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-22-perks-count-toward-completion.md#decision
relationships: []
---

# Perks count toward completion

## Context

The skills screen's perk drawer (#224) let players check off skill perks, but a skill counted as
complete at level 60 alone. With “show completed” off, a maxed skill's row hid, taking its unbought
perks with it, and `/everything` hid the Skills section once every skill was maxed. The Mistmare's
perks (#228) already counted toward the animals total, so the two kinds of perk disagreed.

## Decision

Every perk is a completion step. A skill is complete at level 60 with every perk in its tiers
bought; the skills total counts each level and each perk as one step. The Mistmare's perks count
toward the animals total and the Mount section the same way.

A bought perk counts even when the player has switched it off. The game keeps it in `player.perks`,
which save import reads; `stats.perks_active` and the `perk_unlocked_<id>` world facts flip with the
switch, so they never decide ownership.

## Alternatives

- **Keep “completed” as level 60, and keep a maxed skill visible while it has unchecked perks.** A
  narrower display fix, but the skills total would read complete while perks remain, and it would
  disagree with the Mistmare's perks.
- **Count only active perks.** Players switch perks off for play style, not because they lack them;
  an unbought perk is the only thing left to do.

## Revisit if

- The game adds perks that cannot all be owned at once, such as mutually exclusive choices.
- Players report that perk steps make the skills total feel out of proportion to levels.
