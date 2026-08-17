<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";

  import ConfirmRedactedDialog from "$lib/components/confirm-redacted-dialog.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import { SOURCE_FILTERS } from "$lib/components/icon/index.js";
  import TrackerRow from "$lib/components/tracker-row.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { trackerData } from "$lib/data/index.js";
  import { isVisible } from "$lib/engine/visibility.js";
  import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { celebrate, celebrateCategory } from "$lib/utils/celebrate.js";
  import { createRedactionGuard } from "$lib/utils/redaction-guard.svelte.js";
  import { buildBaseSegmentLookups } from "$lib/utils/segment-lookups.js";
  import { showUndoToast } from "$lib/utils/undo-toast.js";

  import type { TrackerRowDisplay } from "$lib/components/tracker-row.svelte";
  import type { AcquisitionSource, RecipeId } from "$lib/types/tracker-data.js";
  import type { VisibilityCondition } from "$lib/types/visibility.js";

  const redactGuard = createRedactionGuard();

  let recentlyCompleted = new SvelteSet<RecipeId>();

  function markLeaving(recipeId: RecipeId): void {
    recentlyCompleted.add(recipeId);
    setTimeout(() => recentlyCompleted.delete(recipeId), 1050);
  }

  let redactedStoreIds = $derived(
    new Set(
      Object.entries(trackerData.storeVisibility)
        .filter(([, vis]) => !isVisible(vis, userState.progressionState))
        .map(([id]) => id),
    ),
  );

  // The current recipe condition is added when each tree is built.
  let baseSegmentLookups = $derived(buildBaseSegmentLookups(redactedStoreIds));

  interface RecipeEntry {
    id: RecipeId;
    name: string;
    nameVisible: boolean;
    sources: AcquisitionSource[];
    visibility: VisibilityCondition;
  }

  let recipesByCategory = $derived.by(() => {
    const groups: { entries: RecipeEntry[]; id: string; name: string }[] = [];
    for (const cat of trackerData.almanac) {
      const seen = new SvelteSet<string>();
      const entries: RecipeEntry[] = [];
      for (const [, item] of Object.entries(cat.items)) {
        if (!item.recipeId || seen.has(item.recipeId)) continue;
        seen.add(item.recipeId);
        const recipe = trackerData.recipes[item.recipeId];
        const visibility = recipe.visibility ?? { type: "always" };
        const sources = recipe.sources ?? [];
        entries.push({
          id: item.recipeId,
          name: item.name,
          nameVisible: isVisible(visibility, userState.progressionState),
          sources,
          visibility,
        });
      }
      if (entries.length > 0) {
        entries.sort((a, b) => a.name.localeCompare(b.name));
        groups.push({ entries, id: cat.id, name: cat.name });
      }
    }
    return groups;
  });

  function rowDisplay(entry: RecipeEntry, completed: boolean, leaving: boolean): TrackerRowDisplay {
    if (!entry.nameVisible) return { mode: "redacted" };
    if (completed) return { leaving, mode: "completed" };
    return { mode: "visible" };
  }

  let nameFilter = $derived(toolbarState.searchQuery);

  $effect(() => {
    const allTypes = new SvelteSet<AcquisitionSource["type"]>();
    for (const group of recipesByCategory) {
      for (const entry of group.entries) {
        for (const source of entry.sources) {
          allTypes.add(source.type);
        }
      }
    }
    toolbarState.setRecipeSourceFilters(
      SOURCE_FILTERS.filter((f) => f.types.some((t) => allTypes.has(t))),
    );
    return () => {
      toolbarState.setRecipeSourceFilters([]);
      toolbarState.clearSourceFilter();
    };
  });

  let activeSourceTypes = $derived.by(() => {
    if (!toolbarState.sourceFilterActive) return null;
    const types = new SvelteSet<AcquisitionSource["type"]>();
    for (const filter of toolbarState.recipeSourceFilters) {
      if (toolbarState.activeSourceLabels.has(filter.label)) {
        for (const t of filter.types) types.add(t);
      }
    }
    return types;
  });

  function matchesFilter(entry: RecipeEntry): boolean {
    if (nameFilter && !entry.name.toLowerCase().includes(nameFilter.toLowerCase())) return false;
    if (activeSourceTypes) {
      return entry.sources.some((s) => activeSourceTypes.has(s.type));
    }
    return true;
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

{#if redactGuard.condition}
  <ConfirmRedactedDialog
    condition={redactGuard.condition}
    bind:open={redactGuard.open}
    onCancel={() => {
      redactGuard.cancel();
    }}
    onComplete={() => {
      redactGuard.complete();
    }}
    onCompleteAndUpdate={() => {
      redactGuard.completeAndUpdate();
    }}
  />
{/if}

{#each recipesByCategory as group (group.id)}
  {@const scopedEntries = group.entries.filter(matchesFilter)}
  {@const filteredEntries = scopedEntries.filter((e) => {
    if (!userState.state.showCompleted && userState.state.completed.almanacRecipes.has(e.id)) {
      return recentlyCompleted.has(e.id);
    }
    return true;
  })}
  {#if filteredEntries.length > 0}
    <ExpandableSection
      count={scopedEntries.filter((e) => userState.state.completed.almanacRecipes.has(e.id)).length}
      forceOpen={!!nameFilter || toolbarState.sourceFilterActive}
      name={group.name}
      total={scopedEntries.length}
    >
      {@const showAll = expandedSections[group.id] ?? false}
      {@const displayEntries = showAll ? filteredEntries : filteredEntries.slice(0, SECTION_LIMIT)}
      {#each displayEntries as entry (entry.id)}
        {@const completed = userState.state.completed.almanacRecipes.has(entry.id)}
        {@const leaving = recentlyCompleted.has(entry.id)}
        <TrackerRow
          display={rowDisplay(entry, completed, leaving)}
          lookups={{ ...baseSegmentLookups, entityVisibility: entry.visibility }}
          name={entry.name}
          sources={entry.sources}
          onToggle={() => {
            if (entry.nameVisible || completed) {
              toggleRecipe(
                entry,
                group.entries.map((candidate) => candidate.id),
              );
            } else {
              redactGuard.guard(entry.visibility, () => {
                toggleRecipe(
                  entry,
                  group.entries.map((candidate) => candidate.id),
                );
              });
            }
          }}
        />
      {/each}
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

{#if isAllComplete() && !userState.state.showCompleted}
  <p class="py-8 text-center text-base text-muted-foreground">
    All done! Toggle "Show completed" to review.
  </p>
{/if}
