<script lang="ts">
  import IconChevronRight from "@tabler/icons-svelte-runes/icons/chevron-right";
  import IconDeviceDesktop from "@tabler/icons-svelte-runes/icons/device-desktop";
  import IconDeviceLaptop from "@tabler/icons-svelte-runes/icons/device-laptop";
  import IconDeviceMobile from "@tabler/icons-svelte-runes/icons/device-mobile";
  import IconPencil from "@tabler/icons-svelte-runes/icons/pencil";

  let {
    mac,
    onhand,
    onhere,
    onother,
  }: {
    /** A Mac gets “on this computer” as a small button, since the game has no Mac build. */
    mac: boolean;
    onhand: () => void;
    onhere: () => void;
    onother: () => void;
  } = $props();
</script>

<div class="where">
  <button type="button" class="where__card" onclick={onother}>
    <IconDeviceMobile class="where__icon" aria-hidden="true" />
    <span class="where__text">
      <span class="where__title">My save file is on another device</span>
      <span class="where__sub">Like my gaming computer</span>
      <span class="where__body">Scan a code from the computer that runs the game.</span>
    </span>
    <IconChevronRight class="where__chevron" aria-hidden="true" />
  </button>

  {#if mac}
    <p class="where__or" aria-hidden="true"><span>or</span></p>
  {:else}
    <button type="button" class="where__card" onclick={onhere}>
      <IconDeviceDesktop class="where__icon" aria-hidden="true" />
      <span class="where__text">
        <span class="where__title">My save file is on this computer</span>
        <span class="where__sub">I play right here</span>
        <span class="where__body">Read it here, and share it with your phone.</span>
      </span>
      <IconChevronRight class="where__chevron" aria-hidden="true" />
    </button>
  {/if}

  <button type="button" class="where__card" onclick={onhand}>
    <IconPencil class="where__icon" aria-hidden="true" />
    <span class="where__text">
      <span class="where__title">I’ll track it all by hand</span>
      <span class="where__sub">No save file</span>
      <span class="where__body"
        >Check things off yourself. You can still import a save file now and then.</span
      >
    </span>
    <IconChevronRight class="where__chevron" aria-hidden="true" />
  </button>

  {#if mac}
    <button type="button" class="sync-small-button" onclick={onhere}>
      <IconDeviceLaptop aria-hidden="true" />
      The game runs on this Mac
    </button>
  {/if}
</div>

<style>
  .where {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .where__card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 12px 14px 16px;
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 34%, transparent);
    border-left: 3px solid var(--color-home-accent);
    background: var(--color-paper-raised);
    box-shadow: var(--shadow-small);
    text-align: left;
    transition: transform 140ms ease-out;
  }

  .where__card:is(:hover, :focus-visible) {
    outline: 2px solid var(--color-home-accent);
    outline-offset: 2px;
    transform: translateX(2px);
  }

  .where :global(.where__icon) {
    width: 18px;
    height: 18px;
    flex: none;
    color: var(--color-home-accent);
  }

  .where :global(.where__chevron) {
    width: 16px;
    height: 16px;
    flex: none;
    color: var(--color-ink-muted);
  }

  .where__text {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 2px;
  }

  .where__title {
    font-family: var(--font-body);
    font-size: var(--text-base);
    font-weight: 600;
  }

  /* The accent alone falls under 4.5:1 at this size in dark mode, so it deepens toward the ink. */
  .where__sub {
    color: color-mix(in srgb, var(--color-home-accent) 70%, var(--color-ink));
    font-family: var(--font-annotation);
    font-size: var(--text-2xs);
  }

  .where__body {
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
    line-height: 1.4;
  }

  .where__or {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--color-ink-muted);
    font-family: var(--font-display);
    font-style: italic;
  }

  .where__or::before,
  .where__or::after {
    height: 1px;
    flex: 1;
    background: color-mix(in srgb, var(--color-ink-hairline) 40%, transparent);
    content: "";
  }

  @media (prefers-reduced-motion: reduce) {
    .where__card {
      transition-duration: 0.01ms;
    }
  }
</style>
