<script lang="ts">
  import AllCompleted from "#lib/components/all-completed.svelte";
  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import SectionGroups from "#lib/components/section-groups.svelte";
  import SpoilerGuardDialog from "#lib/components/spoiler-guard-dialog.svelte";
  import TrackerRowList from "#lib/components/tracker-row-list.svelte";
  import TrackerRow from "#lib/components/tracker-row.svelte";
  import { createLeavingSet } from "#lib/controllers/leaving-set.svelte.js";
  import { createSectionGrouping } from "#lib/controllers/section-grouping.svelte.js";
  import { registerSourceFilters } from "#lib/controllers/source-filter-registration.svelte.js";
  import { createSpoilerGuard } from "#lib/controllers/spoiler-guard.svelte.js";
  import { trackerData, trackerIndex } from "#lib/data/index.js";
  import { getName, nameCollator } from "#lib/data/names.js";
  import { celebrate, celebrateCategory } from "#lib/effects/celebrate.js";
  import { showUndoToast } from "#lib/effects/undo-toast.js";
  import { isRowVisible } from "#lib/engine/availability.js";
  import { isCategoryComplete } from "#lib/engine/categories.js";
  import { recipePlacements } from "#lib/engine/projections/recipes.js";
  import { isConditionVisible } from "#lib/engine/visibility.js";
  import { buildBaseSegmentLookups } from "#lib/sources/segment-lookups.js";
  import { computeSpoileredStoreIds } from "#lib/sources/spoilered-stores.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { matchesName } from "#lib/utils/name-match.js";
  import { trackerRowDisplay } from "#lib/utils/row-display.js";

  import type { Source } from "#lib/types/acquisition.js";
  import type { LocaleCode } from "#lib/types/locale.js";
  import type { ItemId, RecipeId } from "#lib/types/tracker-data.js";
  import type { VisibilityCondition } from "#lib/types/visibility.js";

  let { locale }: { locale: LocaleCode } = $props();

  const spoilerGuard = createSpoilerGuard();

  const recentlyCompleted = createLeavingSet<RecipeId>();
  const sectionGrouping = createSectionGrouping<string>();

  let spoileredStoreIds = $derived(computeSpoileredStoreIds(userState.progressionState));

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

  let recipesByCategory = $derived.by(() =>
    recipePlacements().map(({ categoryId, recipes }) => {
      const entries = recipes.map(({ itemId, recipeId }): RecipeEntry => {
        const recipe = trackerData.recipes[recipeId];
        return {
          id: recipeId,
          itemId,
          name: getName("items", itemId, locale),
          sources: recipe.sources,
          spoilered: !isConditionVisible(recipe.visibility, userState.progressionState),
          visibility: recipe.visibility,
        };
      });
      entries.sort((a, b) => nameCollator(locale).compare(a.name, b.name));
      return { entries, id: categoryId, name: getName("ui", categoryId, locale) };
    }),
  );

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
    if (!nameFilter) return true;
    if (entry.spoilered) return false;
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
        filteredEntries: scopedEntries.filter((e) =>
          isRowVisible(
            e.id,
            isRecipeCompleted(e.id),
            userState.state.showCompleted,
            recentlyCompleted.ids,
          ),
        ),
        group,
        namedEntries,
        scopedEntries,
      };
    }),
  );

  const expandedSections = $state<Record<string, boolean>>({});

  function toggleRecipe(entry: RecipeEntry, sectionId: string, sectionRecipeIds: RecipeId[]): void {
    sectionGrouping.hold(sectionId);
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

<SectionGroups getKey={(view) => view.group.id} grouping={sectionGrouping} items={groupViews}>
  {#snippet section({ completedCount, filteredEntries, group, namedEntries, scopedEntries })}
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
                    group.id,
                    group.entries.map((candidate) => candidate.id),
                  );
                } else {
                  spoilerGuard.requestGuardedAction(entry.visibility, () => {
                    toggleRecipe(
                      entry,
                      group.id,
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
  {/snippet}
</SectionGroups>

<AllCompleted isAllCompleted={isAllComplete()} />
