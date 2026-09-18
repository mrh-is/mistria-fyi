<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";

  import * as m from "$lib/paraglide/messages.js";

  let {
    entries,
    reducedMotion,
  }: {
    entries: { id: string; initial: string }[];
    reducedMotion?: boolean;
  } = $props();

  let scrubbing = $state(false);
  let lastScrubbedInitial = $state<string>();
  let scrubStartInitial = $state<string>();
  let suppressPointerClick = $state(false);
  let initials = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- short-lived projection local
    const firstByInitial = new Map<string, string>();
    for (const entry of entries) {
      const initial = entry.initial.toUpperCase();
      if (!firstByInitial.has(initial)) firstByInitial.set(initial, entry.id);
    }
    return [...firstByInitial.entries()]
      .map(([initial, id]) => ({ id, initial }))
      .sort((a, b) => a.initial.localeCompare(b.initial));
  });

  function activate({ id, initial }: { id: string; initial: string }): void {
    if (scrubbing && lastScrubbedInitial === initial) return;
    const target = document.getElementById(id);
    if (!target) return;

    lastScrubbedInitial = initial;
    target.focus({ preventScroll: true });
    target.scrollIntoView({
      behavior: (reducedMotion ?? prefersReducedMotion.current) ? "auto" : "smooth",
      block: "center",
    });
  }

  function cancelScrub(): void {
    scrubbing = false;
    lastScrubbedInitial = undefined;
    scrubStartInitial = undefined;
    suppressPointerClick = false;
  }

  function handleClick(event: MouseEvent, entry: { id: string; initial: string }): void {
    if (suppressPointerClick && event.detail > 0) {
      suppressPointerClick = false;
      return;
    }
    suppressPointerClick = false;
    activate(entry);
  }

  function scrub(event: PointerEvent): void {
    if (!scrubbing) return;
    const button = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLButtonElement>("[data-villager-index-initial]");
    const initial = button?.dataset.villagerIndexInitial;
    const entry = initials.find((candidate) => candidate.initial === initial);
    if (entry) activate(entry);
  }

  function startScrub(event: PointerEvent, entry: { id: string; initial: string }): void {
    scrubbing = true;
    scrubStartInitial = entry.initial;
    suppressPointerClick = false;
    lastScrubbedInitial = undefined;
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // jsdom does not implement setPointerCapture
    }
    activate(entry);
  }

  function stopScrub(): void {
    suppressPointerClick =
      lastScrubbedInitial !== undefined && lastScrubbedInitial !== scrubStartInitial;
    scrubbing = false;
    lastScrubbedInitial = undefined;
    scrubStartInitial = undefined;
  }
</script>

<nav
  class="villager-index"
  style="--villager-index-count: {initials.length}"
  aria-label={m.villagers_alphabet_aria()}
  data-scrubbing={scrubbing}
  onpointermove={scrub}
  onpointerup={stopScrub}
  onpointercancel={cancelScrub}
>
  {#each initials as entry (entry.initial)}
    <button
      type="button"
      data-villager-index-initial={entry.initial}
      data-active={scrubbing && lastScrubbedInitial === entry.initial}
      aria-label={m.villagers_jump_to_initial_aria({ initial: entry.initial })}
      onpointerdown={(event) => {
        startScrub(event, entry);
      }}
      onclick={(event) => {
        handleClick(event, entry);
      }}
    >
      {entry.initial}
    </button>
  {/each}
</nav>

<style>
  .villager-index {
    position: fixed;
    top: 50dvh;
    right: max(10px, calc((100vw - 32rem) / 2 + 10px));
    z-index: 9;
    display: grid;
    width: 24px;
    height: min(calc(100dvh - 152px), calc(var(--villager-index-count) * 24px));
    grid-template-rows: repeat(var(--villager-index-count), minmax(0, 1fr));
    background: transparent;
    touch-action: none;
    transform: translateY(-50%);
  }

  .villager-index button {
    display: grid;
    min-width: 24px;
    min-height: 0;
    place-items: center;
    border: 0;
    background: transparent;
    color: var(--ink-muted);
    font-family: var(--font-data);
    font-size: 10px;
    line-height: 1;
  }

  .villager-index button:is(:focus-visible, [data-active="true"]) {
    background: color-mix(in srgb, var(--cat-villagers) 12%, transparent);
    color: var(--cat-villagers);
    outline: 2px solid var(--cat-villagers);
    outline-offset: 0;
  }

  @media (hover: hover) {
    .villager-index:not([data-scrubbing="true"]) button:hover {
      background: color-mix(in srgb, var(--cat-villagers) 12%, transparent);
      color: var(--cat-villagers);
      outline: 2px solid var(--cat-villagers);
      outline-offset: 0;
    }
  }
</style>
