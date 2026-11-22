<!--
  A ledger row's sprite in its shelf's treatment. It stays invisible until its image (and, for the
  masked treatments, its mask) has loaded, so a slow sprite fades in rather than flashing a tinted
  square. A To do or Not now sprite is a button: a click shows its full color for two seconds.
-->
<script lang="ts">
  import { ledgerSpriteMask } from "#lib/attachments/ledger-sprite-mask.js";
  import { SPRITE_PREVIEW_HOLD_MS } from "#lib/utils/row-timing.js";

  export type LedgerSpriteTreatment = "completed" | "not-now" | "spoiler" | "todo";

  let {
    name,
    treatment,
    url,
  }: {
    name: string;
    treatment: LedgerSpriteTreatment;
    url: string;
  } = $props();

  let loaded = $state(false);
  let image = $state<HTMLImageElement>();

  // A server-rendered image can finish before hydration, so its load event never reaches us.
  $effect(() => {
    if (image?.complete && image.naturalWidth > 0) loaded = true;
  });
  let previewing = $state(false);
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let previewable = $derived(treatment === "todo" || treatment === "not-now");
  let shown = $derived(previewing ? "completed" : treatment);
  let masked = $derived(shown === "todo" || shown === "spoiler");

  function preview(): void {
    clearTimeout(holdTimer);
    previewing = true;
    holdTimer = setTimeout(() => {
      previewing = false;
    }, SPRITE_PREVIEW_HOLD_MS);
  }

  $effect(() => {
    if (!previewable) previewing = false;
  });

  $effect(() => () => {
    clearTimeout(holdTimer);
  });
</script>

{#snippet sprite()}
  <span
    class="ledger-sprite"
    data-sprite-treatment={shown}
    data-loaded={loaded || undefined}
    {@attach masked ? ledgerSpriteMask(url) : undefined}
  >
    <img
      bind:this={image}
      src={url}
      alt=""
      crossorigin="anonymous"
      loading="lazy"
      width="30"
      height="30"
      onload={() => (loaded = true)}
    />
  </span>
{/snippet}

{#if previewable}
  <button
    type="button"
    class="sprite-button"
    aria-label={`Show ${name} in color`}
    aria-pressed={previewing}
    onclick={preview}>{@render sprite()}</button
  >
{:else}
  {@render sprite()}
{/if}

<style>
  .sprite-button {
    display: block;
    border-radius: var(--radius);
  }

  .ledger-sprite {
    display: block;
    inline-size: 30px;
    block-size: 30px;
    opacity: 0;
    transition: opacity 140ms ease-out;
  }

  /* Plain treatments wait for the image; masked ones also wait for the mask. */
  .ledger-sprite[data-loaded]:not([data-sprite-treatment="todo"], [data-sprite-treatment="spoiler"]),
  /* The mask attachment sets data-mask-ready from script, so Svelte can't see it in the markup. */
  .ledger-sprite[data-loaded]:global([data-mask-ready]) {
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .ledger-sprite {
      transition: none;
    }
  }
</style>
