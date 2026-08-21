# Quest gate removal & quest chain simplification

Issue: #108

## Summary

Remove the dead `questGate`/`questGates` code and restructure `questChains` into two concerns:
per-quest `visibility` conditions (for prerequisite/availability logic) and a generic `questOrder`
map (for display ordering of sequential chains).

## Part 1: Remove `questGate` & `questGates`

`questGate` on `Item` and `Animal`, and `questGates` on `TrackerData`, are dead code. The visibility
system superseded them; no app code reads either field.

### Removals

- `questGate?: QuestId[]` from `Item` interface
- `questGate?: QuestId[]` from `Animal` interface
- `questGates` from `TrackerData`
- `QuestGateIndex` interface, `extractQuestGates`, `applyItemQuestGates`, `applyAnimalQuestGates`,
  `applySpellQuestGates` from `pipeline/src/extractors/quest-gates.ts` (delete the file)
- All call sites in `pipeline/src/main.ts` (`extractQuestGates`, the three `apply*` calls, the
  `questGates` property on the output object)
- `questGates` from test fixtures in `visibility.test.ts`

## Part 2: Restructure `questChains` into `questOrder` + per-quest visibility

### Current state

`questChains` mixes ordering and prerequisite data:

| Field                                         | Content                          | Ordering | Prerequisite   |
| --------------------------------------------- | -------------------------------- | -------- | -------------- |
| `crown: QuestId[]`                            | Sequential order                 | Yes      | Yes (implicit) |
| `stillwell: QuestId[]`                        | Sequential order                 | Yes      | Yes (implicit) |
| `tali: QuestId[]`                             | Sequential order                 | Yes      | Yes (implicit) |
| `fetch: Record<QuestId, VisibilityCondition>` | Availability conditions          | No       | Yes            |
| `heart: Record<NpcId, ...>`                   | Heart level + prerequisite quest | No       | Yes            |
| `story: Record<QuestId, { prerequisites }>`   | Prerequisite graph               | No       | Yes            |

### Target state

**`questOrder: Partial<Record<QuestType, QuestId[]>>`** retains only display/unlock ordering for
sequential chains. Initially populated for `crown`, `mission`, and `cooking`.

**Per-quest `visibility`** on the quest entities themselves handles all prerequisite/availability
logic for fetch, heart, and story quests. Crown/mission/cooking prerequisite logic remains derived
from `questOrder` position (encoding it redundantly as per-quest visibility would create two sources
of truth).

### Prerequisite-to-visibility mapping

**Fetch quests:** The pipeline already resolves fetch requirements into `VisibilityCondition` values
via `extractFetchQuestVisibility`. Instead of storing them on `questChains.fetch`, set them as each
`FetchQuest`'s `visibility` field.

**Story quests:** `{ prerequisites: [q1, q2] }` becomes:

- Empty array: no visibility condition (always available)
- Single prerequisite: `{ type: "questCompleted", questId: q1 }`
- Multiple: `{ type: "and", conditions: [{ type: "questCompleted", questId: q1 }, ...] }`

**Heart quests:** `{ heartLevel, npcId, prerequisiteQuest? }` becomes:

- Without prerequisite: `{ type: "heartLevel", npcId, level: heartLevel }`
- With prerequisite:
  `{ type: "and", conditions: [{ type: "heartLevel", npcId, level: heartLevel }, { type: "questCompleted", questId: prerequisiteQuest }] }`

### Type changes

```ts
// TrackerData: replace questChains and questGates with questOrder
questOrder: Partial<Record<QuestType, QuestId[]>>;

// Remove from Item:
questGate?: QuestId[];

// Remove from Animal:
questGate?: QuestId[];

// Remove from TrackerData:
questGates: { ... };
questChains: { ... };
```

### Pipeline changes

**`quest-chains.ts`:** `QuestChainData` keeps its current shape (it's a pipeline-internal
intermediate type, not the output contract). The extractor continues to produce the same raw data.

**`entity-visibility.ts` (`assignQuestVisibility`):** After resolving fetch requirements into
`VisibilityCondition` values, this function must also:

- Set `visibility` on each fetch quest from the resolved conditions
- Set `visibility` on each story quest from `questChains.story` prerequisites
- Set `visibility` on each heart quest from `questChains.heart` entries

**`main.ts`:** The output object replaces `questChains` with `questOrder`, carrying only the three
ordered arrays:

```ts
questOrder: {
  cooking: questChainsRaw.tali,
  crown: questChainsRaw.crown,
  mission: questChainsRaw.stillwell,
}
```

Note the key change: pipeline-internal names (`tali`, `stillwell`) map to their `QuestType` keys
(`cooking`, `mission`) since `questOrder` is keyed by `QuestType`.

**`quest-gates.ts`:** Deleted entirely (Part 1).

### App changes

**`visibility.ts` (`evaluateQuestPrerequisites`):** The `fetch`, `heart`, and `story` cases simplify
to reading the quest's own `visibility` field via `isVisible`. The `cooking`, `crown`, and `mission`
cases read from `trackerData.questOrder` instead of `trackerData.questChains`.

**`visibility.ts` (`markQuestPrerequisitesCompleted`):** The `fetch`, `heart`, and `story` cases
simplify to `satisfyCondition(quest.visibility)`. The ordered-chain cases read from
`trackerData.questOrder`.

**`quests-content.svelte`:** Reads `trackerData.questOrder[questType]` instead of the hardcoded
`trackerData.questChains.crown`/`.stillwell`/`.tali` lookups. The generic `Partial<Record>` typing
makes this a single expression.

### Transfer encoding

`questGate` and `questGates` are not part of the transfer encoding (they encode user progress, not
static data). No transfer format changes needed.

## Testing

- Existing `visibility.test.ts` tests cover quest prerequisite evaluation; update fixtures to remove
  `questGates` and replace `questChains` with `questOrder` + per-quest visibility
- Existing `quest-chains.test.ts` tests are unaffected (pipeline-internal extractor)
- Existing `entity-visibility.test.ts` tests need updates for the new visibility assignments
- Pipeline snapshot/integration tests need regeneration
