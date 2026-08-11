<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { slide } from "svelte/transition";

  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { trackerData } from "$lib/data/index.js";
  import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { celebrate, celebrateCategory } from "$lib/utils/celebrate.js";
  import { recipeSourceLabel } from "$lib/utils/format.js";
  import { showUndoToast } from "$lib/utils/undo-toast.js";

  import type { RecipeId } from "$lib/types/tracker-data.js";

  let recentlyCompleted = new SvelteSet<RecipeId>();

  function markLeaving(recipeId: RecipeId): void {
    recentlyCompleted.add(recipeId);
    setTimeout(() => recentlyCompleted.delete(recipeId), 1050);
  }

  let sourceLookups = $derived({
    biomeNames: Object.fromEntries(trackerData.mines.biomes.map((b) => [b.id, b.name])),
    itemNames: Object.fromEntries(
      Object.entries(trackerData.items).map(([id, item]) => [id, item.name]),
    ),
    questNames: Object.fromEntries(
      Object.values(trackerData.quests).flatMap((group) =>
        Object.entries(group).map(([id, q]) => [id, q.name]),
      ),
    ),
  });

  interface RecipeEntry {
    id: RecipeId;
    name: string;
    sourceLabels: string[];
  }

  let recipesByCategory = $derived.by(() => {
    const groups: { entries: RecipeEntry[]; id: string; name: string }[] = [];
    for (const cat of trackerData.almanac) {
      const seen = new Set<string>();
      const entries: RecipeEntry[] = [];
      for (const [, item] of Object.entries(cat.items)) {
        if (!item.recipeId || seen.has(item.recipeId)) continue;
        seen.add(item.recipeId);
        const recipe = trackerData.recipes[item.recipeId];
        if (!recipe) continue;
        const sourceLabels = recipe.sources
          .map((s) => recipeSourceLabel(s, sourceLookups))
          .filter(Boolean);
        entries.push({
          id: item.recipeId as RecipeId,
          name: item.name,
          sourceLabels,
        });
      }
      if (entries.length > 0) {
        entries.sort((a, b) => a.name.localeCompare(b.name));
        groups.push({ entries, id: cat.id, name: cat.name });
      }
    }
    return groups;
  });

  let nameFilter = $derived(toolbarState.searchQuery);

  function matchesFilter(name: string): boolean {
    if (!nameFilter) return true;
    return name.toLowerCase().includes(nameFilter.toLowerCase());
  }

  function isAllComplete(): boolean {
    return Object.keys(trackerData.recipes).every((id) =>
      userState.state.completed.almanacRecipes.has(id as RecipeId),
    );
  }

  function checkCelebration(sectionRecipeIds: RecipeId[]): void {
    if (isAllComplete()) {
      celebrateCategory();
    } else if (
      sectionRecipeIds.every((id) => userState.state.completed.almanacRecipes.has(id))
    ) {
      celebrate();
    }
  }

  const SECTION_LIMIT = 50;

  let expandedSections = $state<Record<string, boolean>>({});
  let expandedRecipes = $state<Record<string, boolean>>({});
</script>

{#each recipesByCategory as group (group.id)}
  {@const filteredEntries = group.entries.filter((e) => {
    if (!matchesFilter(e.name)) return false;
    if (!userState.state.showCompleted && userState.state.completed.almanacRecipes.has(e.id)) {
      return recentlyCompleted.has(e.id);
    }
    return true;
  })}
  {#if filteredEntries.length > 0}
    <ExpandableSection
      count={filteredEntries.filter((e) => userState.state.completed.almanacRecipes.has(e.id))
        .length}
      forceOpen={!!nameFilter}
      name={group.name}
      total={filteredEntries.length}
    >
      {@const showAll = expandedSections[group.id] ?? false}
      {@const displayEntries = showAll
        ? filteredEntries
        : filteredEntries.slice(0, SECTION_LIMIT)}
      {#each displayEntries as entry (entry.id)}
        {@const completed = userState.state.completed.almanacRecipes.has(entry.id)}
        {@const leaving = recentlyCompleted.has(entry.id)}
        {@const expanded = expandedRecipes[entry.id] ?? false}
        <div>
          <div
            class="flex items-center gap-0 rounded-md pr-2 transition-opacity duration-200 {completed ||
            leaving
              ? 'line-through opacity-40'
              : ''}"
          >
            <button
              class="flex min-h-11 min-w-11 shrink-0 items-center justify-center"
              type="button"
              aria-label={completed ? `Uncheck ${entry.name}` : `Check ${entry.name}`}
              onclick={() => {
                userState.toggleAlmanacRecipe(entry.id);
                const nowCompleted = userState.state.completed.almanacRecipes.has(entry.id);
                showUndoToast(entry.name, nowCompleted, () => {
                  userState.toggleAlmanacRecipe(entry.id);
                });
                if (nowCompleted) {
                  if (!userState.state.showCompleted) markLeaving(entry.id);
                  checkCelebration(group.entries.map((e) => e.id));
                }
              }}
            >
              <Checkbox checked={completed} tabindex={-1} />
            </button>
            {#if entry.sourceLabels.length > 0}
              <button
                class="group inline-flex min-w-0 flex-1 items-start gap-0.5 text-left"
                type="button"
                aria-expanded={expanded}
                aria-label="{entry.name} details"
                onclick={() => {
                  expandedRecipes[entry.id] = !expanded;
                }}
              >
                <span class="text-base group-hover:underline">{entry.name}</span>
                <ChevronRight
                  class="mt-1.5 size-3 shrink-0 text-muted-foreground opacity-40 transition-all group-hover:opacity-60 {expanded
                    ? 'rotate-90'
                    : ''}"
                />
              </button>
            {:else}
              <span class="text-base">{entry.name}</span>
            {/if}
          </div>
          {#if expanded && entry.sourceLabels.length > 0}
            <div class="flex flex-col gap-1 py-1 pr-2 pl-8" transition:slide={{ duration: 150 }}>
              {#each entry.sourceLabels as label}
                <div class="flex items-center gap-2 text-sm">
                  <span class="size-1.5 shrink-0 rounded-full bg-green-500"></span>
                  <span class="text-muted-foreground">{label}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
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
