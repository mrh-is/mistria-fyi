<script lang="ts">
  import SpriteSlot from "#lib/components/sprite-slot.svelte";
  import { SPRITE_PREVIEW_HOLD_MS } from "#lib/utils/row-timing.js";

  import type { SpriteSlotState } from "#lib/components/sprite-slot.svelte";

  let {
    class: className = "",
    label,
    sprite,
    state: slotState,
  }: {
    class?: string;
    label: string;
    sprite: string;
    state: SpriteSlotState;
  } = $props();

  let previewing = $state(false);
  let holdTimer: ReturnType<typeof setTimeout> | undefined;

  // Only a ready silhouette previews: a completed row already shows its sticker, and a spoilered
  // row stays behind its spoiler cover until the player reveals it.
  let canPreview = $derived(slotState === "ready");

  function stopPreview(): void {
    clearTimeout(holdTimer);
    holdTimer = undefined;
    previewing = false;
  }

  function startPreview(): void {
    clearTimeout(holdTimer);
    previewing = true;
    holdTimer = setTimeout(stopPreview, SPRITE_PREVIEW_HOLD_MS);
  }

  $effect(() => {
    if (!canPreview) stopPreview();
  });

  $effect(() => stopPreview);
</script>

{#if canPreview}
  <button
    class="sprite-preview-button"
    type="button"
    aria-label={label}
    data-sprite-previewing={previewing}
    onclick={startPreview}
  >
    <SpriteSlot {sprite} state={slotState} {previewing} class={className} />
  </button>
{:else}
  <SpriteSlot {sprite} state={slotState} class={className} />
{/if}

<style>
  .sprite-preview-button {
    display: inline-flex;
    flex-shrink: 0;
    border-radius: var(--radius);
    cursor: pointer;
  }

  .sprite-preview-button:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 1px;
  }
</style>
