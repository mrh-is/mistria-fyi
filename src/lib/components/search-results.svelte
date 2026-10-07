<script lang="ts">
  import { untrack } from "svelte";

  import TrackerRow from "#lib/components/tracker-row.svelte";
  import VillagerSearchResult from "#lib/components/villager-search-result.svelte";
  import { categoryNameForKey } from "#lib/data/categories.js";
  import { trackerData } from "#lib/data/index.js";
  import { hasNames, loadNames, NAME_CHUNKS } from "#lib/data/names.js";
  import { showQuestToast, showUndoToast } from "#lib/effects/undo-toast.js";
  import { searchAllCategories } from "#lib/engine/search.js";
  import * as m from "#lib/paraglide/messages.js";
  import { buildBaseSegmentLookups } from "#lib/sources/segment-lookups.js";
  import { computeSpoileredStoreIds } from "#lib/sources/spoilered-stores.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { trackerRowDisplay } from "#lib/utils/row-display.js";

  import type { SearchCategoryKey } from "#lib/data/categories.js";
  import type { SearchResult } from "#lib/engine/search.js";
  import type { ReportCategory } from "#lib/feedback/types.js";
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
  // English because `searchAllCategories` also matches English terms, rather than the per-route subset a
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
    return hasNames(searchLocale, NAME_CHUNKS) && hasNames("en", NAME_CHUNKS);
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
    void (async () => {
      try {
        await Promise.all([loadNames(targetLocale, NAME_CHUNKS), loadNames("en", NAME_CHUNKS)]);
      } catch {
        if (!cancelled) namesError = true;
        return;
      }
      if (!cancelled) namesLocale = targetLocale;
    })();
    return () => {
      cancelled = true;
    };
  });

  let results = $derived(
    searchAllCategories(
      query,
      userState.state.completed,
      userState.state.worldState,
      userState.progressionState,
      locale,
    ),
  );

  let spoileredStoreIds = $derived(computeSpoileredStoreIds(userState.progressionState));

  let baseLookups = $derived(buildBaseSegmentLookups(spoileredStoreIds, locale));

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
    const newState = userState.state.completed.questStates[questId] ?? "none";
    showQuestToast(result.name, newState, completion.newlyAdded, locale, () => {
      userState.undoQuestWithRecipes(questId, completion);
    });
  }

  function toggleResult(result: SearchResult): void {
    switch (result.category) {
      case "almanac":
        userState.toggleAlmanacItem(result.id as never);
        break;
      case "animals":
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

  /** Search results report under the stable key of their row's own category, not a localized name. */
  const SEARCH_REPORT_CATEGORY = {
    almanac: "almanac-item",
    animals: "animal",
    cosmetics: "cosmetic",
    museum: "museum-item",
    quests: "quest",
    recipes: "recipe",
    villagers: "villager",
  } as const satisfies Record<SearchCategoryKey, ReportCategory>;
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
          {#if result.category === "villagers"}
            <VillagerSearchResult
              completed={result.completed}
              id={result.id as VillagerId}
              name={label}
            />
          {:else}
            <TrackerRow
              display={trackerRowDisplay({
                completed: result.completed,
                dimmed: !result.available,
              })}
              segmentLookups={baseLookups}
              name={result.detail ? `${label} ${result.detail}` : label}
              reportCategory={SEARCH_REPORT_CATEGORY[result.category]}
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
        </div>
        <span
          class="search-result__category"
          style="--result-category-color: var(--color-category-{result.category}, var(--color-ink-muted))"
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
    color: var(--color-ink-muted);
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
    color: var(--color-ink);
    border-left: 2px solid var(--result-category-color);
    background: color-mix(in srgb, var(--result-category-color) 9%, var(--color-paper));
    clip-path: polygon(0 0, 100% 0, calc(100% - 5px) 50%, 100% 100%, 0 100%);
    font-family: var(--font-annotation);
    font-size: var(--text-3xs);
    text-align: center;
  }

  .search-results__loading,
  .search-results__empty,
  .search-results__error {
    padding: 32px 0;
    color: var(--color-ink-muted);
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
    color: var(--color-ink);
    border: 1px solid var(--color-ink-muted);
    border-radius: var(--radius-lg);
    background: transparent;
    font-family: var(--font-body);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .search-results__error button:hover {
    background: color-mix(in srgb, var(--color-ink) 6%, transparent);
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
