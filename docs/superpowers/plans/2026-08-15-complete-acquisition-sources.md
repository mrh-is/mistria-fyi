# Complete acquisition sources implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every emitted item, cosmetic, and recipe a truthful inline acquisition source while
preserving complete source restrictions and failing generation on any future gap.

**Architecture:** New collectors write the final contract to namespace-specific accumulators. The
current legacy item extractor remains isolated for unmigrated app consumers, and a tested adapter
derives narrow recipe payloads; neither feeds the final contract. Final validation runs after every
consumer cuts over.

**Tech Stack:** TypeScript, Svelte 5, Vitest, TOML-derived Fiddle assets

**Spec:** `docs/superpowers/specs/2026-08-15-complete-acquisition-sources-design.md`

**Research:** `docs/superpowers/notes/2026-08-15-issue-78-source-audit.md`

## Global constraints

- Work only in `.worktrees/78-complete-sources` on branch `78-complete-sources`.
- Use Node >= 26 and pnpm exclusively.
- Follow red-green-refactor for every behavioral change. Record the expected failing assertion
  before implementation and rerun the focused test after the smallest green change.
- Never hand-edit `src/lib/data/tracker-data.json` or files under `src/lib/components/ui/`.
- An unexplained record must remain a pipeline failure. Do not add `unknown`, `unobtainable`, or
  blanket `default` sources.
- Update the research ledger whenever an ID remains unresolved after native-data and wiki checks.
- Before every commit run `pnpm run lint:fix`, `pnpm run lint`, `pnpm run check`, `pnpm run test`,
  `pnpm run build`, `pnpm run pipeline -- input/assets --version=0.0.0`, and `git diff --check`.
  Inspect the generated-data diff. Focused tests do not replace this matrix.

---

### Task 1: Add the shared source and availability contracts

**Files:**

- Modify: `src/lib/types/tracker-data.ts`
- Create: `src/lib/types/acquisition.ts`
- Create: `src/lib/engine/availability-condition.ts`
- Create: `src/lib/engine/__tests__/availability-condition.test.ts`

- [ ] Add failing tests for `always`, supported leaves, nested `all`/`any`/`not`, Kleene unknown
      propagation, simplification, and selective-season detection.
- [ ] Define the branded IDs, `JsonValue`, `AvailabilityCondition`, `SourceDetails`, closed `Source`
      union, and nonempty `SourceTuple` specified in the design. Re-export them from
      `tracker-data.ts`; retain temporary legacy aliases only until their consumers migrate.
- [ ] Implement `simplifyAvailabilityCondition()`, `evaluateAvailabilityCondition()`, and
      `hasSelectiveSeasonCondition()` as pure exhaustive functions.
- [ ] Run `pnpm run test:app -- availability-condition`, `pnpm run check`, and commit after the full
      matrix.

### Task 2: Project native requirements without information loss

**Files:**

- Modify: `pipeline/src/requirements.ts`
- Modify: `pipeline/src/requirements.test.ts`
- Create: `pipeline/src/acquisition/availability.ts`
- Create: `pipeline/src/acquisition/availability.test.ts`

- [ ] Add failing fixtures for mixed siblings, `or`, `invert`, four-season simplification, weather,
      time, mine floor, perk, completed and available quests, skill level, heart level, reached
      dates, and an unknown nested predicate value.
- [ ] Add a JSON-value guard that rejects `undefined`, functions, symbols, nonfinite numbers, and
      cyclic payloads with field-path provenance.
- [ ] Project `RequirementExpression` to the typed Boolean condition tree. Preserve unsupported
      predicates as `gamePredicate`; do not reuse the lossy `Restriction[]` conversion.
- [ ] Export a reusable requirement-context factory. Defer once-per-run construction and collector
      signature wiring to Tasks 4–5, when those collectors migrate together.
- [ ] Run `pnpm run test:pipeline -- requirements acquisition/availability`, then the full matrix.

### Task 3: Introduce typed source accumulators and reference validation

**Files:**

- Create: `pipeline/src/acquisition/source-accumulator.ts`
- Create: `pipeline/src/acquisition/source-accumulator.test.ts`
- Create: `pipeline/src/acquisition/reference-index.ts`
- Create: `pipeline/src/acquisition/validate-sources.ts`
- Create: `pipeline/src/acquisition/validate-sources.test.ts`
- Create: `pipeline/src/acquisition/legacy-recipe-adapter.ts`
- Create: `pipeline/src/acquisition/legacy-recipe-adapter.test.ts`
- Modify: `pipeline/src/main.ts`

- [ ] Test independent item and cosmetic namespaces, deterministic canonical sorting and
      first-entry-preserving deduplication, and identity including availability, cost, chance, and
      weight but excluding derived visibility.
- [ ] Test aggregated missing-source, malformed payload, unresolved branded reference, excluded-ID
      reference, and recipe-cycle diagnostics in deterministic order.
- [ ] Implement `ItemSourceAccumulator` and `CosmeticSourceAccumulator` over the shared helpers.
- [ ] Rename current public shapes to `LegacyItemSource` and `LegacyRecipeSource`. Implement a
      one-way `toLegacyRecipeSource()` projection for unmigrated consumers. Test cost projection,
      supported restriction flattening, and rejection of impossible recipe input.
- [ ] Build `AcquisitionReferenceIndex` from native and emitted registries, including non-emitted
      IDs such as activities, stations, locations, water types, and monsters.
- [ ] Add the validation call shape and an assembly fixture test, but defer the real-assets call in
      `main.ts` until Task 13 has cut over every canonical registry.
- [ ] Run both new focused suites, `pnpm run check`, and the full matrix.

### Task 4: Migrate recipes and add production sources to their products

**Files:**

- Modify: `pipeline/src/extractors/recipes.ts`
- Modify: `pipeline/src/extractors/recipes.test.ts`
- Create: `pipeline/src/acquisition/recipe-products.ts`
- Create: `pipeline/src/acquisition/recipe-products.test.ts`
- Modify: `pipeline/src/main.ts`
- Modify: `src/lib/types/tracker-data.ts`

- [ ] Convert recipe collectors internally to shared `Source` payloads, including structured costs
      for Chicken Statue beads and Wishing Well tesserae. Derive the temporary emitted
      `LegacyRecipeSource[]` through Task 3’s adapter and preserve visibility evidence.
- [ ] Test production-method derivation, every member receiving a recipe source, conflicting member
      methods, missing references, recursive availability, and cycle paths.
- [ ] Derive methods in order: cooked dish, milling tag, blacksmithing tag, Dragon Forge
      acquisition, then furniture crafting. Add production sources after recipes exist.
- [ ] Prove `kitchen_salt_and_pepper_shakers` through its real acquisition path.
- [ ] Build the requirement context once in `main.ts` and pass it into recipe extraction. Retain the
      narrow legacy recipe field until Task 12 widens it after exhaustive consumers migrate.
- [ ] Run the focused suites and full matrix.

### Task 5: Migrate existing item collectors to explicit source variants

**Files:**

- Refactor: `pipeline/src/extractors/sources.ts`
- Create: `pipeline/src/extractors/legacy-sources.ts`
- Create: `pipeline/src/acquisition/collectors/natural.ts`
- Create: `pipeline/src/acquisition/collectors/natural.test.ts`
- Create: `pipeline/src/acquisition/collectors/products.ts`
- Create: `pipeline/src/acquisition/collectors/products.test.ts`
- Modify: `pipeline/src/main.ts`

- [ ] Port fish, dive, bug, forage, seed, crop, tree, animal-product, monster, existing quest,
      festival, and renown extraction to explicit branded fields.
- [ ] Preserve the baseline flat extractor as isolated `extractLegacySources()` for the temporary
      top-level app index. Do not merge legacy output into final accumulators.
- [ ] Pass the once-per-run requirement context from `main.ts` into all migrated collectors.
- [ ] Join equipment `cosmetic_to_unlock` records so each equipment acquisition path also unlocks
      its cosmetic, without treating the equipment declaration itself as a source.
- [ ] Test each family before porting it. Preserve season, weather, time, chance, and full parsed
      requirements instead of copying a single flat restriction.
- [ ] Make crop and tree paths refer to their seed or sapling. Do not copy an input’s store paths to
      the produced item.
- [ ] Preserve fish-trap repaired-bridge access and Summit, Beach Cave, Western Ruins, and Deep
      Woods gates on their actual paths.
- [ ] For every claimed family, test malformed target and payload records and require diagnostics
      with target ID, field path, and source-file provenance.
- [ ] Delete migrated flat-restriction helpers; run focused collector suites and the full matrix.

### Task 6: Extract complete store and festival stock

**Files:**

- Create: `pipeline/src/acquisition/collectors/stores.ts`
- Create: `pipeline/src/acquisition/collectors/stores.test.ts`
- Modify: `pipeline/src/extractors/festivals.ts`
- Modify: `pipeline/src/extractors/stores-meta.ts`

- [ ] Test item and cosmetic targets across constant, seasonal, random, upgraded, and perk-gated
      stock, including Louis having permanent and distinct seasonal sources.
- [ ] Resolve every stock entry’s full requirements. Keep random stock as a source path rather than
      pretending randomness is an availability condition.
- [ ] Extract festival stock and activities with exact IDs, cost, season, chance, and weight. Cover
      the 200-tesserae Pumpkin Patch pool.
- [ ] Fail with native path provenance on malformed entries in a claimed stock family.
- [ ] Run `pnpm run test:pipeline -- stores festivals`, inspect representative generated records,
      and run the full matrix.

### Task 7: Extract quests, letters, renown, museum, dates, and relationship events

**Files:**

- Create: `pipeline/src/acquisition/collectors/rewards.ts`
- Create: `pipeline/src/acquisition/collectors/rewards.test.ts`
- Modify: `pipeline/src/extractors/quests.ts`
- Modify: `pipeline/src/extractors/renown.ts`
- Modify: `pipeline/src/extractors/museum.ts`

- [ ] Test quest `item` and `player_cosmetic` rewards, all letter triggers, exact renown levels,
      museum item/cosmetic/recipe rewards, and rejection of quest-request false positives.
- [ ] Join `10_heart_special_items` and cutscene evidence to proposal sources for every candidate.
- [ ] Join `date_unlock` inspirations to date types and photo items; represent first-date awards as
      date sources. Extract wedding and engagement assets separately.
- [ ] Confirm Explorer Boots is an archaeology museum reward and rank 91 gives the bronze Hero
      Shield plus recipe; rely on recipe production for crafted colorways.
- [ ] Classify every remaining `cutscenes.given_items` record by its real trigger, adding evidence
      to the research ledger before any override.
- [ ] Test malformed records in every claimed reward and relationship family; require target ID,
      field path, and source-file provenance in each diagnostic.
- [ ] Run `pnpm run test:pipeline -- rewards quests renown museum`, then the full matrix.

### Task 8: Extract exploration, random loot, artifacts, and perks

**Files:**

- Create: `pipeline/src/acquisition/collectors/exploration.ts`
- Create: `pipeline/src/acquisition/collectors/exploration.test.ts`
- Modify: `pipeline/src/extractors/mines.ts`
- Modify: `pipeline/src/extractors/treasure-chest-tiers.ts`

- [ ] Test fishing chest items, Beach Cave chests, every mine-biome loot array, ordinary mine loot,
      artifact digging, and monster drops with tier, biome, loot group, perk, chance, and weight.
- [ ] Extract `head_mimic_hat` as a `monster_feed` reward, not a Mimic drop.
- [ ] Extract dungeon biome cosmetic arrays, fishing-treasure cosmetics, and Wishing Well item and
      cosmetic rewards through the same typed accumulators.
- [ ] Parse all five biome armor families, including Scrap Metal armor in upper-mines chests.
- [ ] Resolve all 104 artifact loot records from structured tables.
- [ ] Prove all 105 `replica` items map exactly to one artifact; emit Artifact Replicator sources
      requiring one completed museum set and fail missing or ambiguous names.
- [ ] Extract Earthly Essence’s crop-harvest Magic Seed path and season-dependent result paths.
- [ ] Test malformed records in every claimed exploration, artifact, and perk family; require target
      ID, field path, and source-file provenance in each diagnostic.
- [ ] Run `pnpm run test:pipeline -- exploration mines treasure`, then the full matrix.

### Task 9: Add evidence-backed defaults, overrides, and exclusions

**Files:**

- Create: `pipeline/src/acquisition/reviewed-overrides.ts`
- Create: `pipeline/src/acquisition/reviewed-overrides.test.ts`
- Create: `pipeline/src/acquisition/exclusions.ts`
- Create: `pipeline/src/acquisition/exclusions.test.ts`
- Modify: `pipeline/src/extractors/cosmetics.ts`

- [ ] Add `default` only for consistent default recipes, cosmetics with
      `player_assets.default_unlocked`, and items with native starting-state evidence.
- [ ] Add reviewed overrides for Void Cake’s dialogue outcome and Lost to History Ritual Chamber
      records, with evidence comments and full availability.
- [ ] Test override identity, missing targets, obsolete overrides, and coexistence of distinct
      native and reviewed paths.
- [ ] Audit non-player records into an evidence-bearing exclusion table. Reject any exclusion still
      referenced by an almanac, museum set, recipe, or source.
- [ ] Run focused suites, update the research ledger, and run the full matrix.

### Task 10: Attach inline item and cosmetic sources

**Files:**

- Modify: `pipeline/src/main.ts`
- Modify: `pipeline/src/extractors/almanac.ts`
- Modify: `pipeline/src/extractors/cosmetics.ts`
- Modify: `pipeline/src/extractors/visibility/entity-visibility.ts`
- Modify: `pipeline/src/extractors/visibility/entity-visibility.test.ts`
- Modify: `src/lib/types/tracker-data.ts`

- [ ] Test that attachment precedes visibility assignment and writes.
- [ ] Attach item and cosmetic accumulators and recipe-product sources as nonempty tuples. Expose
      internal shared recipe tuples temporarily as `recipe.acquisitionSources` beside legacy
      `recipe.sources`; neither field may be derived from the other.
- [ ] Compute item and cosmetic entity/source visibility from inline arrays. Compute recipe-product
      visibility through the internal shared recipe registry with cycle detection.
- [ ] Keep `extractLegacySources()` as the unchanged top-level index until Tasks 11–12 migrate app
      consumers. Test that it is write-only compatibility data and never feeds inline sources.
- [ ] Run full assets and record every remaining ID in the ledger; implement real collectors or
      reviewed exclusions until the missing count is zero.
- [ ] Assert representative source-type counts against extraction collapse, then run the full
      matrix.

### Task 11: Migrate app availability, progress, search, and persisted defaults

**Files:**

- Modify: `src/lib/engine/availability.ts`
- Modify: `src/lib/engine/__tests__/availability.test.ts`
- Modify: `src/lib/engine/progress.ts`
- Modify: `src/lib/engine/search.ts`
- Modify: `src/lib/engine/import-save.ts`
- Modify: `src/lib/engine/quest-rewards.ts`
- Modify: `src/lib/engine/__tests__/import-save.test.ts`
- Modify: `src/lib/engine/__tests__/quest-rewards.test.ts`
- Modify: `src/lib/stores/user-state.svelte.ts`
- Modify: `src/lib/stores/user-state.test.ts`

- [ ] Test inline item and cosmetic alternatives, unknown-only paths, Everything bypass, Available
      true-only behavior, Timely selective seasons, and recursive recipe availability.
- [ ] Replace source-map parameters with entity-owned sources plus recipe lookup. Preserve completed
      item behavior in counters and filtering.
- [ ] Evaluate recipe production paths through temporary `recipe.acquisitionSources`, preserving
      nested Boolean conditions and unknown leaves that the legacy recipe field cannot represent.
- [ ] Update progress and search to use inline sources and remove the cosmetic-to-item ID cast.
- [ ] Keep import and initial-state default recipe detection on `{ type: "default" }`; update quest
      reward discovery for the shared quest variant.
- [ ] Run app availability, import-save, quest-rewards, user-state, progress, and search tests, then
      the full matrix.

### Task 12: Migrate source display, icons, redaction, and components

**Files:**

- Modify: `src/lib/types/tracker-data.ts`
- Modify: `pipeline/src/main.ts`
- Modify: `pipeline/src/extractors/recipes.ts`
- Modify: `pipeline/src/extractors/visibility/entity-visibility.ts`
- Modify: `src/lib/engine/availability.ts`
- Modify: `src/lib/engine/__tests__/availability.test.ts`
- Modify: `src/lib/utils/format.ts`
- Modify: `src/lib/utils/format.test.ts`
- Modify: `src/lib/utils/source-segments.ts`
- Modify: `src/lib/utils/source-segments.test.ts`
- Modify: `src/lib/components/icon/icon-maps.ts`
- Modify: `src/lib/components/icon/icon-source.svelte`
- Modify: `src/lib/components/restriction-badges.svelte`
- Modify: `src/lib/components/recipe-source-list.svelte`
- Modify: `src/lib/components/recipe-source-list.test.ts`
- Modify: `src/lib/components/redacted-row.svelte`
- Modify: `src/lib/components/redacted-row.test.ts`
- Modify:
  `src/lib/components/{almanac-content,completion-row,cosmetic-row,cosmetics-content,item-detail,item-row,museum-content,recipes-content,search-results}.svelte`
- Modify: `src/lib/stores/toolbar-state.svelte.ts`

- [ ] Add exhaustive label, icon, segment-tree, and redaction tests for every source variant.
      Include recipe method labels and recursive recipe acquisition detail.
- [ ] Replace restriction badges with Boolean-condition summaries without claiming unknown leaves
      are available.
- [ ] Pass inline item and cosmetic arrays through all row/detail/list components; remove every
      global source lookup.
- [ ] Update recipe filters and toolbar source taxonomy for the closed shared union.
- [ ] Widen `Recipe.sources` from the narrow compatibility payload to `SourceTuple`, remove recipe
      adapter calls and temporary `acquisitionSources`, and update every exhaustive switch in the
      same compiling slice.
- [ ] Switch recursive availability from temporary `recipe.acquisitionSources` to canonical
      `recipe.sources` and assert identical results before removing the temporary field.
- [ ] Run source-segment, formatting, component, and full app suites, then the full matrix.

### Task 13: Final real-assets audit and delivery

**Files:**

- Modify: `pipeline/src/main.ts`
- Modify: `pipeline/src/extractors/visibility/entity-visibility.ts`
- Modify: `src/lib/types/tracker-data.ts`
- Delete: `pipeline/src/extractors/legacy-sources.ts`
- Delete: `pipeline/src/acquisition/legacy-recipe-adapter.ts`
- Delete: `pipeline/src/acquisition/legacy-recipe-adapter.test.ts`
- Regenerate: `src/lib/data/tracker-data.json`
- Update: `docs/superpowers/notes/2026-08-15-issue-78-source-audit.md`
- Update: `pipeline/README.md`

- [ ] Remove derived legacy output, compatibility aliases and adapters, flat restriction helpers,
      and transitional tests now that all consumers use inline sources.
- [ ] Enable final source validation unconditionally before visibility assignment or any write.
- [ ] Run the full pipeline twice and prove byte-identical output after normalizing `generatedAt`.
- [ ] Assert zero missing item, cosmetic, and recipe sources; zero invalid references; zero recipe
      cycles; exact replica resolution; and reviewed representative records for every collector
      family.
- [ ] Search for `TrackerData.sources`, `trackerData.sources`, `RecipeSource`, `Restriction`, and
      legacy source-map parameters. Explain any intentional remaining matches.
- [ ] Perform a context-light independent code review and address every correctness finding.
- [ ] Run the complete verification matrix one final time and inspect `git diff --check`, generated
      source counts, and the complete diff.
- [ ] Commit, push `78-complete-sources`, and open a draft PR with `Closes #78`, verification
      evidence, remaining caveats, and a link to the research ledger.
