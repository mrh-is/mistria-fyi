<script lang="ts">
  import { onMount } from "svelte";

  import { buildSourceChecklist } from "#lib/controllers/source-checklist.js";
  import { getName } from "#lib/data/names.js";
  import { ledgerShelf, sourceLedgerPlacement } from "#lib/presentation/ledger.js";
  import { projectSourceGroups } from "#lib/presentation/source-groups.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { formatNumber } from "#lib/utils/format.js";
  import { localizedHref } from "#lib/utils/localized-href.js";

  import type { LocaleCode } from "#lib/types/locale.js";

  let { locale }: { locale: LocaleCode } = $props();
  let mounted = $state(false);
  onMount(() => {
    mounted = true;
  });

  let places = $derived.by(() => {
    // The available places belong to the player's local save, not the prerendered home page.
    if (!mounted) return [];
    const context = userState.progressContext;
    return projectSourceGroups(buildSourceChecklist(context, locale), context)
      .flatMap(({ id, rows, source, spoilered }) => {
        if (!source || !("storeId" in source) || source.type === "festival" || spoilered) return [];
        const count = rows.filter(
          (row) => ledgerShelf(sourceLedgerPlacement(row, context), () => true) === "todo",
        ).length;
        return count > 0 ? [{ count, id, storeId: source.storeId }] : [];
      })
      .toSorted((a, b) => b.count - a.count || a.id.localeCompare(b.id))
      .slice(0, 3);
  });
</script>

{#if places.length > 0}
  <section aria-labelledby="places-heading">
    <h2 id="places-heading">Places to go today</h2>
    {#each places as { id, storeId, count } (id)}
      <a href={`${localizedHref("everything")}?group=source#${id}`}>
        <span>{getName("stores", storeId, locale)}</span>
        <small>{`${formatNumber(count, locale)} to do`}</small>
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
