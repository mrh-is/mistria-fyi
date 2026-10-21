# Imported rank quests

## Context

Rank quests were added after some saves had already passed their targets. Their completion facts can
therefore omit earlier ranks, while renown still records the player’s attained level.

## Decision

Derive each native rank quest’s threshold from its single `reached_renown_level` stage requirement,
validate it against the extracted town-rank boundaries, and store it on `StoryQuest.townRankLevel`.
Save import credits reached targets while retaining explicit completion evidence. The native rank
quest ID family identifies which records require validation; display names supply no mapping.

Keep this inference at the save-import boundary. Manually editing renown remains independent of
quest state, because the issue’s acceptance criteria concern recovering historical save evidence.

## Alternatives

- Hardcoded quest-to-rank tables can drift from game requirements.
- Localized quest names are presentation data, not a stable identity or numeric threshold.
- Applying inference to manual edits widens the behavior beyond the import defect.

## Revisit if

Manual renown controls are explicitly expected to complete rank quests, or native rank quests add
other objectives that make a rank threshold insufficient evidence of completion.
