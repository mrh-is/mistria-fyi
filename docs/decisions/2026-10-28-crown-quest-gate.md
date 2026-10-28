---
id: 2026-10-28-crown-quest-gate
status: current
summary: >-
  Native GML & letter evidence set the crown gate to renown level 40, without modeling cooldown or
  weekly pacing.
evidence:
  - https://github.com/mrh-is/mistria-fyi-private/pull/657
  - pipeline/src/overrides/game-facts.ts
relationships: []
---

# Crown quest gate

## Context

The [reviewed-facts decision](2026-10-06-reviewed-game-facts.md) retained a placeholder crown gate
of 20 while awaiting evidence in
[mrh-is/mistria-fyi-private#638](https://github.com/mrh-is/mistria-fyi-private/issues/638).
[mrh-is/mistria-fyi-private#657](https://github.com/mrh-is/mistria-fyi-private/pull/657) replaced it
with 40 from native 1.0.5 game logic. This is a record of that merged change, not a new reversal.

## Decision

Use renown level 40 (Iron Star). `CROWN_QUEST_GATE` in `pipeline/src/overrides/game-facts.ts`
carries the value & evidence: `Ari.gml` starts the crown cooldown at `renown_to_level >= 40`, and
the unlock letter names Iron Star. Keep the post-unlock cooldown & weekly pacing outside the binary
visibility gate.

The earlier record’s reviewed-override architecture remains applicable. The replacement used native
GML & letter evidence; it did not establish the earlier request for a playthrough. The merged
private PR records acceptance of that evidence instead.

## Alternatives

The placeholder 20 was replaced by native evidence. The wiki’s Early Access threshold of 50 was
rejected because it predates the 1.0 game logic. The private PR explicitly did not verify an actual
playthrough.

## Revisit if

Native game logic changes the threshold, or the tracker begins modeling the cooldown or weekly
request pacing.
