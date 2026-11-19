<script lang="ts">
  import { onMount } from "svelte";

  import { trackerData } from "#lib/data/index.js";
  import { getName } from "#lib/data/names.js";
  import { isSourceDoable } from "#lib/engine/availability.js";
  import { projectAlmanac } from "#lib/engine/projections/almanac.js";
  import { isConditionVisible } from "#lib/engine/visibility.js";
  import plural from "#lib/i18n/catalogs/plural.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { localizedHref } from "#lib/utils/localized-href.js";

  import type { LocaleCode } from "#lib/types/locale.js";
  import type { StoreId } from "#lib/types/tracker-data.js";

  let { locale }: { locale: LocaleCode } = $props();
  let mounted = $state(false);
  onMount(() => {
    mounted = true;
  });

  let places = $derived.by(() => {
    // The available places belong to the player's local save, not the prerendered home page.
    if (!mounted) return [];
    const context = userState.progressContext;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Scratch counts for this projection.
    const counts = new Map<StoreId, number>();
    for (const row of projectAlmanac(context).rows) {
      if (
        row.completed ||
        !row.doable ||
        !isConditionVisible(row.item.visibility, context.progressionState)
      ) {
        continue;
      }
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Count each item once per store.
      const stores = new Set<StoreId>();
      for (const source of row.sources) {
        if (
          "storeId" in source &&
          source.storeId &&
          source.type !== "festival" &&
          trackerData.stores[source.storeId] &&
          isSourceDoable(source, context)
        ) {
          stores.add(source.storeId);
        }
      }
      for (const store of stores) counts.set(store, (counts.get(store) ?? 0) + 1);
    }
    return [...counts.entries()]
      .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3);
  });
</script>

{#if places.length > 0}
  <section aria-labelledby="places-heading">
    <h2 id="places-heading">Places to go today</h2>
    {#each places as [id, count] (id)}
      <a href={`${localizedHref("everything")}?group=source#store-${id}`}>
        <span>{getName("stores", id, locale)}</span>
        <small>{plural(count, [`${count} almanac find`, `${count} almanac finds`])}</small>
      </a>
    {/each}
  </section>
{/if}

<style>
  section {
    padding-inline: 0.75rem;
    border-block-start: 2px solid var(--color-ink-hairline);
  }

  h2 {
    padding-block: 0.55rem 0.25rem;
    font-family: var(--font-brand);
    font-size: var(--text-xl);
  }

  a {
    display: flex;
    min-block-size: 44px;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    border-block-end: 1px solid var(--color-ink-hairline);
    color: var(--color-guide-voice);
  }

  small {
    color: var(--color-ink-muted);
    font-family: var(--font-controls);
    font-size: var(--text-sm);
    text-align: end;
  }
</style>
