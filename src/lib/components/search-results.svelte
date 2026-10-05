<script lang="ts">
  import { untrack } from "svelte";
  import { toast } from "svelte-sonner";

  import TrackerRowStack from "#lib/components/tracker-row-stack.svelte";
  import TrackerRow from "#lib/components/tracker-row.svelte";
  import VillagerSearchResult from "#lib/components/villager-search-result.svelte";
  import { categoryNameForKey } from "#lib/data/categories.js";
  import { trackerData } from "#lib/data/index.js";
  import { hasNames, loadNames, LOCALIZED_CATEGORIES } from "#lib/data/names.js";
  import { recipeDisplayNames } from "#lib/engine/quest-rewards.js";
  import { searchItems } from "#lib/engine/search.js";
  import { isVisible } from "#lib/engine/visibility.js";
  import * as m from "#lib/paraglide/messages.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { recordEntries } from "#lib/utils.js";
  import { buildBaseSegmentLookups } from "#lib/utils/segment-lookups.js";
  import { showUndoToast } from "#lib/utils/undo-toast.js";

  import type { TrackerRowDisplay } from "#lib/components/tracker-row.svelte";
  import type { SearchResult } from "#lib/engine/search.js";
  import type { Source } from "#lib/types/acquisition.js";
  import type { LocaleCode } from "#lib/types/locale.js";
  import type {
    AnimalId,
    AnimalVariantId,
    CosmeticId,
    ItemId,
    PetCosmeticSetId,
    PetSkinId,
    QuestId,
    RecipeId,
    VillagerId,
  } from "#lib/types/tracker-data.js";

  let { locale, query }: { locale: LocaleCode; query: string } = $props();

  // Search spans every category, so it needs every category's chunk for the active locale, plus
  // English because `searchItems` also matches English terms, rather than the per-route subset a
  // category page awaits in `load()`. The fetch happens here, on first search-open, not at page
  // load; `loadNames` caches per chunk for the session, so re-opening search or retyping never
  // re-fetches. Until the chunks land, the `$derived` name lookups below must not run, since
  // they'd throw on an unloaded chunk. Seeded synchronously (hence `untrack`: the initial prop
  // value is all that's wanted) so an already-cached locale renders results on the first paint
  // with no loading flash.
  let namesLocale = $state<LocaleCode | undefined>(
    untrack(() => (hasSearchNames(locale) ? locale : undefined)),
  );
  let namesError = $state(false);
  let retryToken = $state(0);
  let namesReady = $derived(namesLocale === locale);

  function hasSearchNames(searchLocale: LocaleCode): boolean {
    return hasNames(searchLocale, LOCALIZED_CATEGORIES) && hasNames("en", LOCALIZED_CATEGORIES);
  }

  function retryNames(): void {
    retryToken += 1;
  }

  $effect(() => {
    const targetLocale = locale;
    // Referenced only to make the effect re-run on retry; the value itself is unused.
    const _retryToken = retryToken;

    namesError = false;
    if (hasSearchNames(targetLocale)) {
      namesLocale = targetLocale;
      return;
    }
    let cancelled = false;
    void Promise.all([
      loadNames(targetLocale, LOCALIZED_CATEGORIES),
      loadNames("en", LOCALIZED_CATEGORIES),
    ]).then(
      () => {
        if (!cancelled) namesLocale = targetLocale;
      },
      () => {
        if (!cancelled) namesError = true;
      },
    );
    return () => {
      cancelled = true;
    };
  });

  let results = $derived(
    searchItems(
      query,
      userState.state.completed,
      userState.state.worldState,
      userState.progressionState,
      locale,
    ),
  );

  let redactedStoreIds = $derived(
    new Set(
      recordEntries(trackerData.stores)
        .filter(
          ([, { visibility }]) => visibility && !isVisible(visibility, userState.progressionState),
        )
        .map(([id]) => id),
    ),
  );

  let baseLookups = $derived(buildBaseSegmentLookups(redactedStoreIds, locale));

  function getSources(result: SearchResult): Source[] {
    if (result.category === "almanac" || result.category === "museum") {
      return trackerData.items[result.id as ItemId].sources;
    }
    if (result.category === "cosmetics") {
      return trackerData.cosmetics[result.id as CosmeticId].sources;
    }
    if (result.category === "recipes") {
      return trackerData.recipes[result.id as RecipeId].sources;
    }
    return [];
  }

  function handleQuestToggle(result: SearchResult): void {
    const questId = result.id as QuestId;
    const completion = userState.completeQuestWithRecipes(questId);
    const { newlyAdded } = completion;
    const newState = userState.state.completed.questStates[questId] ?? "none";

    let message: string;
    if (newState === "obtained") {
      message = m.quest_marked_obtained({ name: result.name });
    } else if (newState === "completed") {
      if (newlyAdded.length === 1) {
        const names = recipeDisplayNames(newlyAdded, locale);
        message = m.quest_marked_completed_with_recipe({ name: result.name, recipe: names[0] });
      } else if (newlyAdded.length > 1) {
        message = m.quest_marked_completed_with_recipes({
          count: newlyAdded.length,
          name: result.name,
        });
      } else {
        message = m.quest_marked_completed({ name: result.name });
      }
    } else {
      message = m.quest_reset({ name: result.name });
    }

    toast(message, {
      cancel: {
        label: m.action_undo(),
        onClick: () => {
          userState.undoQuestWithRecipes(questId, completion);
        },
      },
      duration: 30_000,
    });
  }

  function rowDisplay(result: SearchResult): TrackerRowDisplay {
    if (result.completed) return { mode: "completed" };
    return { dimmed: !result.available, mode: "visible" };
  }

  function toggleResult(result: SearchResult): void {
    switch (result.category) {
      case "almanac":
        userState.toggleAlmanacItem(result.id as never);
        break;
      case "animals": {
        if (result.id.startsWith("pet-cosmetic:")) {
          const petCosmeticId = result.id.slice("pet-cosmetic:".length);
          userState.togglePetCosmetic(petCosmeticId as PetCosmeticSetId);
        } else if (result.id.startsWith("pet-skin:")) {
          const petSkinId = result.id.slice("pet-skin:".length);
          userState.togglePetSkin(petSkinId as PetSkinId);
        } else {
          const [animalId, subId] = result.id.split(":");
          if (result.fullName) {
            userState.toggleAnimalCosmetic(animalId as AnimalId, subId as CosmeticId);
          } else {
            userState.toggleAnimalVariant(animalId as AnimalId, subId as AnimalVariantId);
          }
        }
        break;
      }
      case "cosmetics":
        userState.toggleCosmetic(result.id as never);
        break;
      case "museum":
        userState.toggleMuseumItem(result.id as ItemId);
        break;
      case "quests":
        // Quest results route through handleQuestToggle before reaching this function.
        break;
      case "recipes":
        userState.toggleAlmanacRecipe(result.id as RecipeId);
        break;
      case "villagers":
        // Villager results render as links to their records, never as toggles.
        break;
    }
  }
</script>

{#if namesError}
  <div class="search-results__error" role="alert">
    <p>{m.search_error()}</p>
    <button type="button" onclick={retryNames}>{m.action_retry()}</button>
  </div>
{:else if !namesReady}
  <p class="search-results__loading" role="status" aria-live="polite">{m.search_loading()}</p>
{:else}
  <div class="search-results" data-tracker-list>
    <p class="search-results__count">
      {m.search_results_count({ count: results.length })}
    </p>
    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {results.length === 0
        ? m.search_no_results()
        : m.search_results_count({ count: results.length })}
    </p>

    {#each results as result (result.category + result.id)}
      {@const label = result.fullName ?? result.name}
      <div class="search-result">
        <div class="min-w-0 flex-1">
          <TrackerRowStack>
            {#if result.category === "villagers"}
              <VillagerSearchResult
                completed={result.completed}
                id={result.id as VillagerId}
                name={label}
              />
            {:else}
              <TrackerRow
                display={rowDisplay(result)}
                lookups={baseLookups}
                name={result.detail ? `${label} ${result.detail}` : label}
                reportCategory={categoryNameForKey(result.category, locale)}
                reportEntityId={result.id}
                sources={getSources(result)}
                onToggle={() => {
                  if (result.category === "quests") {
                    handleQuestToggle(result);
                  } else {
                    toggleResult(result);
                    showUndoToast(result.name, !result.completed, () => {
                      toggleResult(result);
                    });
                  }
                }}
              />
            {/if}
          </TrackerRowStack>
        </div>
        <span
          class="search-result__category"
          style="--result-category: var(--cat-{result.category}, var(--ink-muted))"
        >
          {categoryNameForKey(result.category, locale)}
        </span>
      </div>
    {/each}

    {#if results.length === 0}
      <p class="search-results__empty">{m.search_no_results()}</p>
    {/if}
  </div>
{/if}

<style>
  .search-results {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .search-results__count {
    margin-bottom: 3px;
    color: var(--ink-muted);
    font-family: var(--font-data);
    font-size: var(--text-2xs);
  }

  .search-result {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .search-result > div {
    min-width: 0;
    flex: 1;
  }

  .search-result__category {
    min-width: 76px;
    flex-shrink: 0;
    padding: 4px 11px 4px 9px;
    color: var(--ink);
    border-left: 2px solid var(--result-category);
    background: color-mix(in srgb, var(--result-category) 9%, var(--paper));
    clip-path: polygon(0 0, 100% 0, calc(100% - 5px) 50%, 100% 100%, 0 100%);
    font-family: var(--font-annotation);
    font-size: var(--text-3xs);
    text-align: center;
  }

  .search-results__loading,
  .search-results__empty,
  .search-results__error {
    padding: 32px 0;
    color: var(--ink-muted);
    font-family: var(--font-body);
    font-size: var(--text-base);
    text-align: center;
  }

  .search-results__error {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .search-results__error button {
    padding: 6px 16px;
    color: var(--ink);
    border: 1px solid var(--ink-muted);
    border-radius: var(--radius-lg);
    background: transparent;
    font-family: var(--font-body);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .search-results__error button:hover {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }

  @media (max-width: 380px) {
    .search-result__category {
      min-width: 62px;
      max-width: 72px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
</style>
