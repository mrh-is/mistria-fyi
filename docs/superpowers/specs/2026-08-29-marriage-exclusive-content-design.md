# Marriage-exclusive content design

## Problem

Issue #127. Three categories of tracker content are marriage-exclusive: only one NPC's items or
quests can be obtained per playthrough, but the tracker currently shows all of them as separate
trackable entries. This inflates the total count and misleads completion-tracking players.

The affected categories:

1. **Craving quests** — six "A Craving" heart quests (`*_pregnancy_request`), one per wife NPC. Only
   obtainable if married to that wife and choosing to have children.
2. **Proposal items** — items with `{ type: "proposal", npcId }` sources. One per dateable NPC,
   received at the 10-heart cutscene. Per the wiki, the player can date all candidates, go through
   all proposal events, and collect every proposal item before finalizing marriage. Multiple
   proposal items are obtainable per playthrough.
3. **Spouse gifts** — NPC-specific furniture items from `is_spouse` letters. One set per dateable
   NPC, received after marriage. Only the married NPC's set is obtainable.

Additionally, **generic wedding items** (from `cutscenes.wedding` given_items and
`misc.wedding_assets` cosmetics) are received regardless of which NPC is married. These are not
marriage-exclusive and require no special handling.

## Concepts

**Dateable NPCs:** NPCs with `dateable: true` in the game data. Currently 12 NPCs. Non-dateable NPCs
are always platonic and irrelevant to this feature.

**Relationship path:** Each dateable NPC is on one of three paths: `undecided` (default),
`platonic`, or `romantic`. The path is explicitly chosen by the user at 8 hearts. In-game, this
choice is irreversible, but the tracker allows corrections.

**Proposal:** At 10 hearts on the romantic track, the player can propose. Multiple proposals are
possible (to different NPCs); the player collects each NPC's unique proposal item at this point.
Marriage is what closes the other doors, not proposal.

**Marriage:** Marrying one NPC closes all other doors: all other dateable NPCs move to platonic,
their spouse gifts become unobtainable. Proposal items already obtained are kept.

**Child choice:** After marrying any NPC, the player can optionally use the `mystical_feather` item
to have a child. For wife NPCs, this also triggers the pregnancy ("A Craving") quest. The tracker
surfaces the child choice as `undeclared | yes | no` for all married NPCs, not just wives.

**Wife vs husband:** Derived from data, not from a gender field. Any NPC that has a
`_pregnancy_request` heart quest is a "wife NPC". The remaining dateable NPCs are "husband NPCs".

## New state

### `npcRelationships: Partial<Record<NpcId, NpcRelationship>>`

Replaces the current `romanticNpcs: Set<NpcId>` and `marriedNpc: NpcId | null`. Tracks the explicit
relationship path for each dateable NPC. Only dateable NPCs appear as keys; absent keys are
implicitly `"undecided"`.

```typescript
type NpcRelationship =
  | "undecided" // default; no path chosen yet
  | "platonic" // explicitly chosen platonic at 8+ hearts
  | "romantic" // dating, not yet proposed
  | "proposed" // proposed at 10 hearts
  | "married"; // the one married NPC
```

Only one NPC can be `"married"` at a time.

**Invariant enforcement (mutation boundary):** Setting any NPC to `"married"` forces all other
dateable NPCs to `"platonic"`. Extract a single `normalizeRelationships(npcRelationships)` function
that enforces this invariant. Call it at every mutation boundary:

- `setNpcRelationship()` in user-state store.
- `satisfyCondition()` in `src/lib/engine/visibility.ts` (the `"married"` case currently sets
  `completed.marriedNpc ??= condition.npcId`; must be updated to set the relationship to `"married"`
  and run normalization).
- localStorage deserialization (on load).
- Backup restore (`importState`).
- Save import (`mergeFromSave`).
- Transfer decode.

The `isDating` condition in `visibility.ts` (currently checks
`romanticNpcs.size > 0 || marriedNpc !== null`) must be updated to check for any relationship in
`"romantic" | "proposed" | "married"`.

This ensures the invariant holds regardless of how the state was entered, including the spoiler-
guard path that calls `satisfyCondition` to auto-advance state.

**Derived accessors:**

- `marriedNpc: NpcId | null` — derived getter: the NPC with `"married"` status, or `null`.
- `isRomantic(npcId): boolean` — true when relationship is `"romantic" | "proposed" | "married"`.

### `childChoice: "undeclared" | "yes" | "no"`

- Default: `"undeclared"`.
- Meaningful for any married NPC (not just wives). Any spouse can have a child; only wife NPCs
  additionally have a craving quest gated on this choice.
- Persisted in `SerializedState.completed.childChoice`.
- **Reset to `"undeclared"` whenever the married NPC identity changes via explicit user action**
  (setting a different NPC to `"married"` or un-marrying). This prevents a stale `"no"` from
  suppressing a newly selected wife's craving quest. Backup restore (`importState`) replaces the
  entire state atomically and does not trigger this reset. Additive merge (`mergeFromSave`) uses the
  merge ordering defined below.

### Migration from existing state

**localStorage:** On deserialization, if the old `romanticNpcs` or `marriedNpc` fields exist:

- Each NPC in `romanticNpcs` → `"romantic"`.
- The `marriedNpc` NPC → `"married"`.
- Run the normalization invariant (marriage forces others to platonic).
- All other dateable NPCs remain absent (implicitly `"undecided"`).
- Remove the old `romanticNpcs` and `marriedNpc` fields from the serialized format.

This migration is in scope; it runs automatically on load. "Out of scope" refers only to
retroactively inferring platonic/romantic for NPCs that were not in the old `romanticNpcs` set.

**v6 transfer payloads:** Same mapping. The `romanticNpcs` bitfield and `marriedNpc` byte seed the
relationship states. `childChoice` defaults to `"undeclared"`.

### NPC page UI flow

The relationship controls live on the NPC page, revealed progressively:

1. **At 8 hearts** (dateable NPC): show a path picker: `undecided | platonic | romantic`.
2. **At 10 hearts + romantic**: the picker gains a `proposed` option.
3. **On `proposed`**: the picker gains a `married` option. Selecting it normalizes all other
   dateable NPCs to `platonic` and removes their pickers.
4. **Once married** (any NPC): show a `undeclared | yes | no` child choice control.

The picker allows corrections (the player can change their mind in the tracker, even though in-game
choices are permanent). Lowering heart level below 8 does not remove the picker if a relationship
state has already been set; the picker remains visible for correction purposes.

Note: when `showCompleted` is off and the NPC row is hidden at 10 hearts, the picker must still be
accessible. Options: always show dateable NPCs with an active relationship state regardless of
`showCompleted`, or place the picker in the NPC detail expansion rather than inline.

## Source type changes

### New source type: `spouseGift`

```typescript
{ type: "spouseGift", npcId: NpcId }
```

Replaces `{ type: "wedding" }` **only** for items from `is_spouse` letters in
`pipeline/src/acquisition/collectors/rewards.ts:69`. The NPC ID comes from `reqs.is_spouse`.

The existing `{ type: "wedding" }` source type remains unchanged for:

- `cutscenes.wedding` given_items (line 228) — generic wedding items.
- `misc.wedding_assets` (line 479) — generic wedding cosmetics.

Note: `is_spouse` letter rewards currently feed only `ItemSourceAccumulator`, not
`CosmeticSourceAccumulator`. The `spouseGift` source type applies to items only. Generic wedding
cosmetics (from `misc.wedding_assets`) use the unchanged `wedding` source type and are not
marriage-exclusive.

Files to update:

- `src/lib/types/acquisition.ts` — add `spouseGift` variant with `npcId: NpcId`.
- `pipeline/src/acquisition/collectors/rewards.ts` — emit `spouseGift` instead of `wedding` for
  `is_spouse` letters; thread through the NPC ID.
- `pipeline/src/acquisition/validate-sources.ts` — add `spouseGift` with `["npcId"]` fields.
- `src/lib/utils/source-segments.ts` — render as "Get married to {NpcName}".
- `src/lib/components/icon/icon-maps.ts` — add `spouseGift` icon (Heart).
- `src/lib/data/source-rendering.invariants.test.ts` — add `spouseGift` to known types.
- `pipeline/src/main.ts` — add `spouseGift` to the source-type switch.
- `pipeline/src/extractors/visibility/entity-visibility.ts` — add `spouseGift` to the two exhaustive
  source-type switches (lines ~211 and ~398).

### Pipeline: `pregnancyQuestByNpc`

Add to `TrackerData`:

```typescript
pregnancyQuestByNpc: Partial<Record<NpcId, QuestId>>;
```

Maps each wife NPC to their pregnancy quest ID. Populated by the pipeline from heart quests matching
the `_pregnancy_request` suffix. JSON-serializable (unlike a `Set`).

Used by the engine to:

- Determine if `marriedNpc` is a wife (key exists) or husband (key doesn't exist).
- Find the specific pregnancy quest to show when married to a wife.
- Enumerate all pregnancy quest IDs for exclusion/collapse logic.

## Suppression rules

### Applicability predicate

Introduce a mode-independent `isEntityApplicable` predicate that runs **before** total/completed
counting, separate from the existing `filterAvailableItems` (which handles seasonal availability and
is mode-dependent).

An entity (item or cosmetic) is **inapplicable** when **all** of its sources are suppressed by
marriage-exclusive rules. Entities with at least one non-suppressed source remain applicable.

**Critical rule: completed entities are never inapplicable.** If an entity has already been marked
completed by the user, it always counts toward both `total` and `completed`, regardless of
suppression rules. This prevents the feeling of "losing progress" when marriage choices change.
Different players may therefore have different `total` numbers depending on which items they
collected before marriage.

Inapplicable-and-incomplete entities are excluded from both the `total` and `completed` counts in
their category, regardless of availability mode. This ensures 100% completion remains reachable.

### Source suppression rules

A source is **suppressed** when:

| Source type  | Suppressed when                                                   |
| ------------ | ----------------------------------------------------------------- |
| `proposal`   | NPC relationship is `"platonic"`                                  |
| `spouseGift` | NPC relationship is `"platonic"`, OR any other NPC is `"married"` |

Note on `proposal` suppression: proposal items are NOT suppressed by another NPC being married,
because the player can collect all proposal items before marrying. However, a platonic NPC's
proposal item is unobtainable (the player chose not to date them). Once married, other NPCs are
forced to `"platonic"` by the invariant, so their uncollected proposal items become suppressed
through that path.

Note on `"undecided"`: neither `proposal` nor `spouseGift` sources are suppressed for `"undecided"`
NPCs. The item remains visible until the user makes an explicit choice. This avoids silently hiding
items from users who haven't set up their relationship paths yet.

### Craving quests

| `marriedNpc` | Wife/husband | `childChoice`      | Quest count | What shows                  |
| ------------ | ------------ | ------------------ | ----------- | --------------------------- |
| `null`       | n/a          | n/a                | 1           | Synthetic spoilered row     |
| wife NPC     | wife         | `undeclared`/`yes` | 1           | That wife's pregnancy quest |
| wife NPC     | wife         | `no`               | 0           | Nothing                     |
| husband NPC  | husband      | any                | 0           | Nothing                     |

Note: `childChoice` is tracked for all spouses (husbands can have children too), but craving quests
only exist for wife NPCs. A husband spouse with `childChoice: "yes"` still shows zero craving
quests.

The synthetic row before marriage:

- Name: "A Craving" (spoilered per standard rules).
- Source text: "Get married & choose to have a child".
- Quest state: always `none`. The synthetic row has no persistent state of its own.

State transitions when marriage changes:

- **Unmarried → married to wife:** synthetic row resolves to that wife's quest. `childChoice` is
  `"undeclared"`. The quest is shown (spoilered until visibility conditions met).
- **Unmarried → married to husband:** synthetic row disappears. Zero pregnancy quests count.
- **Married to wife → unmarried (correction):** reverts to synthetic row. `childChoice` resets to
  `"undeclared"`.
- **Married to wife A → married to wife B (correction):** resolves to wife B's quest. `childChoice`
  resets to `"undeclared"`. Wife A's quest state persists in `questStates` but is hidden and
  excluded from counts.
- **Married to wife → married to husband (correction):** all pregnancy quests hidden and excluded.
  `childChoice` resets to `"undeclared"`.

**Completed pregnancy quests for non-selected spouses:** The "completed entities are never
suppressed" rule applies to items but NOT to pregnancy quests. Pregnancy quests are an explicit
exception: only the selected wife's quest (or the synthetic row) appears. A completed pregnancy
quest for a non-selected wife remains in `questStates` but is hidden and excluded from counts. This
is intentional; the player corrected a mistake, and showing a completed quest for the wrong wife
would be confusing. The quest state is preserved so it can be restored if the player corrects back.

### Cross-cutting concerns

**Search** (`src/lib/engine/search.ts`): search results must respect the same suppression.
Inapplicable-and-incomplete entities should not appear in search results. Completed entities always
appear.

**Category completion helpers** (`isQuestsComplete`, etc. in `quests-content.svelte`): must account
for excluded pregnancy quests and suppressed items. Completion is defined as "all applicable items
completed", not "all items in trackerData completed".

**Almanac progress:** `getAlmanacProgress` counts canonical collapsed rows by aggregating item IDs
from `trackerData.almanac` categories. The applicability predicate must operate on these aggregated
item IDs, not on individual sources within a row. An almanac category row is applicable if at least
one of its item IDs is applicable.

**Cosmetics progress:** `getCosmeticsProgress` counts `Cosmetic` entities. Since `spouseGift`
sources only appear on items (not cosmetics), cosmetics progress is unaffected by this feature.
Generic `wedding` cosmetics remain counted normally.

**Museum, recipes:** These categories use item IDs directly. The applicability predicate filters
item IDs before counting, same as almanac.

## Transfer encoding

Extend to version 7 (current is v6). The actual v6 field layout is:

- Fields 1–11: almanac through quest states.
- Field 12: perk bitfield (v2+).
- Field 13: married NPC index byte (v2+).
- Fields 14–15: pet cosmetics and skins bitfields (v3+).
- Field 16: date bitfield (v4+).
- Field 17: progression byte (v5+).
- Field 18: romantic NPCs bitfield (v5+).
- Field 19: (v6, if any).

In v7, **fields 13 and 18 are replaced** by a unified relationship encoding:

- **Field 19 (v7): NPC relationship states** — each dateable NPC gets 3 bits encoding one of five
  states (undecided=0, platonic=1, romantic=2, proposed=3, married=4; values 5–7 are reserved and
  decode as undecided). Pack into a byte array using the frozen sorted dateable NPC order
  (`getDateableNpcOrder()`). 12 NPCs × 3 bits = 36 bits = 5 bytes, zero-padded in the final byte.
  The NPC order must be frozen as a codec constant; if the dateable NPC roster changes in future
  game versions, the order must be extended, not re-sorted.
- **Field 20 (v7): `childChoice`** — 1 byte: `0x00` = undeclared, `0x01` = yes, `0x02` = no.

**v6 decode compatibility:** When decoding a v6 payload, reconstruct relationship states from the
old fields: field 18 (romantic NPCs bitfield) maps to `"romantic"` entries, field 13 (married NPC
byte) maps to a `"married"` entry, then run `normalizeRelationships`. `childChoice` defaults to
`"undeclared"`. Fields 13 and 18 are still written in v7 for backwards compatibility with v6
decoders (they read the old fields and ignore the new ones).

### Merge semantics (additive import)

Transfer and save import use `mergeFromSave`, which is additive. Relationship states don't have a
simple linear ordering because `platonic` and `romantic` are mutually exclusive branches, not a
progression.

**Per-NPC merge rules:**

| Local       | Imported    | Result     | Rationale                                      |
| ----------- | ----------- | ---------- | ---------------------------------------------- |
| `undecided` | any         | imported   | Imported data is more informative              |
| any         | `undecided` | local      | Local data is more informative                 |
| `platonic`  | `platonic`  | `platonic` | Agreement                                      |
| `romantic`  | `romantic`  | `romantic` | Agreement                                      |
| `platonic`  | `romantic`+ | imported   | Imported is more advanced; player changed mind |
| `romantic`+ | `platonic`  | local      | Local is more advanced                         |
| `romantic`  | `proposed`  | `proposed` | Forward progression                            |
| `proposed`  | `married`   | `married`  | Forward progression                            |
| `married`   | `married`   | local      | Same NPC (only one can be married)             |

Within the romantic branch, the ordering is: `romantic < proposed < married`.

The `platonic` vs `romantic` conflict is resolved by preferring whichever side is more advanced
(further from `undecided`). In practice, `romantic` beats `platonic` because the player likely
changed their mind. If both are equally advanced (`platonic` vs `romantic`, neither proposed/
married), prefer the imported value (it's likely more recent).

**Two married NPCs conflict:** If local has NPC A as married and imported has NPC B as married,
prefer the imported married NPC (more recent). NPC A becomes `proposed` (the most advanced
non-married state, preserving that the player once proposed).

After merging all per-NPC states, run `normalizeRelationships`.

**`childChoice` merge:** `undeclared` yields to either `yes` or `no`. If both are non-undeclared and
conflict (`yes` vs `no`), prefer the imported value. Add to `MergeCounts` as
`npcRelationships: number` (count of NPCs whose state changed) and `childChoice: number` (0 or 1).

## Save import

`buildImportState` in `src/lib/engine/import-save.ts`:

- **`npcRelationships`**: extract from `{npcId}_is_dating` facts in `t2_world_facts` (currently done
  for `romanticNpcs`). Dating maps to `"romantic"`.
- **`marriedNpc`**: the save file has `player.wedding_date` (non-null when married) and
  `player.proposal_date`. The specific spouse NPC identity is not yet confirmed in the save format;
  if a `{npcId}_is_spouse` or similar world fact exists, use it. Otherwise, infer from the NPC whose
  roommate routine is active (requires further save file investigation with a married save). As a
  fallback, if `player.pending_child` or `player.children` reference a spouse NPC, or if an
  active/completed `*_pregnancy_request` quest identifies the wife via `pregnancyQuestByNpc`, use
  that. If the spouse cannot be determined, leave as `"undecided"` and log a warning.
- **`childChoice`**: `player.pending_child` is non-null during pregnancy; `player.children` is
  non-empty after birth. Either implies `"yes"`. Otherwise `"undeclared"` (cannot distinguish
  "hasn't decided" from "chose no"). Note: `childChoice` should not be set to `"yes"` unless a
  married spouse has been identified; if spouse is unknown but pregnancy evidence exists, use the
  pregnancy quest NPC to infer the spouse first.

Note: the exact save-file keys for spouse identity need validation against a married save file. The
current reference save (`pipeline/input/save/`) is pre-marriage. This is documented as a known gap;
save import for marriage identity may need a follow-up once a married save is available.

## Scope boundaries

**In scope:**

- State model changes (`npcRelationships` replacing `romanticNpcs`/`marriedNpc`, `childChoice`,
  `spouseGift` source type).
- localStorage migration from `romanticNpcs`/`marriedNpc` to `npcRelationships`.
- Pipeline changes (emit `spouseGift`, populate `pregnancyQuestByNpc`).
- Engine changes (applicability predicate, progress filtering, craving quest collapse).
- UI changes (NPC page relationship picker, craving quest synthetic row, child choice control).
- Transfer encoding v7 with v6 backwards compatibility.
- Search and category completion fixes.
- Save import for dating status and partial marriage data.

**Out of scope:**

- Gender as a data concept. Wife/husband is derived from pregnancy quest existence.
- Changes to generic wedding items or cosmetics (these are not marriage-exclusive).
- Inferring platonic/romantic status for NPCs that were not in the old `romanticNpcs` set. Migration
  maps old state faithfully; NPCs with no prior romantic data default to `"undecided"`.
- Full marriage identity extraction from save files (pending a married save file for validation).

## Design notes

**Lossy marriage correction:** When the user sets NPC A to `"married"`, all other dateable NPCs are
forced to `"platonic"`, destroying any prior `"romantic"` or `"proposed"` state. This is intentional
and matches the game's behavior (marriage is a one-way door). The tracker allows un-marrying
(setting A back to `"proposed"`), but the other NPCs' prior states are not automatically restored.
The user would need to manually re-set them. This is an acceptable trade-off; the correction flow is
for fixing mistakes, not for exploring hypotheticals.
