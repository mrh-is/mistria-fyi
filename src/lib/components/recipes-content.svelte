<script lang="ts">
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
  import { isVisible } from "#lib/engine/visibility.js";
  import { computeRedactedStoreIds } from "#lib/sources/redacted-stores.js";
  import { buildBaseSegmentLookups } from "#lib/sources/segment-lookups.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { recordForEach } from "#lib/utils/record.js";
  import { trackerRowDisplay } from "#lib/utils/row-display.js";

  import AllCompleted from "./all-completed.svelte";

  import type { Source } from "#lib/types/acquisition.js";
  import type { LocaleCode } from "#lib/types/locale.js";
  import type { Item, ItemId, RecipeId } from "#lib/types/tracker-data.js";
  import type { VisibilityCondition } from "#lib/types/visibility.js";

  let { locale }: { locale: LocaleCode } = $props();

  const spoilerGuard = createSpoilerGuard();

  const recentlyCompleted = createLeavingSet<RecipeId>();

  let redactedStoreIds = $derived(computeRedactedStoreIds(userState.progressionState));

  function recipeForItem(item: Item): RecipeId | undefined {
    return item.sources.find((source) => source.type === "recipe")?.recipeId;
  }

  // The current recipe condition is added when each tree is built.
  let baseSegmentLookups = $derived(buildBaseSegmentLookups(redactedStoreIds, locale));

  interface RecipeEntry {
    id: RecipeId;
    itemId: ItemId;
    name: string;
    nameVisible: boolean;
    sources: Source[];
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
          nameVisible: isVisible(visibility, userState.progressionState),
          sources,
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
    } else if (sectionRecipeIds.every((id) => userState.state.completed.almanacRecipes.has(id))) {
      celebrate();
    }
  }

  function isAllComplete(): boolean {
    return isCategoryComplete("recipes", userState.state);
  }

  function matchesName(entry: RecipeEntry): boolean {
    return !nameFilter || entry.name.toLowerCase().includes(nameFilter.toLowerCase());
  }

  const expandedSections = $state<Record<string, boolean>>({});

  function toggleRecipe(entry: RecipeEntry, sectionRecipeIds: RecipeId[]): void {
    userState.toggleAlmanacRecipe(entry.id);
    const nowCompleted = userState.state.completed.almanacRecipes.has(entry.id);
    showUndoToast(entry.name, nowCompleted, () => {
      userState.toggleAlmanacRecipe(entry.id);
    });
    if (nowCompleted) {
      if (!userState.state.showCompleted) recentlyCompleted.mark(entry.id);
      checkCelebration(sectionRecipeIds);
    }
  }
</script>

<SpoilerGuardDialog guard={spoilerGuard} />

{#each recipesByCategory as group (group.id)}
  {@const namedEntries = group.entries.filter(matchesName)}
  {@const scopedEntries = namedEntries.filter(({ sources }) =>
    toolbarState.matchesSourceFilters(sources),
  )}
  {@const filteredEntries = scopedEntries.filter((e) => {
    if (!userState.state.showCompleted && userState.state.completed.almanacRecipes.has(e.id)) {
      return recentlyCompleted.has(e.id);
    }
    return true;
  })}
  {#if namedEntries.length > 0}
    <ExpandableSection
      {locale}
      count={scopedEntries.filter((e) => userState.state.completed.almanacRecipes.has(e.id)).length}
      forceOpen={!!nameFilter || toolbarState.sourceFilterActive}
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
          {@const completed = userState.state.completed.almanacRecipes.has(entry.id)}
          <TrackerRow
            display={trackerRowDisplay({
              completed,
              leaving: recentlyCompleted.has(entry.id),
              nameVisible: entry.nameVisible,
            })}
            lookups={{ ...baseSegmentLookups, entityVisibility: entry.visibility }}
            name={entry.name}
            reportCategory="recipe"
            reportEntityId={entry.id}
            sources={entry.sources}
            sprite={entry.itemId}
            spriteClass="text-cat-recipes"
            onToggle={() => {
              if (entry.nameVisible || completed) {
                toggleRecipe(
                  entry,
                  group.entries.map((candidate) => candidate.id),
                );
              } else {
                spoilerGuard.guard(entry.visibility, () => {
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
