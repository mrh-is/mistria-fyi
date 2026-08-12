<script lang="ts">
  import {
    Archive,
    ChevronRight,
    CircleCheck,
    Coins,
    Crown,
    FishingHook,
    Flame,
    HardHat,
    Heart,
    Landmark,
    Mail,
    PartyPopper,
    Pickaxe,
    Scroll,
    ShoppingCart,
    Sparkles,
  } from "@lucide/svelte";
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

  import type { Component } from "svelte";

  import type { SourceFilter } from "$lib/stores/toolbar-state.svelte.js";
  import type { RecipeId, RecipeSource } from "$lib/types/tracker-data.js";
  import type { RecipeSourceLookups } from "$lib/utils/format.js";

  const SOURCE_FILTERS: SourceFilter[] = [
    { icon: Archive, label: "Chest", types: ["beach_cave_chest"] },
    { icon: HardHat, label: "Construction", types: ["upgrade"] },
    { icon: CircleCheck, label: "Default", types: ["default"] },
    { icon: Flame, label: "Dragon Forge", types: ["dragon_forge"] },
    { icon: PartyPopper, label: "Festival", types: ["festival"] },
    { icon: FishingHook, label: "Fishing", types: ["treasure_chest"] },
    { icon: Mail, label: "Letter", types: ["letter"] },
    { icon: Pickaxe, label: "Mines", types: ["mines_chest", "mines_dig_site"] },
    { icon: Landmark, label: "Museum", types: ["museum_donation"] },
    { icon: Coins, label: "Offering", types: ["chicken_statue", "wishing_well"] },
    { icon: Sparkles, label: "Perk", types: ["perk"] },
    { icon: Scroll, label: "Quest", types: ["quest"] },
    { icon: Heart, label: "Relationship", types: ["relationship"] },
    { icon: ShoppingCart, label: "Store", types: ["store", "store_with_perk", "scroll_bundle"] },
    { icon: Crown, label: "Town rank", types: ["renown"] },
  ];

  let recentlyCompleted = new SvelteSet<RecipeId>();

  function markLeaving(recipeId: RecipeId): void {
    recentlyCompleted.add(recipeId);
    setTimeout(() => recentlyCompleted.delete(recipeId), 1050);
  }

  const SOURCE_ICON: Record<RecipeSource["type"], Component> = {
    beach_cave_chest: Archive,
    chicken_statue: Coins,
    default: CircleCheck,
    dragon_forge: Flame,
    festival: PartyPopper,
    letter: Mail,
    mines_chest: Pickaxe,
    mines_dig_site: Pickaxe,
    museum_donation: Landmark,
    perk: Sparkles,
    quest: Scroll,
    relationship: Heart,
    renown: Crown,
    scroll_bundle: ShoppingCart,
    store: ShoppingCart,
    store_with_perk: ShoppingCart,
    treasure_chest: FishingHook,
    upgrade: HardHat,
    wishing_well: Coins,
  };

  let sourceLookups: RecipeSourceLookups = $derived({
    biomes: trackerData.mines.biomes,
    festivals: trackerData.festivals,
    itemNames: Object.fromEntries(
      Object.entries(trackerData.items).map(([id, item]) => [id, item.name]),
    ),
    perks: trackerData.perks,
    perkTierLevels: trackerData.perkTierLevels,
    questNames: Object.fromEntries(
      Object.values(trackerData.quests).flatMap((group) =>
        Object.entries(group).map(([id, q]) => [id, q.name]),
      ),
    ),
    skillNames: Object.fromEntries(
      Object.entries(trackerData.skills).map(([id, name]) => [id, name]),
    ),
    stores: trackerData.stores,
    treasureChestTiers: trackerData.treasureChestTiers,
  });

  interface RecipeEntry {
    id: RecipeId;
    name: string;
    sourceLabels: string[];
    sources: RecipeSource[];
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
        const sourceLabels = recipe.sources.map((s) => recipeSourceLabel(s, sourceLookups));
        entries.push({
          id: item.recipeId,
          name: item.name,
          sourceLabels,
          sources: recipe.sources,
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

  $effect(() => {
    const allTypes = new SvelteSet<RecipeSource["type"]>();
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
    const types = new SvelteSet<RecipeSource["type"]>();
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
  let expandedRecipes = $state<Record<string, boolean>>({});
</script>

{#each recipesByCategory as group (group.id)}
  {@const filteredEntries = group.entries.filter((e) => {
    if (!matchesFilter(e)) return false;
    if (!userState.state.showCompleted && userState.state.completed.almanacRecipes.has(e.id)) {
      return recentlyCompleted.has(e.id);
    }
    return true;
  })}
  {#if filteredEntries.length > 0}
    <ExpandableSection
      count={filteredEntries.filter((e) => userState.state.completed.almanacRecipes.has(e.id))
        .length}
      forceOpen={!!nameFilter || toolbarState.sourceFilterActive}
      name={group.name}
      total={filteredEntries.length}
    >
      {@const showAll = expandedSections[group.id] ?? false}
      {@const displayEntries = showAll ? filteredEntries : filteredEntries.slice(0, SECTION_LIMIT)}
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
            <span class="min-w-0 flex-1 text-base">{entry.name}</span>
            {#if entry.sourceLabels.length > 0}
              {@const uniqueIcons = [...new Set(entry.sources.map((s) => s.type))].map(
                (t) => SOURCE_ICON[t],
              )}
              <button
                class="group flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-muted"
                type="button"
                aria-expanded={expanded}
                aria-label="{entry.name} sources"
                onclick={() => {
                  expandedRecipes[entry.id] = !expanded;
                }}
              >
                {#each uniqueIcons as Icon (Icon)}
                  <Icon class="size-3.5 shrink-0" />
                {/each}
                <ChevronRight
                  class="size-3 shrink-0 opacity-40 transition-transform {expanded
                    ? 'rotate-90'
                    : ''}"
                />
              </button>
            {/if}
          </div>
          {#if expanded && entry.sourceLabels.length > 0}
            <div class="flex flex-col gap-1 py-1 pr-2 pl-8" transition:slide={{ duration: 150 }}>
              {#each entry.sources as source, i (i)}
                {@const Icon = SOURCE_ICON[source.type]}
                <div class="flex items-center gap-2 text-sm">
                  <Icon class="size-3.5 shrink-0 text-muted-foreground" />
                  <span class="text-muted-foreground">{entry.sourceLabels[i]}</span>
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
