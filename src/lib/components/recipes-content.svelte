<script lang="ts">
  import AllCompleted from "#lib/components/all-completed.svelte";
  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import SectionGroups from "#lib/components/section-groups.svelte";
  import ShelfRows from "#lib/components/shelf-rows.svelte";
  import SpoilerGuardDialog from "#lib/components/spoiler-guard-dialog.svelte";
  import TrackerRow from "#lib/components/tracker-row.svelte";
  import { celebrateProgress } from "#lib/controllers/celebration.js";
  import { createLeavingSet } from "#lib/controllers/leaving-set.svelte.js";
  import { pageShelfFacts, registerPageSearch } from "#lib/controllers/page-search.svelte.js";
  import { createSectionGrouping } from "#lib/controllers/section-grouping.svelte.js";
  import { registerSourceFilters } from "#lib/controllers/source-filter-registration.svelte.js";
  import { createSpoilerGuard } from "#lib/controllers/spoiler-guard.svelte.js";
  import { trackerData, trackerIndex } from "#lib/data/index.js";
  import { getName, nameCollator } from "#lib/data/names.js";
  import { showUndoToast } from "#lib/effects/undo-toast.js";
  import { isCategoryComplete } from "#lib/engine/categories.js";
  import { factKey } from "#lib/engine/provenance.js";
  import { countShelfRows, filteredCounts, rowShelf } from "#lib/engine/shelves.js";
  import { isConditionVisible } from "#lib/engine/visibility.js";
  import * as m from "#lib/paraglide/messages.js";
  import { recipeSections } from "#lib/presentation/recipe-sections.js";
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
    itemId?: ItemId;
    name: string;
    sources: Source[];
    spoilered: boolean;
    visibility?: VisibilityCondition;
  }

  const sections = recipeSections();
  let recipesByCategory = $derived.by(() =>
    sections.map(({ categoryId, recipes }) => {
      const entries = recipes.map(({ itemId, recipeId }): RecipeEntry => {
        const recipe = trackerData.recipes[recipeId];
        return {
          id: recipeId,
          itemId,
          name:
            categoryId && itemId
              ? getName("items", itemId, locale)
              : getName("recipes", recipeId, locale),
          sources: recipe.sources,
          spoilered: !isConditionVisible(recipe.visibility, userState.progressionState),
          visibility: recipe.visibility,
        };
      });
      entries.sort((a, b) => nameCollator(locale).compare(a.name, b.name));
      return {
        categoryId,
        entries,
        id: categoryId ?? "other-recipes",
        name: categoryId ? getName("ui", categoryId, locale) : m.recipes_other({}, { locale }),
      };
    }),
  );

  let nameFilter = $derived(toolbarState.searchQuery);

  registerSourceFilters("recipes", () => trackerIndex.categorySourceTypes.recipes);

  function isAllComplete(): boolean {
    return isCategoryComplete("recipes", userState.progressContext);
  }

  function matchesFilter(entry: RecipeEntry): boolean {
    if (!nameFilter) return true;
    if (entry.spoilered) return false;
    return matchesName(entry.name, nameFilter, locale);
  }

  function isRecipeCompleted(id: RecipeId): boolean {
    return userState.state.progress.almanacRecipes.has(id);
  }

  /** Each group's rows: `namedEntries` match the search, & `filteredEntries` also pass the filters. */
  let groupViews = $derived(
    recipesByCategory.map((group) => {
      const facts = group.entries.map((entry) => ({
        ...entry,
        ...pageShelfFacts(entry, isRecipeCompleted(entry.id)),
      }));
      const namedEntries = facts.filter((entry) => matchesFilter(entry));
      return {
        filteredEntries: namedEntries.filter(({ shown }) => shown),
        group,
        namedEntries,
        progress: countShelfRows(facts),
      };
    }),
  );

  // A recipe can sit in several groups, but it's still one match.
  registerPageSearch(() => {
    const named = groupViews.flatMap((view) => view.namedEntries);
    const rows = [...new Map(named.map((entry) => [entry.id, entry])).values()];
    return {
      filtered: filteredCounts(rows),
      visible: rows.filter(({ shown }) => shown).length,
    };
  });

  function toggleRecipe(entry: RecipeEntry, sectionId: string, sectionRecipeIds: RecipeId[]): void {
    sectionGrouping.hold(sectionId);
    celebrateProgress(
      "recipes",
      () => {
        userState.toggleAlmanacRecipe(entry.id);
      },
      [() => sectionRecipeIds.every((id) => userState.state.progress.almanacRecipes.has(id))],
    );
    const nowCompleted = userState.state.progress.almanacRecipes.has(entry.id);
    showUndoToast(entry.name, nowCompleted, () => {
      userState.toggleAlmanacRecipe(entry.id);
    });
    if (nowCompleted) recentlyCompleted.markLeaving(entry.id);
  }
</script>

<SpoilerGuardDialog guard={spoilerGuard} />

<SectionGroups
  forceOpen={!!nameFilter}
  getKey={(view) => view.group.id}
  grouping={sectionGrouping}
  items={groupViews}
>
  {#snippet section({ filteredEntries, group, progress })}
    {#if !nameFilter || filteredEntries.length > 0}
      <ExpandableSection
        {locale}
        forceOpen={!!nameFilter}
        name={group.name}
        reportCategory={group.categoryId ? "recipe-category" : undefined}
        reportEntityId={group.categoryId}
        {progress}
      >
        <ShelfRows
          forceOpen={!!nameFilter}
          getKey={(entry) => entry.id}
          getShelf={rowShelf}
          isLeaving={(entry) => recentlyCompleted.has(entry.id)}
          items={filteredEntries}
        >
          {#snippet row(entry)}
            {@const completed = userState.state.progress.almanacRecipes.has(entry.id)}
            <TrackerRow
              fact={factKey("almanacRecipes", entry.id)}
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
        </ShelfRows>
      </ExpandableSection>
    {/if}
  {/snippet}
</SectionGroups>

<AllCompleted isAllCompleted={isAllComplete()} />
