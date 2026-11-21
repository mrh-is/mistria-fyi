import { tick } from "svelte";

import {
  cancelOnReaderScroll,
  ledgerJump,
  nextFrame,
  useLedgerScroll,
} from "#lib/controllers/ledger-scroll.svelte.js";
import { createLedgerSnapshot } from "#lib/controllers/ledger-snapshot.svelte.js";
import { registerPageSearch } from "#lib/controllers/page-search.svelte.js";
import { filteredCounts } from "#lib/engine/shelves.js";
import { ledgerShelf } from "#lib/presentation/ledger.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { whenIdleWorkFinishes } from "#lib/utils/idle.js";

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
  {
    excludeCoveredFromFilterCounts = false,
    scrollKey = "almanac",
  }: { excludeCoveredFromFilterCounts?: boolean; scrollKey?: string } = {},
): {
  restoringScroll: () => boolean;
  snapshot: ReturnType<typeof createLedgerSnapshot<Section>>;
  visible: (row: Section["rows"][number]) => boolean;
} {
  const snapshot = createLedgerSnapshot(readLocale, build);
  const restoringScroll = useLedgerScroll(`ledger-scroll:${scrollKey}`);

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

  return { restoringScroll, snapshot, visible };
}

function focusHeading(section: HTMLElement): void {
  const heading = section.matches("[data-ledger-index-heading]")
    ? section
    : section.querySelector<HTMLElement>("h3");
  heading?.focus({ preventScroll: true });
}

/** Align after the target's containing groups and shelves have opened. */
export function useLedgerArrival(
  readTarget: () => string,
  restoringScroll: () => boolean = () => false,
): void {
  $effect(() => {
    const target = readTarget();
    if (!target) return;
    const arrival = new AbortController();
    const listeners = new AbortController();
    const stop = cancelOnReaderScroll(() => {
      arrival.abort();
    });
    globalThis.addEventListener(
      "click",
      (event) => {
        const link = ledgerJump(event);
        // The router scrolls on a repeat click without changing the reactive URL.
        if (link?.hash !== globalThis.location.hash) return;
        requestAnimationFrame(() => {
          const section = document.getElementById(target);
          if (!listeners.signal.aborted && section) focusHeading(section);
        });
      },
      { capture: true, signal: listeners.signal },
    );
    async function align(): Promise<void> {
      await tick();
      // The browser handles the anchor click after the router updates its reactive URL.
      await nextFrame();
      if (arrival.signal.aborted || restoringScroll()) {
        stop();
        return;
      }
      const section = document.getElementById(target);
      if (!section) return;
      const realign = (): void => {
        if (!arrival.signal.aborted && !restoringScroll() && section.isConnected) {
          section.scrollIntoView({ behavior: "instant", block: "start" });
        }
      };
      realign();
      focusHeading(section);
      await whenIdleWorkFinishes();
      realign();
      stop();
    }
    void align();
    return () => {
      listeners.abort();
      arrival.abort();
      stop();
    };
  });
}
