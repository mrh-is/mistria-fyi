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
    position: sticky;
    top: 50dvh;
    display: flex;
    width: 46px;
    max-height: min(68dvh, 572px);
    align-self: start;
    flex-direction: column;
    overflow-y: auto;
    overscroll-behavior: contain;
    border: 1px solid color-mix(in srgb, var(--cat-npcs) 24%, var(--hairline));
    border-radius: 2px;
    background: color-mix(in srgb, var(--paper-raised) 94%, transparent);
    box-shadow: var(--shadow-small);
    scrollbar-width: none;
    touch-action: pan-y;
    transform: translateY(-50%);
  }

  .npc-index::-webkit-scrollbar {
    display: none;
  }

  .npc-index button {
    display: grid;
    min-width: 44px;
    min-height: 44px;
    flex: 0 0 44px;
    place-items: center;
    border: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--hairline) 65%, transparent);
    background: transparent;
    color: var(--ink-muted);
    font-family: var(--font-data);
    font-size: 11px;
  }

  .npc-index button:last-child {
    border-bottom: 0;
  }

  .npc-index button:is(:hover, :focus-visible) {
    background: color-mix(in srgb, var(--cat-npcs) 12%, transparent);
    color: var(--cat-npcs);
    outline: 2px solid var(--cat-npcs);
    outline-offset: -2px;
  }

  @media (min-width: 701px) and (hover: hover) and (pointer: fine) {
    .npc-index {
      width: 32px;
    }

    .npc-index button {
      min-width: 30px;
      min-height: 32px;
      flex-basis: 32px;
    }
  }
</style>
