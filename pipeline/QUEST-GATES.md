# Quest-gate extraction

## Current meaning

Quest gates index every `rewards[].item` reward ID from an allowlisted quest. Applicators attach
only IDs that match extracted item, animal, or spell records. Quest gates are not a general
availability model, and they do not infer prerequisites from progression flags, requirements,
stores, cutscenes, animals, or spells.

## Direct evidence

The extractor scans six tracked quest groups: `story_quests`, `heart_quests`, `fetch_quests`,
`crown_quests`, `stillwell_challenges`, & `tali_challenges`. It indexes a gate only when
`rewards[].item` names an item. A set per item deduplicates quest IDs before the index becomes
serialized arrays.

Recipe scrolls & crafting scrolls are excluded because they grant recipes, not finished-item
ownership.

## Attachment behavior

The pipeline attaches direct item gates to extracted item records. Animal & spell applicators remain
available for later work. All applicators silently skip a gate when the target item, animal, or
spell ID is absent from its extracted registry.

## Deferred inference

`animalGates`, `spellGates`, & `progressionFlagToQuests` are always empty. The current pipeline does
not derive them from requirement-to-quest, cutscene-to-quest, progression, store, animal, or spell
relationships.

## Follow-up design

See [quest-gate improvements](../docs/superpowers/specs/2026-08-10-quest-gate-improvements.md) for
the deferred inference design.
