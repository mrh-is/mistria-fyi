import { onMount, tick, untrack } from "svelte";

import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { whenIdleWorkFinishes } from "#lib/utils/idle.js";
import { snapshot } from "$app/navigation";

interface ReadingPosition {
  fact?: string;
  section: string;
  top: number;
}

const SECTION = "[data-ledger-section][id], [data-source-section][id]";
const SCROLL_KEYS = new Set(["ArrowDown", "ArrowUp", "End", "Home", "PageDown", "PageUp", " "]);

function ledgerContent(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-ledger-content]:not([inert] *)");
}

function readPosition(): ReadingPosition | undefined {
  const content = ledgerContent();
  const bounds = content?.getBoundingClientRect();
  if (!bounds) return undefined;
  const x = bounds.left + bounds.width / 2;
  // Look below any sticky heading that covers the line on smaller screens.
  let fallback: ReadingPosition | undefined;
  for (const ratio of [0.3, 0.5, 0.7]) {
    const hit = document.elementFromPoint(x, globalThis.innerHeight * ratio);
    if (!hit || !content?.contains(hit)) continue;
    const section = hit.closest<HTMLElement>(SECTION);
    if (!section) continue;
    const row = hit.closest<HTMLElement>("[data-ledger-fact]");
    const position = {
      fact: row?.dataset.ledgerFact,
      section: section.id,
      top: (row ?? section).getBoundingClientRect().top,
    };
    if (row) return position;
    fallback ??= position;
  }
  return fallback;
}

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

export function ledgerJump(event: MouseEvent): HTMLAnchorElement | undefined {
  if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return undefined;
  }
  if (!(event.target instanceof Element)) return undefined;
  return event.target.closest<HTMLAnchorElement>('[data-ledger-layout] a[href^="#"]') ?? undefined;
}

/** Let the reader take control before background mounting has settled. */
export function cancelOnReaderScroll(cancel: () => void): () => void {
  const listeners = new AbortController();
  const options = { passive: true, signal: listeners.signal };
  globalThis.addEventListener("wheel", cancel, options);
  globalThis.addEventListener("touchmove", cancel, options);
  globalThis.addEventListener(
    "keydown",
    (event) => {
      if (
        SCROLL_KEYS.has(event.key) &&
        !(event.target instanceof HTMLElement && event.target.closest("input, textarea, select"))
      ) {
        cancel();
      }
    },
    options,
  );
  return () => {
    listeners.abort();
  };
}

/** Share the same row anchor between search and the router's per-history-entry snapshots. */
export function useLedgerScroll(id: string): void {
  let searchPosition: ReadingPosition | undefined;
  let lastQuery = untrack(() => toolbarState.searchQuery);
  let pending: AbortController | undefined;
  const cancel = (): void => pending?.abort();

  onMount(() => {
    const stop = cancelOnReaderScroll(cancel);
    const listeners = new AbortController();
    const options = { capture: true, signal: listeners.signal };
    globalThis.addEventListener(
      "click",
      (event) => {
        if (ledgerJump(event)) cancel();
      },
      options,
    );
    globalThis.addEventListener(
      "keydown",
      (event) => {
        const input = event.target;
        if (
          event.key !== "Escape" ||
          !(input instanceof HTMLInputElement) ||
          !input.closest("[data-toolbar-search]")
        ) {
          return;
        }
        // The toolbar handles Escape itself. Recover focus only if clearing left it on the body.
        requestAnimationFrame(() => {
          if (
            !listeners.signal.aborted &&
            input.isConnected &&
            document.activeElement === document.body
          ) {
            input.focus({ preventScroll: true });
          }
        });
      },
      options,
    );
    return () => {
      listeners.abort();
      stop();
      cancel();
    };
  });

  async function restore(position: ReadingPosition, signal: AbortSignal): Promise<void> {
    await tick();
    await whenIdleWorkFinishes();
    if (signal.aborted) return;

    const section = document.getElementById(position.section);
    if (!section || !ledgerContent()?.contains(section)) return;
    const fact = position.fact;
    const row = fact
      ? section.querySelector<HTMLElement>(`[data-ledger-fact="${CSS.escape(fact)}"]`)
      : null;
    // Follow the same disclosures as Browser Find, from the outer shelf to the row.
    const disclosures: HTMLElement[] = [];
    for (
      let element: HTMLElement | null = row ?? section;
      element;
      element = element.parentElement
    ) {
      if (
        element.getAttribute("hidden") === "until-found" ||
        element.matches("details:not([open])")
      ) {
        disclosures.unshift(element);
      }
    }
    for (const element of disclosures) {
      if (element instanceof HTMLDetailsElement) element.open = true;
      else element.dispatchEvent(new Event("beforematch"));
    }
    await tick();

    const target = row?.checkVisibility() ? row : section;
    const align = (): void => {
      if (!signal.aborted && target.isConnected) {
        globalThis.scrollBy({
          behavior: "instant",
          top: target.getBoundingClientRect().top - position.top,
        });
      }
    };
    align();
    // Rows near the restored viewport replace their intrinsic estimates with real heights.
    await nextFrame();
    await nextFrame();
    align();
  }

  function returnTo(position: ReadingPosition | undefined): void {
    cancel();
    if (!position) return;
    pending = new AbortController();
    void restore(position, pending.signal);
  }

  snapshot({
    capture: () => searchPosition ?? readPosition(),
    id,
    reset: cancel,
    restore: returnTo,
  });

  $effect.pre(() => {
    const query = toolbarState.searchQuery;
    if (query && !lastQuery) searchPosition = readPosition();
  });

  $effect(() => {
    const query = toolbarState.searchQuery;
    if (query === lastQuery) return;
    lastQuery = query;
    if (query) {
      cancel();
      const layout = ledgerContent()?.closest("[data-ledger-layout]");
      const top = (layout?.getBoundingClientRect().top ?? 0) + globalThis.scrollY;
      const headerHeight =
        document.querySelector<HTMLElement>("[data-page-header]")?.offsetHeight ?? 0;
      if (globalThis.scrollY > top - headerHeight) {
        globalThis.scrollTo({ behavior: "instant", top: Math.max(0, top - headerHeight) });
      }
    } else {
      returnTo(searchPosition);
      searchPosition = undefined;
    }
  });
}
