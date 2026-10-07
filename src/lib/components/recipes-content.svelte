<script lang="ts">
  import AllCompleted from "#lib/components/all-completed.svelte";
  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import SpoilerGuardDialog from "#lib/components/spoiler-guard-dialog.svelte";
  import TrackerRowList from "#lib/components/tracker-row-list.svelte";
  import TrackerRow from "#lib/components/tracker-row.svelte";
  import { createLeavingSet } from "#lib/controllers/leaving-set.svelte.js";
  import { registerSourceFilters } from "#lib/controllers/source-filter-registration.svelte.js";
  import { createSpoilerGuard } from "#lib/controllers/spoiler-guard.svelte.js";
  import { trackerData, trackerIndex } from "#lib/data/index.js";
  import { getName, nameCollator } from "#lib/data/names.js";
  import { celebrate, celebrateCategory } from "#lib/effects/celebrate.js";
  import { showUndoToast } from "#lib/effects/undo-toast.js";
  import { isCategoryComplete } from "#lib/engine/progress.js";
  import { isConditionVisible } from "#lib/engine/visibility.js";
  import { buildBaseSegmentLookups } from "#lib/sources/segment-lookups.js";
  import { computeSpoileredStoreIds } from "#lib/sources/spoilered-stores.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { matchesName } from "#lib/utils/name-match.js";
  import { recordForEach } from "#lib/utils/record.js";
  import { trackerRowDisplay } from "#lib/utils/row-display.js";

  import type { Source } from "#lib/types/acquisition.js";
  import type { LocaleCode } from "#lib/types/locale.js";
  import type { Item, ItemId, RecipeId } from "#lib/types/tracker-data.js";
  import type { VisibilityCondition } from "#lib/types/visibility.js";

  let { locale }: { locale: LocaleCode } = $props();

  const spoilerGuard = createSpoilerGuard();

  const recentlyCompleted = createLeavingSet<RecipeId>();

  let spoileredStoreIds = $derived(computeSpoileredStoreIds(userState.progressionState));

  function recipeForItem(item: Item): RecipeId | undefined {
    return item.sources.find((source) => source.type === "recipe")?.recipeId;
  }

  // The current recipe condition is added when each tree is built.
  let baseSegmentLookups = $derived(buildBaseSegmentLookups(spoileredStoreIds, locale));

  interface RecipeEntry {
    id: RecipeId;
    itemId: ItemId;
    name: string;
    sources: Source[];
    spoilered: boolean;
    visibility?: VisibilityCondition;
  }

  let recipesByCategory = $derived.by(() => {
    const groups: { entries: RecipeEntry[]; id: string; name: string }[] = [];
    recordForEach(trackerData.almanac, ([catId, cat]) => {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Local deduplication is discarded within this derived calculation.
      const seen = new Set<string>();
      const entries: RecipeEntry[] = [];
      for (const entry of cat.items) {
        const canonicalId = entry.itemIds[0];
        const item = trackerData.items[canonicalId];
        const recipeId = recipeForItem(item);
        if (!recipeId || seen.has(recipeId)) continue;
        seen.add(recipeId);
        const recipe = trackerData.recipes[recipeId];
        const visibility = recipe.visibility;
        const sources = recipe.sources;
        entries.push({
          id: recipeId,
          itemId: canonicalId,
          name: getName("items", canonicalId, locale),
          sources,
          spoilered: !isConditionVisible(visibility, userState.progressionState),
          visibility,
        });
      }
      if (entries.length > 0) {
        entries.sort((a, b) => nameCollator(locale).compare(a.name, b.name));
        groups.push({ entries, id: catId, name: getName("ui", catId, locale) });
      }
    });
    return groups;
  });

  let nameFilter = $derived(toolbarState.searchQuery);

  registerSourceFilters("recipes", () => trackerIndex.categorySourceTypes.recipes);

  function checkCelebration(sectionRecipeIds: RecipeId[]): void {
    if (isAllComplete()) {
      celebrateCategory();
    } else if (sectionRecipeIds.every((id) => userState.state.progress.almanacRecipes.has(id))) {
      celebrate();
    }
  }

  function isAllComplete(): boolean {
    return isCategoryComplete("recipes", userState.state);
  }

  function matchesFilter(entry: RecipeEntry): boolean {
    return matchesName(entry.name, nameFilter, locale);
  }

  function isRecipeCompleted(id: RecipeId): boolean {
    return userState.state.progress.almanacRecipes.has(id);
  }

  /**
   * Each group's entries narrowed in three steps: `namedEntries` (search; the group renders only
   * when non-empty), `scopedEntries` (plus source filters; the counter), and `filteredEntries`
   * (plus completed-row hiding; what renders).
   */
  let groupViews = $derived(
    recipesByCategory.map((group) => {
      const namedEntries = group.entries.filter(matchesFilter);
      const scopedEntries = namedEntries.filter(({ sources }) =>
        toolbarState.matchesSourceFilters(sources),
      );
      return {
        completedCount: scopedEntries.filter((e) => isRecipeCompleted(e.id)).length,
        filteredEntries: scopedEntries.filter(
          (e) =>
            userState.state.showCompleted ||
            !isRecipeCompleted(e.id) ||
            recentlyCompleted.has(e.id),
        ),
        group,
        namedEntries,
        scopedEntries,
      };
    }),
  );

  const expandedSections = $state<Record<string, boolean>>({});

  function toggleRecipe(entry: RecipeEntry, sectionRecipeIds: RecipeId[]): void {
    userState.toggleAlmanacRecipe(entry.id);
    const nowCompleted = userState.state.progress.almanacRecipes.has(entry.id);
    showUndoToast(entry.name, nowCompleted, () => {
      userState.toggleAlmanacRecipe(entry.id);
    });
    if (nowCompleted) {
      if (!userState.state.showCompleted) recentlyCompleted.markLeaving(entry.id);
      checkCelebration(sectionRecipeIds);
    }
  }
</script>

<SpoilerGuardDialog guard={spoilerGuard} />

{#each groupViews as { completedCount, filteredEntries, group, namedEntries, scopedEntries } (group.id)}
  {#if namedEntries.length > 0}
    <ExpandableSection
      {locale}
      count={completedCount}
      forceOpen={!!nameFilter || toolbarState.isSourceFilterNarrowing}
      name={group.name}
      reportCategory="recipe-category"
      reportEntityId={group.id}
      total={scopedEntries.length}
    >
      <TrackerRowList
        expanded={expandedSections[group.id] ?? false}
        getKey={(entry) => entry.id}
        items={filteredEntries}
        limited
        onShowMore={() => {
          expandedSections[group.id] = true;
        }}
      >
        {#snippet row(entry)}
          {@const completed = userState.state.progress.almanacRecipes.has(entry.id)}
          <TrackerRow
            display={trackerRowDisplay({
              completed,
              leaving: recentlyCompleted.has(entry.id),
              spoilered: entry.spoilered,
            })}
            segmentLookups={{ ...baseSegmentLookups, entityVisibility: entry.visibility }}
            name={entry.name}
            reportCategory="recipe"
            reportEntityId={entry.id}
            sources={entry.sources}
            sprite={entry.itemId}
            spriteClass="text-(--color-category-recipes)"
            onToggle={() => {
              if (!entry.spoilered || completed) {
                toggleRecipe(
                  entry,
                  group.entries.map((candidate) => candidate.id),
                );
              } else {
                spoilerGuard.requestGuardedAction(entry.visibility, () => {
                  toggleRecipe(
                    entry,
                    group.entries.map((candidate) => candidate.id),
                  );
                });
              }
            }}
          />
        {/snippet}
      </TrackerRowList>
    </ExpandableSection>
  {/if}
{/each}

<AllCompleted isAllCompleted={isAllComplete()} />
