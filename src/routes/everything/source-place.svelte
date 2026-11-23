<script module lang="ts">
  const watchers = new WeakMap<Element, (entry: IntersectionObserverEntry) => void>();
  let observer: IntersectionObserver | undefined;
</script>

<script lang="ts">
  import { LEDGER_MOUNT_EVENT } from "#lib/components/ledger/ledger-context.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";

  import type { Snippet } from "svelte";

  let {
    children,
    id,
    linked,
    status,
    visible,
    width,
  }: {
    children: Snippet;
    id: string;
    linked: boolean;
    status?: string;
    visible: boolean;
    width?: number;
  } = $props();

  let nearby = $state(false);
  let focused = $state(false);
  let retained = $state(false);
  let closedHeight = $state<{ height: number; width: number }>();
  let searchHeight = $state<{ height: number; query: string; width: number }>();
  let mounted = $derived(nearby || linked || focused || retained);
  let placeholderHeight = $derived.by(() => {
    if (searchHeight?.query === toolbarState.searchQuery && searchHeight.width === width) {
      return searchHeight.height;
    }
    return closedHeight?.width === width ? closedHeight?.height : undefined;
  });

  $effect(() => {
    if (linked) retain();
  });

  // Keep the reader's place disclosure, shelf choices, and spoiler reveals for this visit.
  function retain(): void {
    retained = true;
  }

  function watch(element: HTMLElement): () => void {
    const listeners = new AbortController();
    const options = { signal: listeners.signal };
    element.addEventListener("click", retain, { ...options, capture: true });
    element.addEventListener(LEDGER_MOUNT_EVENT, retain, options);
    element.addEventListener("focusin", () => (focused = true), options);
    element.addEventListener(
      "focusout",
      (event) =>
        (focused = event.relatedTarget instanceof Node && element.contains(event.relatedTarget)),
      options,
    );
    if (typeof IntersectionObserver === "undefined") {
      nearby = true;
      return () => listeners.abort();
    }
    observer ??= new IntersectionObserver(
      (entries) => {
        for (const entry of entries) watchers.get(entry.target)?.(entry);
      },
      { rootMargin: "600px 0px" },
    );
    watchers.set(
      element,
      ({ boundingClientRect: { height, width: measuredWidth }, isIntersecting }) => {
        if (nearby && !isIntersecting && !retained && !focused && !linked && height > 0) {
          const query = toolbarState.searchQuery;
          const measurement = { height, width: Math.round(measuredWidth) };
          if (query) searchHeight = { ...measurement, query };
          else closedHeight = measurement;
        }
        nearby = isIntersecting && height > 0;
      },
    );
    observer.observe(element);
    return () => {
      observer?.unobserve(element);
      watchers.delete(element);
      listeners.abort();
    };
  }
</script>

<!-- The box keeps the fragment target & reading position even while its head is absent. -->
<div
  {id}
  class="scroll-mt-[var(--ledger-anchor-offset,8rem)]"
  data-source-section
  data-source-status={status}
  hidden={!visible}
  style:min-block-size={mounted
    ? undefined
    : placeholderHeight === undefined
      ? "calc(3rem + 1px)"
      : `${placeholderHeight}px`}
  {@attach watch}
>
  {#if mounted}{@render children()}{/if}
</div>
