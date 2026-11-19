import { tick } from "svelte";

import { createLedgerSnapshot } from "#lib/controllers/ledger-snapshot.svelte.js";
import { registerPageSearch } from "#lib/controllers/page-search.svelte.js";
import { filteredCounts } from "#lib/engine/shelves.js";
import { ledgerShelf } from "#lib/presentation/ledger.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";

import type { ShelfRow } from "#lib/engine/shelves.js";
import type { LedgerPlacement } from "#lib/presentation/ledger.js";
import type { LocaleCode } from "#lib/types/locale.js";

interface PageRow extends LedgerPlacement {
  key: string;
  obtainable: boolean;
}

export function createLedgerPage<Section extends { rows: readonly PageRow[]; spoilered?: boolean }>(
  readLocale: () => LocaleCode,
  build: () => readonly Section[],
  matches: (row: Section["rows"][number]) => boolean,
  { excludeCoveredFromFilterCounts = false }: { excludeCoveredFromFilterCounts?: boolean } = {},
): {
  snapshot: ReturnType<typeof createLedgerSnapshot<Section>>;
  visible: (row: Section["rows"][number]) => boolean;
} {
  const snapshot = createLedgerSnapshot(readLocale, build);

  function visible(row: Section["rows"][number]): boolean {
    return (
      (row.obtainable || toolbarState.showUnobtainable) &&
      (!toolbarState.searchQuery ||
        ((!row.spoilered || userState.state.showSpoilers) && matches(row)))
    );
  }

  registerPageSearch(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Scratch counts for this search.
    const facts = new Map<string, ShelfRow>();
    const showSpoilers = userState.state.showSpoilers;
    for (const section of snapshot.value) {
      if (section.spoilered && !showSpoilers) continue;
      for (const row of section.rows) {
        if (!visible(row) || (excludeCoveredFromFilterCounts && row.spoilered && !showSpoilers)) {
          continue;
        }
        const shown = toolbarState.matchesSourceFilters(row.sources);
        const doable = shown && ledgerShelf(row, toolbarState.showsSource) === "todo";
        const previous = facts.get(row.key);
        facts.set(row.key, {
          completed: row.completed,
          doable: doable || previous?.doable === true,
          doableAnywhere: row.doable || previous?.doableAnywhere === true,
          shown: shown || previous?.shown === true,
          sourceDisclosure: { hiddenCount: row.hiddenCount, visibleSources: row.visibleSources },
        });
      }
    }
    const rows = [...facts.values()];
    return { filtered: filteredCounts(rows), visible: rows.filter(({ shown }) => shown).length };
  });

  return { snapshot, visible };
}

/** Align after the target's containing groups and shelves have opened. */
export function useLedgerArrival(readTarget: () => string): void {
  $effect(() => {
    const target = readTarget();
    if (!target) return;
    let cancelled = false;
    async function align(): Promise<void> {
      await tick();
      if (cancelled) return;
      const section = document.getElementById(target);
      section?.scrollIntoView({ block: "start" });
      const heading = section?.matches("[data-ledger-index-heading]")
        ? section
        : section?.querySelector<HTMLElement>("h3");
      heading?.focus({ preventScroll: true });
    }
    void align();
    return () => {
      cancelled = true;
    };
  });
}
