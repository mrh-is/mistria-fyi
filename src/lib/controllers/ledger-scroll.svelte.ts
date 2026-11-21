import { onMount, tick, untrack } from "svelte";

import { LEDGER_MOUNT_EVENT } from "#lib/components/ledger/ledger-context.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { beforeNavigate, snapshot } from "$app/navigation";

interface ReadingPosition {
  fact?: string;
  /** The row's key in its section, which mounts the row again before the restore. */
  key?: string;
  section: string;
  top: number;
}

const SECTION = "[data-ledger-section][id], [data-source-section][id]";
/** How long a restored row stays pinned while the rows around it settle. */
const ALIGNMENT_HOLD_MS = 1500;
const SCROLL_KEYS = new Set(["ArrowDown", "ArrowUp", "End", "Home", "PageDown", "PageUp", " "]);

function ledgerContent(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-ledger-content]:not([inert] *)");
}

function isSearchInput(target: EventTarget | null): target is HTMLInputElement {
  return target instanceof HTMLInputElement && target.closest("[data-toolbar-search]") !== null;
}

function readPosition(): ReadingPosition | undefined {
  const content = ledgerContent();
  const bounds = content?.getBoundingClientRect();
  if (!bounds) return undefined;
  const x = bounds.left + bounds.width / 2;
  // Look below any sticky heading that covers the line on smaller screens.
  let fallback: ReadingPosition | undefined;
  for (const ratio of [0.5, 0.3, 0.7]) {
    const hit = document.elementFromPoint(x, globalThis.innerHeight * ratio);
    if (!hit || !content?.contains(hit)) continue;
    const section = hit.closest<HTMLElement>(SECTION);
    if (!section) continue;
    const row = hit.closest<HTMLElement>("[data-ledger-fact]");
    const position = {
      fact: row?.dataset.ledgerFact,
      key: row?.dataset.ledgerKey,
      section: section.id,
      top: (row ?? section).getBoundingClientRect().top,
    };
    if (row) return position;
    fallback ??= position;
  }
  return fallback;
}

/**
 * Rows can settle above and below the anchor without changing the ledger's overall height.
 * Hold the anchor while nearby rows finish laying out, or until the reader scrolls or presses.
 */
async function holdAlignment(align: () => void, signal: AbortSignal): Promise<void> {
  const content = ledgerContent();
  if (!content || signal.aborted) return;
  await new Promise<void>((resolve) => {
    let frame: number;
    const check = (): void => {
      align();
      frame = requestAnimationFrame(check);
    };
    const stop = (): void => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
      globalThis.removeEventListener("pointerdown", stop, { capture: true });
      resolve();
    };
    const timer = setTimeout(stop, ALIGNMENT_HOLD_MS);
    signal.addEventListener("abort", stop, { once: true });
    // A press is the reader acting, such as opening a fold above the row, so stop pinning it.
    globalThis.addEventListener("pointerdown", stop, { capture: true, once: true });
    frame = requestAnimationFrame(check);
  });
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
export function useLedgerScroll(id: string): () => boolean {
  let searchPosition: ReadingPosition | undefined;
  let departure: undefined | { position: ReadingPosition | undefined };
  let lastQuery = untrack(() => toolbarState.searchQuery);
  let pending: AbortController | undefined;
  const cancel = (): void => pending?.abort();
  const readingPosition = (): ReadingPosition | undefined =>
    (toolbarState.searchQuery ? searchPosition : undefined) ?? readPosition();

  async function clearDeparture(
    complete: Promise<void>,
    captured: typeof departure,
  ): Promise<void> {
    try {
      await complete;
    } catch {
      // A canceled navigation never consumes its reading position.
    } finally {
      if (departure === captured) departure = undefined;
    }
  }

  beforeNavigate(({ complete, from, to }) => {
    if (from?.url.pathname === to?.url.pathname) return;
    const captured = { position: readingPosition() };
    departure = captured;
    void clearDeparture(complete, captured);
  });

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
      "input",
      (event) => {
        if (!toolbarState.searchQuery && isSearchInput(event.target)) {
          searchPosition = event.target.value.trim()
            ? (searchPosition ?? readPosition())
            : undefined;
        }
      },
      options,
    );
    globalThis.addEventListener(
      "keydown",
      (event) => {
        const input = event.target;
        if (event.key !== "Escape" || !isSearchInput(input)) {
          return;
        }
        if (!toolbarState.searchQuery) searchPosition = undefined;
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
    if (signal.aborted) return;

    const section = document.getElementById(position.section);
    if (!section || !ledgerContent()?.contains(section)) return;
    // Rows mount near the screen, so ask the section to mount a window around the target first.
    if (position.key) {
      const sections = section.matches("[data-ledger-section]")
        ? [section]
        : section.querySelectorAll<HTMLElement>("[data-ledger-section]");
      for (const element of sections) {
        element.dispatchEvent(new CustomEvent(LEDGER_MOUNT_EVENT, { detail: position.key }));
      }
      await tick();
    }
    const fact = position.fact;
    const row = fact
      ? section.querySelector<HTMLElement>(`[data-ledger-fact="${CSS.escape(fact)}"]`)
      : null;
    // Open each closed disclosure around the row, from the outer shelf inward.
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
      if (signal.aborted || !target.isConnected) return;
      const drift = target.getBoundingClientRect().top - position.top;
      if (Math.abs(drift) < 1) return;
      globalThis.scrollBy({ behavior: "instant", top: drift });
    };
    align();
    // Rows near the restored viewport replace their intrinsic estimates with real heights.
    await nextFrame();
    await nextFrame();
    align();
    await holdAlignment(align, signal);
  }

  function returnTo(position: ReadingPosition | undefined): void {
    cancel();
    if (!position) return;
    const controller = new AbortController();
    pending = controller;
    void restoreAndClear(position, controller);
  }

  async function restoreAndClear(
    position: ReadingPosition,
    controller: AbortController,
  ): Promise<void> {
    try {
      await restore(position, controller.signal);
    } finally {
      if (pending === controller) pending = undefined;
    }
  }

  snapshot({
    capture: () => departure?.position ?? readingPosition(),
    id,
    reset: cancel,
    restore: returnTo,
  });

  $effect.pre(() => {
    const query = toolbarState.searchQuery;
    if (query && !lastQuery) searchPosition ??= readPosition();
  });

  $effect(() => {
    const query = toolbarState.searchQuery;
    if (query === lastQuery) return;
    lastQuery = query;
    if (query) {
      cancel();
      const layout = ledgerContent()?.closest("[data-ledger-layout]");
      if (!layout) return;
      const top = layout.getBoundingClientRect().top + globalThis.scrollY;
      const stickyTop = Number(
        getComputedStyle(layout).getPropertyValue("--ledger-sticky-top").replace("px", ""),
      );
      if (globalThis.scrollY > top - stickyTop) {
        globalThis.scrollTo({ behavior: "instant", top: Math.max(0, top - stickyTop) });
      }
    } else {
      returnTo(searchPosition);
      searchPosition = undefined;
    }
  });
  return () => pending !== undefined && !pending.signal.aborted;
}
