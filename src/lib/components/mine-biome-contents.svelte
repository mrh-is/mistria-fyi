<script lang="ts">
  import LedgerRow from "#lib/components/ledger/ledger-row.svelte";
  import SpoilerGuardDialog from "#lib/components/spoiler-guard-dialog.svelte";
  import { createRowCheckOff } from "#lib/controllers/check-off.svelte.js";
  import { captureUndoFocus, showUndoToast } from "#lib/effects/undo-toast.js";
  import { isDoableToday } from "#lib/engine/availability.js";
  import { isConditionVisible } from "#lib/engine/visibility.js";
  import { ledgerPlacement, ledgerShelf } from "#lib/presentation/ledger.js";
  import { isBiomeSource } from "#lib/presentation/mine-biome-sources.js";
  import { buildBaseSegmentLookups } from "#lib/sources/segment-lookups.js";
  import { computeSpoileredStoreIds } from "#lib/sources/spoilered-stores.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";

  import type { SourceChecklistRow } from "#lib/controllers/source-checklist.js";
  import type { LocaleCode } from "#lib/types/locale.js";
  import type { MinesBiome } from "#lib/types/tracker-data.js";

  let {
    biome,
    locale,
    rows,
  }: {
    biome: MinesBiome;
    locale: LocaleCode;
    rows: SourceChecklistRow[];
  } = $props();

  const checkOff = createRowCheckOff<string>({ animateLeaving: false });
  let lookups = $derived(
    buildBaseSegmentLookups(computeSpoileredStoreIds(userState.progressionState), locale),
  );
  let entries = $derived(
    rows.map((row) => {
      const sources = row.sources.filter((source) => isBiomeSource(source, biome));
      const context = userState.progressContext;
      return {
        placement: {
          ...ledgerPlacement(
            sources,
            context,
            context.progressionState,
            {
              completed: row.completed,
              doable: isDoableToday({ sources, visibility: row.visibility }, context),
              spoilered: !isConditionVisible(row.visibility, context.progressionState),
            },
            row.sources,
          ),
          key: row.key,
        },
        row,
      };
    }),
  );

  function toggle(row: SourceChecklistRow, covered: boolean): void {
    const focus = captureUndoFocus();
    checkOff.run({
      category: row.category,
      covered,
      finish: (undo) => {
        const completed = !row.completed;
        showUndoToast(row.name, completed, undo, covered, focus);
        return completed;
      },
      hold: () => undefined,
      id: row.key,
      name: row.name,
      needsGuard: !row.completed && !isConditionVisible(row.visibility, userState.progressionState),
      toggle: row.toggle,
      visibility: row.visibility,
    });
  }
</script>

<SpoilerGuardDialog guard={checkOff.guard} />
<ul class="biome-rows">
  {#each entries as { row, placement } (row.key)}
    <LedgerRow
      category="mines"
      columns={[]}
      completed={row.completed}
      discovery={false}
      fact={row.fact}
      highlighted={false}
      id={row.id}
      {lookups}
      name={row.name}
      onToggle={(covered) => toggle(row, covered)}
      {placement}
      reportCategory={row.reportCategory}
      shelf={ledgerShelf(placement, toolbarState.showsSource)}
      sprite={row.sprite}
      variant={row.subtitle}
    />
  {/each}
</ul>

<style>
  .biome-rows {
    min-inline-size: 0;
    padding: 0;
    list-style: none;
  }
</style>
