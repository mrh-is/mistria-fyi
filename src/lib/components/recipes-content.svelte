<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";

  import ConfirmSpoilerDialog from "$lib/components/confirm-spoiler-dialog.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import TrackerRowStack from "$lib/components/tracker-row-stack.svelte";
  import TrackerRow from "$lib/components/tracker-row.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { trackerData, trackerIndex } from "$lib/data/index.js";
  import { isVisible } from "$lib/engine/visibility.js";
  import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { recordEntries, recordForEach } from "$lib/utils";
  import { celebrate, celebrateCategory } from "$lib/utils/celebrate.js";
  import { buildBaseSegmentLookups } from "$lib/utils/segment-lookups.js";
  import { registerSourceFilters } from "$lib/utils/source-filter-registration.svelte.js";
  import { createSpoilerGuard } from "$lib/utils/spoiler-guard.svelte.js";
  import { showUndoToast } from "$lib/utils/undo-toast.js";

  import AllCompleted from "./all-completed.svelte";

  import type { TrackerRowDisplay } from "$lib/components/tracker-row.svelte";
  import type { Source } from "$lib/types/acquisition";
  import type { Item, RecipeId } from "$lib/types/tracker-data.js";
  import type { VisibilityCondition } from "$lib/types/visibility.js";

  const spoilerGuard = createSpoilerGuard();

  let recentlyCompleted = new SvelteSet<RecipeId>();

  function markLeaving(recipeId: RecipeId): void {
    recentlyCompleted.add(recipeId);
    setTimeout(() => recentlyCompleted.delete(recipeId), 1050);
  }

  let redactedStoreIds = $derived(
    new Set(
      recordEntries(trackerData.stores)
        .filter(
          ([, { visibility }]) => visibility && !isVisible(visibility, userState.progressionState),
        )
        .map(([id]) => id),
    ),
  );

  function recipeForItem(item: Item): RecipeId | undefined {
    return item.sources.find((source) => source.type === "recipe")?.recipeId;
  }

  // The current recipe condition is added when each tree is built.
  let baseSegmentLookups = $derived(buildBaseSegmentLookups(redactedStoreIds));

  interface RecipeEntry {
    iconSprite: string;
    id: RecipeId;
    name: string;
    nameVisible: boolean;
    sources: Source[];
    visibility?: VisibilityCondition;
  }

  let recipesByCategory = $derived.by(() => {
    const groups: { entries: RecipeEntry[]; id: string; name: string }[] = [];
    recordForEach(trackerData.almanac, ([catId, cat]) => {
      const seen = new SvelteSet<string>();
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
          iconSprite: item.iconSprite,
          id: recipeId,
          name: entry.name,
          nameVisible: isVisible(visibility, userState.progressionState),
          sources,
          visibility,
        });
      }
      if (entries.length > 0) {
        entries.sort((a, b) => a.name.localeCompare(b.name));
        groups.push({ entries, id: catId, name: cat.name });
      }
    });
    return groups;
  });

  function rowDisplay(entry: RecipeEntry, completed: boolean, leaving: boolean): TrackerRowDisplay {
    if (!entry.nameVisible) return { mode: "spoilered" };
    if (completed) return { leaving, mode: "completed" };
    return { mode: "visible" };
  }

  let nameFilter = $derived(toolbarState.searchQuery);

  registerSourceFilters("recipes", () => trackerIndex.categorySourceTypes.recipes);

  function matchesName(entry: RecipeEntry): boolean {
    return !nameFilter || entry.name.toLowerCase().includes(nameFilter.toLowerCase());
  }

  function isAllComplete(): boolean {
    return Object.keys(trackerData.recipes).every((id) =>
      userState.state.completed.almanacRecipes.has(id as RecipeId),
    );
  }

  function checkCelebration(sectionRecipeIds: RecipeId[]): void {
    if (isAllComplete()) {
      celebrateCategory();
    } else if (sectionRecipeIds.every((id) => userState.state.completed.almanacRecipes.has(id))) {
      celebrate();
    }
  }

  const SECTION_LIMIT = 50;

  let expandedSections = $state<Record<string, boolean>>({});

  function toggleRecipe(entry: RecipeEntry, sectionRecipeIds: RecipeId[]): void {
    userState.toggleAlmanacRecipe(entry.id);
    const nowCompleted = userState.state.completed.almanacRecipes.has(entry.id);
    showUndoToast(entry.name, nowCompleted, () => {
      userState.toggleAlmanacRecipe(entry.id);
    });
    if (nowCompleted) {
      if (!userState.state.showCompleted) markLeaving(entry.id);
      checkCelebration(sectionRecipeIds);
    }
  }
</script>

{#if spoilerGuard.condition}
  <ConfirmSpoilerDialog
    condition={spoilerGuard.condition}
    bind:open={spoilerGuard.open}
    onCancel={() => {
      spoilerGuard.cancel();
    }}
    onComplete={() => {
      spoilerGuard.complete();
    }}
    onCompleteAndUpdate={() => {
      spoilerGuard.completeAndUpdate();
    }}
  />
{/if}

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
      count={scopedEntries.filter((e) => userState.state.completed.almanacRecipes.has(e.id)).length}
      forceOpen={!!nameFilter || toolbarState.sourceFilterActive}
      name={group.name}
      reportCategory="recipe category"
      reportEntityId={group.id}
      total={scopedEntries.length}
    >
      {@const showAll = expandedSections[group.id] ?? false}
      {@const displayEntries = showAll ? filteredEntries : filteredEntries.slice(0, SECTION_LIMIT)}
      <TrackerRowStack>
        {#each displayEntries as entry (entry.id)}
          {@const completed = userState.state.completed.almanacRecipes.has(entry.id)}
          {@const leaving = recentlyCompleted.has(entry.id)}
          <TrackerRow
            display={rowDisplay(entry, completed, leaving)}
            lookups={{ ...baseSegmentLookups, entityVisibility: entry.visibility }}
            name={entry.name}
            reportCategory="recipe"
            reportEntityId={entry.id}
            sources={entry.sources}
            sprite={entry.iconSprite}
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
        {/each}
      </TrackerRowStack>
      {#if filteredEntries.length === 0}
        <p class="py-4 text-center text-sm text-muted-foreground">
          No items match the current filters
        </p>
      {/if}
      {#if !showAll && filteredEntries.length > SECTION_LIMIT}
        <div class="flex justify-center py-1">
          <Button
            class="h-7 text-sm text-muted-foreground"
            variant="ghost"
            onclick={() => {
              expandedSections[group.id] = true;
            }}
          >
            Show {filteredEntries.length - SECTION_LIMIT} more...
          </Button>
        </div>
      {/if}
    </ExpandableSection>
  {/if}
{/each}

<AllCompleted isAllCompleted={isAllComplete()} />
