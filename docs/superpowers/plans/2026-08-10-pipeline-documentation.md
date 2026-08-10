# Pipeline documentation & type clarity implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PR #43’s TOML pipeline understandable to a maintainer with no prior knowledge while
preserving runtime behavior and generated output exactly.

**Architecture:** Add one authoritative maintainer guide at `pipeline/README.md`, keep root docs
concise, and place contracts beside the transformations they govern. Rename only pipeline-internal
types and locals; document inaccurate shared app-facing types as recommendations instead of
redesigning them.

**Tech stack:** TypeScript, Node.js, `smol-toml`, Vitest, pnpm, SvelteKit type checking, ESLint, and
Prettier.

## Global constraints

- Preserve runtime behavior and serialized `tracker-data.json` output exactly.
- Do not add validation, change fallback behavior, or implement any behavioral recommendation.
- Do not redesign shared app-facing `TrackerData`, `Source`, or `Restriction` types.
- Use pnpm for every project command; do not use npm or npx.
- Comments must explain intent, invariants, omissions, or loss; they must not narrate adjacent code.
- Treat `pipeline/input/assets/` as local, ignored game data, not a checked-in fixture.
- Preserve the unrelated working-tree change in `.gitignore`; never stage or modify it.
- Do not commit implementation changes until the user reviews and explicitly approves the complete
  diff. Task boundaries use uncommitted review checkpoints instead of commits.
- Use smart quotes, sentence-case headings, US spelling, serial commas, ampersands for close compound
  pairs, and no em dashes in prose documentation.

---

## File map

**Create:**

- `pipeline/README.md`: Authoritative architecture, vocabulary, operating instructions, current
  limitations, & implementation-ready recommendations.

**Modify:**

- `README.md`: Short user-facing pipeline setup, command, architecture, & output summary.
- `CONTRIBUTING.md`: Correct commands, fixture assumptions, & validation workflow.
- `AGENTS.md`: Correct pnpm command and local-assets guidance.
- `pipeline/QUEST-GATES.md`: Current direct-reward semantics and deferred inference.
- `pipeline/src/data-shapes.ts`: Source-location vocabulary & validation contract.
- `pipeline/src/parse-fiddle.ts`: Parsed namespace/provenance vocabulary & parser contract.
- `pipeline/src/evaluate.ts`: Value-evaluation vocabulary & mutation/invariant documentation.
- `pipeline/src/localize.ts`: Accurate compatibility-tombstone documentation.
- `pipeline/src/main.ts`: Pipeline phase boundaries, CLI semantics, & write boundary.
- `pipeline/src/requirements.ts`: Normalized Boolean requirement vocabulary & contract.
- `pipeline/src/extractors/sources.ts`: Acquisition-source vocabulary and lossy projection contract.
- `pipeline/src/extractors/almanac.ts`: Complete item-index versus visible almanac contract.
- `pipeline/src/extractors/animals.ts`: Variant inclusion & normalization contract.
- `pipeline/src/extractors/cosmetics.ts`: Slot normalization & fallback contract.
- `pipeline/src/extractors/mines.ts`: Synthetic biome-boundary contract.
- `pipeline/src/extractors/museum.ts`: UI-defined ordering & fallback contract.
- `pipeline/src/extractors/npcs.ts`: Inclusion contract.
- `pipeline/src/extractors/quest-gates.ts`: Direct finished-item reward semantics.
- `pipeline/src/extractors/quests.ts`: Tracked quest-group boundary.
- `pipeline/src/extractors/renown.ts`: Default-value contract.
- `pipeline/src/extractors/skills.ts`: Template exclusion & name fallback.
- `pipeline/src/parse-fiddle.test.ts`: Type renames only.
- `pipeline/src/evaluate.test.ts`: Type renames and honest test comments only.
- `pipeline/src/requirements.test.ts`: Type renames and correct contradictory test title.
- `docs/superpowers/specs/2026-08-10-pipeline-v2-design.md`: Historical/current status notice and
  corrections for claims that contradict implementation.
- `docs/superpowers/plans/2026-08-10-pipeline-v2-toml.md`: Historical-plan status notice.

---

### Task 1: Add the authoritative pipeline guide

**Files:**

- Create: `pipeline/README.md`
- Reference: `pipeline/src/main.ts`
- Reference: `pipeline/src/parse-fiddle.ts`
- Reference: `pipeline/src/evaluate.ts`
- Reference: `pipeline/src/requirements.ts`
- Reference: `pipeline/src/extractors/*.ts`
- Reference: `src/lib/types/tracker-data.ts`

**Interfaces:**

- Consumes: Current runtime behavior and the approved design at
  `docs/superpowers/specs/2026-08-10-pipeline-documentation-design.md`.
- Produces: The canonical documentation target that root docs, historical artifacts, and source
  comments can reference.

- [ ] **Step 1: Write the operating contract**

Create `pipeline/README.md` with these opening sections and facts:

```markdown
# Data pipeline

The pipeline converts Fields of Mistria’s native TOML namespaces into the smaller
`TrackerData` model consumed by Harvest Helper. It deliberately ignores game domains the tracker
does not claim, but many claimed fields are normalized or omitted according to extractor-specific
rules documented below.

## Setup & commands

The input argument is an assets root containing `fiddle/`, not the `fiddle/` directory itself.
Game assets are ignored by Git and are not present in a fresh clone.

pnpm run pipeline -- /path/to/assets
MISTRIA_ASSETS=/path/to/assets pnpm run pipeline
pnpm run pipeline -- /path/to/assets --parse-only
pnpm exec vitest run pipeline/
```

State that `--parse-only` currently enforces the v1.0.2 fixture’s 295 non-metadata files and three
representative paths, so it is not a version-agnostic validator.

- [ ] **Step 2: Document the data flow & vocabulary**

Add a compact flow and glossary covering these exact transformations:

```text
assets root
  → parse TOML into a dotted namespace tree + non-enumerable provenance
  → evaluate item value expressions in place
  → project claimed namespaces through domain extractors
  → attach direct-reward quest gates
  → assemble TrackerData
  → write committed and diagnostic JSON artifacts
```

Define: assets root, fiddle root, dotted root path, provenance, claimed data, primitive predicate,
named requirement, requirement expression, acquisition source, restriction, and quest gate.

- [ ] **Step 3: Document each processor & extractor**

Add a table mapping every `pipeline/src` module to its input ownership, output, and important
normalization or omission. Include all 10 domain extractors plus `sources.ts` and `quest-gates.ts`.

The source-extractor entry must state that:

- Source order follows extractor order.
- Structural deduplication preserves the first identical JSON representation.
- Targets include items, cosmetics, and other game object IDs.
- Scroll entries are counted and discarded.
- `all` requirements flatten, while `any`, `not`, unsupported predicates, and reached-date day
  precision are discarded.

The quest-gate entry must state that only direct finished-item quest rewards are indexed; recipe
scrolls and animal, spell, store, & progression inference are deferred.

- [ ] **Step 4: Document artifacts & mutation boundaries**

List these outputs with their ownership:

```text
pipeline/output/tracker-data.json          Pretty diagnostic output
pipeline/output/tracker-data-readable.json Duplicate pretty diagnostic output
pipeline/output/fiddle-readable.json       Parsed/evaluated namespace tree for inspection
src/lib/data/tracker-data.json             Minified committed app data
```

State that evaluation mutates the parsed tree, gate applicators mutate extracted registries, no
files are written until every transform succeeds, and `generatedAt` changes on every successful run.

- [ ] **Step 5: Add implementation-ready recommendations**

Transfer all eight briefs from the approved design into a “Recommendations” section without
weakening their current behavior, affected files, desired result, constraints, or verification
criteria:

1. Make tests portable.
2. Preserve requirement logic.
3. Model acquisition identities.
4. Strengthen restriction types.
5. Define validation policy.
6. Version parse-only checks.
7. Add contract coverage.
8. Tighten expression grammar.

- [ ] **Step 6: Review the guide against production code**

Run:

```bash
rtk rg -n "parse-only|sourceFileFor|flattenExprToRestrictions|predicateToRestriction|questGate|generatedAt" pipeline/src src/lib/types/tracker-data.ts
```

Expected: Every behavior named in the guide has a corresponding implementation reference; the
guide contains no promise of recipe tracking, complete requirement preservation, or bundled assets.

- [ ] **Step 7: Review the guide checkpoint**

```bash
rtk git diff --check -- pipeline/README.md
rtk git diff --stat -- pipeline/README.md
```

Expected: No whitespace errors; leave the guide uncommitted for final user review.

---

### Task 2: Correct project & historical documentation

**Files:**

- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `AGENTS.md`
- Modify: `pipeline/QUEST-GATES.md`
- Modify: `docs/superpowers/specs/2026-08-10-pipeline-v2-design.md`
- Modify: `docs/superpowers/plans/2026-08-10-pipeline-v2-toml.md`
- Reference: `pipeline/README.md`

**Interfaces:**

- Consumes: The canonical current-state guide from Task 1.
- Produces: Concise entry points that direct maintainers to current behavior and clearly label
  historical design artifacts.

- [ ] **Step 1: Correct the root README**

Replace the checked-in-fixture claim with local-assets guidance. Keep the architecture summary, but
show provenance, in-place expression evaluation, extraction-time requirement parsing, quest-gate
attachment, and assembly. Add `MISTRIA_ASSETS`, explain the version-specific `--parse-only` mode,
list all four artifacts, and link `pipeline/README.md` for detailed contracts.

- [ ] **Step 2: Correct contributor commands & assumptions**

In `CONTRIBUTING.md`:

- Remove or correct the reference to nonexistent `IMPLEMENTATION-GUIDE.md`.
- Replace `npx vitest run pipeline/` with `pnpm exec vitest run pipeline/`.
- State that extractor work requires locally supplied assets for integration regeneration.
- Require pipeline tests, regeneration, `pnpm run check`, and `pnpm run lint` when the relevant
  assets are available.

In `AGENTS.md`:

- Replace the npx test command with pnpm.
- Remove the stale approximate 430 KB size.
- State that `pipeline/input/assets/` is ignored and local.
- Link the pipeline guide.

- [ ] **Step 3: Rewrite quest-gate documentation**

Replace the obsolete v0-era “Mapping strategy implemented” document with current sections:

```markdown
# Quest-gate extraction
## Current meaning
## Direct evidence
## Attachment behavior
## Deferred inference
## Follow-up design
```

Document the six tracked quest groups, direct `rewards[].item` indexing, deduplication through sets,
silent attachment skips for missing item/animal/spell IDs, always-empty deferred indexes, and the
exclusion of recipe/crafting scrolls. Link
`docs/superpowers/specs/2026-08-10-quest-gate-improvements.md`.

- [ ] **Step 4: Label historical design artifacts**

Add this status pattern near the top of both v2 documents:

```markdown
> Status: Historical design artifact for PR #43. See `pipeline/README.md` for implemented behavior.
> Where this document differs from the code, the maintainer guide and production code are
> authoritative.
```

Correct false current-scope claims in the design spec:

- The parser accepts an assets root and appends `fiddle/`.
- Inline evaluation supports two expression forms; restoration `value_expr` is ignored metadata.
- Localization is absent from `main.ts`; `localize.ts` is an always-throwing tombstone.
- Unknown requirement keys remain predicate leaves, and primitive payloads are not schema-validated.
- Recipe tracking is deferred and absent from `TrackerData`.
- Processed extractors do not uniformly fail on malformed data.
- The v1.0.2 assets are local and ignored, not checked in.

Do not rewrite the 1,341-line implementation plan as current documentation; its status notice must
direct readers to the maintainer guide.

- [ ] **Step 5: Search for stale claims**

Run:

```bash
rtk rg -n "checked-in fixture|npx vitest|~430KB|input/fiddle.json|progression_unlocks|adds a recipe domain|rejects unknown" README.md CONTRIBUTING.md AGENTS.md pipeline docs/superpowers
```

Expected: No unqualified current documentation repeats these claims. Historical examples may remain
only when their status and non-implementation are explicit.

- [ ] **Step 6: Review the documentation checkpoint**

```bash
rtk git diff --check -- README.md CONTRIBUTING.md AGENTS.md pipeline/QUEST-GATES.md \
  docs/superpowers/specs/2026-08-10-pipeline-v2-design.md \
  docs/superpowers/plans/2026-08-10-pipeline-v2-toml.md
```

Expected: No whitespace errors; leave the corrections uncommitted for final user review.

---

### Task 3: Clarify parser, shape validation, & orchestration types

**Files:**

- Modify: `pipeline/src/data-shapes.ts`
- Modify: `pipeline/src/parse-fiddle.ts`
- Modify: `pipeline/src/main.ts`
- Modify: `pipeline/src/localize.ts`
- Modify: `pipeline/src/parse-fiddle.test.ts`
- Modify: Every pipeline source file importing the renamed parsed-data or source-context types.

**Interfaces:**

- Produces:
  - `SourceFieldLocation { entityId?: string; fieldPath: string; sourcePath: string }`
  - `ParsedGameData = Record<string, unknown> & provenance symbol`
  - `ParsedGameDataResult { data; fileCount; sourceFileByRootPath }`
  - `sourceFileFor(data: ParsedGameData, dottedPath: string): string`
- Consumes: No new runtime data or app-facing schema.

- [ ] **Step 1: Rename the diagnostic context**

In `data-shapes.ts`, rename `DataContext` to `SourceFieldLocation`, with fields:

```typescript
export interface SourceFieldLocation {
  entityId?: string;
  fieldPath: string;
  sourcePath: string;
}
```

Keep `expectArray<T>()` and `expectStringArray()` runtime logic unchanged. Add a module comment stating
that `expectArray<T>()` checks only the outer array shape; its type parameter describes the caller’s
expected elements and is not runtime validation.

- [ ] **Step 2: Update context call sites**

Mechanically update all imports and object literals:

```text
entity → entityId
field → fieldPath
sourceFile → sourcePath
```

Preserve every rendered error message exactly by updating template references consistently.

- [ ] **Step 3: Rename parsed-data types & provenance fields**

In `parse-fiddle.ts`, apply these names without altering control flow:

```text
SOURCE_FILES → SOURCE_FILE_BY_ROOT_PATH
FiddleData → ParsedGameData
ParsedFiddle → ParsedGameDataResult
sourceFiles → sourceFileByRootPath
result → data
obj → target
```

Expose both provenance maps as `ReadonlyMap<string, string>` in types while retaining the same
underlying `Map` construction.

- [ ] **Step 4: Add parser contracts**

Add JSDoc explaining that `parseFiddle()` accepts the assets root, appends `fiddle/`, maps relative
file paths to dotted roots, skips non-TOML and `.meta.toml` files, rejects ancestor/descendant root
collisions, and embeds provenance non-enumerably so it survives mutation but not JSON serialization.

Add JSDoc to `sourceFileFor()` explaining nearest-ancestor lookup because the map indexes file roots
while callers pass entity or field paths.

- [ ] **Step 5: Document orchestration boundaries**

In `main.ts`, add one module comment covering phase order, in-place evaluation, post-extraction gate
mutation, and the rule that writes begin only after all transformations succeed. Explain that
`--parse-only` is v1.0.2-specific. Remove comments that only duplicate step logs.

In `localize.ts`, replace the no-op/stub claim with an accurate comment: the module is retained only
as an explicit compatibility tombstone, is absent from `main.ts`, and always throws, including for
English.

- [ ] **Step 6: Update tests & run focused verification**

Update type imports and provenance property assertions in `parse-fiddle.test.ts`. Do not add new
behavioral assertions in this pass.

Run:

```bash
rtk pnpm exec vitest run pipeline/src/parse-fiddle.test.ts
rtk pnpm run check
```

Expected: Parser tests pass, and TypeScript reports zero errors.

- [ ] **Step 7: Review the parser & orchestration checkpoint**

```bash
rtk git diff --check -- pipeline/src
rtk git diff --stat -- pipeline/src
```

Expected: No whitespace errors; leave the type refactor uncommitted for final user review.

---

### Task 4: Clarify value expression evaluation

**Files:**

- Modify: `pipeline/src/evaluate.ts`
- Modify: `pipeline/src/evaluate.test.ts`

**Interfaces:**

- Consumes: `ParsedGameData` and `sourceFileFor()` from Task 3.
- Produces: The unchanged `evaluateExpressions(data: ParsedGameData): void` behavior with descriptive
  internal state names.

- [ ] **Step 1: Rename evaluator vocabulary**

Apply these compile-time/local names:

```text
ValueField → ResolvableValueField
EvaluationContext → ValueEvaluationContext
allItems → itemsById
itemRoots → itemRootPathById
stack → dependencyPathStack
valueStates → resolutionStateByValuePath
subCategories → categoryFiles
fileId → fileStem
categoryItems → itemsInFile
expr → expression
refId → referencedItemId
storeVal → referencedStoreValue
ing → ingredientData
ingItemId → ingredientItemId
ingItem → ingredientItem
```

Do not alter either regular expression, evaluation order, rounding, mutation, or error text.

- [ ] **Step 2: Add the evaluator contract**

Document these invariants beside `evaluateExpressions()` and the recipe-cost loop:

- Item IDs must be globally unique across item TOML files.
- The parsed tree is mutated in place.
- Only `self.recipe * N` and `<item_id>.store * N` inline forms are supported.
- Absence from the state map means unvisited; revisiting `visiting` reports a dependency cycle.
- Every claimed string `bin` or `store` value must become numeric before extraction.
- Recipe cost ignores numeric hours and essence entries, defaults missing counts to one, rejects
  invalid counts, prefers bin, falls back to store, and preserves zero as a valid value.

Replace regex-narrating “Pattern 1/2” comments with one grammar/semantics comment.

- [ ] **Step 3: Correct overclaiming test prose**

Keep assertions unchanged, but rename or reword comments so they describe actual coverage:

- The bundle test verifies a representative referenced store value remains numeric; it does not
  assert a bundle’s computed total.
- The multi-count test is a fixture-wide no-throw smoke test; it does not directly assert a specific
  computed value.

- [ ] **Step 4: Run evaluator verification**

```bash
rtk pnpm exec vitest run pipeline/src/evaluate.test.ts
rtk pnpm run check
```

Expected: Four evaluator tests pass, and TypeScript reports zero errors.

- [ ] **Step 5: Review the evaluator checkpoint**

```bash
rtk git diff --check -- pipeline/src/evaluate.ts pipeline/src/evaluate.test.ts
```

Expected: No whitespace errors; leave the changes uncommitted for final user review.

---

### Task 5: Clarify requirement normalization & source projection

**Files:**

- Modify: `pipeline/src/requirements.ts`
- Modify: `pipeline/src/requirements.test.ts`
- Modify: `pipeline/src/extractors/sources.ts`

**Interfaces:**

- Consumes: `SourceFieldLocation` and `ParsedGameData` from Task 3.
- Produces:
  - `RequirementExpression`
  - `NamedRequirementDefinitions`
  - `RequirementDefinitions { namedRequirements; primitivePredicates }`
  - Unchanged source output and requirement projection.

- [ ] **Step 1: Rename requirement types & state**

Apply these names throughout production and tests:

```typescript
export type RequirementExpression =
  | { all: RequirementExpression[] }
  | { any: RequirementExpression[] }
  | { not: RequirementExpression }
  | { predicate: string; value: unknown };

export type NamedRequirementDefinitions = Record<string, Record<string, unknown>>;

export interface RequirementDefinitions {
  namedRequirements: NamedRequirementDefinitions;
  primitivePredicates: Set<string>;
}
```

Rename `ResolverState` to `RequirementResolutionContext`, `states` to
`resolutionStateByName`, `nameStack` to `namedRequirementStack`, and `parts` to `conjuncts`.

Change `buildRequirementRegistry()` to `buildRequirementDefinitions()` and return the named fields
above. This is an internal interface refactor; preserve registry classification and iteration.

- [ ] **Step 2: Add the requirement contract**

Document these exact semantics:

- Missing, null, and empty objects normalize to `{ all: [] }`, representing an unconstrained true
  expression.
- Sibling keys imply `all`; an `or` array implies `any`; `invert` implies `not`.
- A single-object `or` parses directly rather than gaining a redundant `any` wrapper.
- Empty top-level definition tables identify primitive predicate names; nonempty tables identify
  named definitions.
- Named references must be literal `true`, are expanded recursively, are memoized, and report cycles.
- Unknown keys deliberately remain predicate leaves for forward compatibility; this layer does not
  schema-validate primitive payloads.

- [ ] **Step 3: Make source-extractor vocabulary truthful**

Apply these internal names without changing extraction order:

```text
SourceMap → AcquisitionSourceIndex
map → sourcesByTargetId
itemId parameter in addSource → targetId
namedRegistry → namedRequirements
primitives → primitivePredicates
extractCraftingItems → extractRecipeSources
extractCropItems → extractSeedAndSaplingSources
extractCropSeasons → deriveCropSourcesFromSeeds
extractFestivalCosmetics → extractFestivalStockSources
mapRequirementsToRestrictions → projectRequirementsToRestrictions
flattenExprToRestrictions → projectRequirementExpressionToFlatRestrictions
```

- [ ] **Step 4: Document source ordering, identity, & loss**

Add a module contract describing:

```text
native TOML namespaces
  → acquisition targets
  → Source records with flat restriction arrays
  → structural first-entry-preserving deduplication
```

Place concise intent comments beside these losses and assumptions:

- `all` is flattened as an implicit conjunction.
- Entire `any` and `not` branches are discarded.
- Unsupported predicates return no restriction.
- `reached_date` retains season only.
- `Source.location` has type-dependent meaning.
- Scroll records are counted and intentionally discarded.
- Fish use `data.item ?? fishId`, small fish size is omitted, crop sources copy the seed’s first season
  restriction, and festival season comes from a hard-coded ID map.

- [ ] **Step 5: Correct contradictory requirement test names**

Rename “throws on unknown requirement names” to “preserves unknown keys as predicate leaves”. Rename
`ctx` to `testSourceLocation` and `makeState` to `makeRequirementDefinitions`. Update type names only;
do not add assertions.

- [ ] **Step 6: Run requirement & source verification**

```bash
rtk pnpm exec vitest run pipeline/src/requirements.test.ts
rtk pnpm run check
```

Expected: Nine requirement tests pass, source extraction type-checks, and runtime projection remains
unchanged.

- [ ] **Step 7: Review the requirement & source checkpoint**

```bash
rtk git diff --check -- pipeline/src/requirements.ts pipeline/src/requirements.test.ts \
  pipeline/src/extractors/sources.ts
```

Expected: No whitespace errors; leave the changes uncommitted for final user review.

---

### Task 6: Document domain extractor policies

**Files:**

- Modify: `pipeline/src/extractors/almanac.ts`
- Modify: `pipeline/src/extractors/animals.ts`
- Modify: `pipeline/src/extractors/cosmetics.ts`
- Modify: `pipeline/src/extractors/mines.ts`
- Modify: `pipeline/src/extractors/museum.ts`
- Modify: `pipeline/src/extractors/npcs.ts`
- Modify: `pipeline/src/extractors/quest-gates.ts`
- Modify: `pipeline/src/extractors/quests.ts`
- Modify: `pipeline/src/extractors/renown.ts`
- Modify: `pipeline/src/extractors/skills.ts`

**Interfaces:**

- Consumes: `ParsedGameData` and `SourceFieldLocation` from Task 3.
- Produces: Unchanged `TrackerData` projections with explicit module contracts.

- [ ] **Step 1: Clarify almanac registry vocabulary**

Rename `ItemsRegistry` to `ItemMetadataIndex`. Add a module contract distinguishing all named items
from visible almanac rows. Document menu-order tag precedence, chest exclusion,
`unreviewed_new_items` exclusion, localization-path rejection, top-category fallback, and furniture
collapse by `(recipe_key, name)`.

- [ ] **Step 2: Document animal & cosmetic normalization**

For animals, document `ranching.animals` ownership, `default` template exclusion,
`acquirable = false` exclusion, default-unlocked tier normalization, and species-name stripping.
Rename `skippedDefaults` to `skippedVariants` because it counts both templates and non-acquirable
variants.

For cosmetics, move `KNOWN_COMPOSITE_SLOTS` to module scope without changing membership. Document
slot normalization order, `bottom` recognition, ID-prefix inference, and the final `top` fallback.

- [ ] **Step 3: Document mines & museum derived structure**

For mines, document that biome IDs are synthetic array indices, end floors derive from the next
biome’s start, and missing floors use 20-floor spacing.

For museum, document that UI arrays define canonical display order, object order is only a fallback,
and unknown ordered wing or set IDs are skipped.

- [ ] **Step 4: Document NPC, quest, renown, & skill inclusion**

- NPCs: Missing name, Boolean `dateable`, or complete birthday silently excludes the record.
- Quests: The six allowlisted keys are TOML group/file names; request-board and registry siblings are
  excluded.
- Renown: Missing root returns 10 levels and no ranks; missing rank names become `Unknown`.
- Skills: The `default` template is excluded; missing names use snake-case title conversion.

- [ ] **Step 5: Document direct quest gates**

Add a module contract explaining that `itemGates` means quests directly granting a finished item.
Document recipe/crafting-scroll exclusion, set-based deduplication, deferred empty maps, silent
attachment skips, and the fact that a top-level direct gate can exist for an ID absent from the item
metadata index.

Rename only locals:

```text
QUEST_TYPES → TRACKED_QUEST_GROUP_KEYS
itemGates local set index → directRewardQuestsByItemId
itemGateRecord → directItemRewardIndex
```

Keep the exported `QuestGateIndex` property names unchanged because they are serialized app-facing
schema.

- [ ] **Step 6: Run type verification**

```bash
rtk pnpm run check
```

Expected: Zero TypeScript or Svelte errors.

- [ ] **Step 7: Review the extractor checkpoint**

```bash
rtk git diff --check -- pipeline/src/extractors
```

Expected: No whitespace errors; leave the changes uncommitted for final user review.

---

### Task 7: Verify behavior preservation & documentation consistency

**Files:**

- Inspect: Every file changed by Tasks 1 through 6.
- Do not modify or stage: `.gitignore`.

**Interfaces:**

- Consumes: All completed documentation and internal type refactors.
- Produces: Evidence that the PR remains behaviorally unchanged and all repository quality gates
  pass.

- [ ] **Step 1: Run pipeline unit tests**

```bash
rtk pnpm exec vitest run pipeline/
```

Expected with local assets: 18 tests pass. If assets are unavailable, record the missing local
fixture as an environmental limitation and run every synthetic test that does not require it.

- [ ] **Step 2: Run project checks**

```bash
rtk pnpm run check
rtk pnpm run lint
```

Expected: Both commands exit zero with no errors.

- [ ] **Step 3: Check formatting & stale language**

```bash
rtk git diff --check
rtk rg -n "checked-in fixture|npx vitest|~430KB|input/fiddle.json|Mapping Strategy Implemented" README.md CONTRIBUTING.md AGENTS.md pipeline docs/superpowers
```

Expected: No whitespace errors and no unqualified stale current-state claims.

- [ ] **Step 4: Prove generated behavior was not changed**

Run:

```bash
rtk git diff d788f0f -- src/lib/data/tracker-data.json
rtk git diff d788f0f --word-diff=porcelain -- pipeline/src | rtk rg -n "^[+-][^+-]"
```

Expected: No generated-data diff. Review every source-code addition or deletion and confirm it is a
comment, JSDoc, import/type rename, interface rename, local identifier rename, or formatting induced
by those changes.

- [ ] **Step 5: Inspect the final worktree**

```bash
rtk git status --short
rtk git log --oneline -8
```

Expected: The pre-existing `.gitignore` and `vite.config.ts` changes remain unstaged alongside this
task’s uncommitted documentation and pipeline edits. Do not stage or commit anything.

- [ ] **Step 6: Final review checklist**

Confirm all of the following before reporting completion:

- A new maintainer can find setup, stages, vocabulary, ownership, outputs, & limitations from
  `pipeline/README.md`.
- Root docs do not claim private game assets are checked in.
- Historical plans are labeled and do not supersede current docs.
- Comments explain why, loss, or invariants rather than restating control flow.
- All internal type renames are consistent across production and tests.
- Every recommendation is an independent implementation brief.
- No shared app-facing type or serialized schema changed.
- `.gitignore` and `vite.config.ts` were preserved and remain outside the proposed task commit.

- [ ] **Step 7: Request user approval before committing**

Present the changed-file summary, behavioral-preservation evidence, test output, and any remaining
recommendations. Commit only after the user explicitly approves the complete diff.
