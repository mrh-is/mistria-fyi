<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";

  let {
    entries,
    reducedMotion,
  }: {
    entries: { id: string; initial: string }[];
    reducedMotion?: boolean;
  } = $props();

  let scrubbing = $state(false);
  let lastScrubbedInitial = $state<string>();
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

  function startScrub(event: PointerEvent): void {
    scrubbing = true;
    lastScrubbedInitial = undefined;
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // jsdom does not implement setPointerCapture
    }
  }

  function scrub(event: PointerEvent): void {
    if (!scrubbing) return;
    const button = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLButtonElement>("[data-npc-index-initial]");
    const initial = button?.dataset.npcIndexInitial;
    const entry = initials.find((candidate) => candidate.initial === initial);
    if (entry) activate(entry);
  }

  function stopScrub(): void {
    scrubbing = false;
    lastScrubbedInitial = undefined;
  }
</script>

<nav
  class="npc-index"
  style="--npc-index-count: {initials.length}"
  aria-label="Townsfolk alphabet"
  onpointermove={scrub}
  onpointerup={stopScrub}
  onpointercancel={stopScrub}
>
  {#each initials as entry (entry.initial)}
    <button
      type="button"
      data-npc-index-initial={entry.initial}
      aria-label="Jump to {entry.initial}, first Townsfolk record"
      onpointerdown={startScrub}
      onclick={() => {
        activate(entry);
      }}
    >
      {entry.initial}
    </button>
  {/each}
</nav>

<style>
  .npc-index {
    position: fixed;
    top: 50dvh;
    right: max(4px, calc((100vw - 32rem) / 2 + 4px));
    z-index: 9;
    display: grid;
    width: 24px;
    height: min(calc(100dvh - 152px), calc(var(--npc-index-count) * 24px));
    grid-template-rows: repeat(var(--npc-index-count), minmax(0, 1fr));
    background: transparent;
    touch-action: none;
    transform: translateY(-50%);
  }

  .npc-index button {
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

  .npc-index button:is(:hover, :focus-visible) {
    background: color-mix(in srgb, var(--cat-npcs) 12%, transparent);
    color: var(--cat-npcs);
    outline: 2px solid var(--cat-npcs);
    outline-offset: 0;
  }
</style>
