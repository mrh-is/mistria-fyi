<script lang="ts">
  import CircleCheckIcon from "@tabler/icons-svelte-runes/icons/circle-check";
  import InfoIcon from "@tabler/icons-svelte-runes/icons/info-circle";
  import Loader2Icon from "@tabler/icons-svelte-runes/icons/loader-2";
  import OctagonXIcon from "@tabler/icons-svelte-runes/icons/alert-octagon";
  import TriangleAlertIcon from "@tabler/icons-svelte-runes/icons/alert-triangle";
  import { Toaster as Sonner, type ToasterProps as SonnerProps } from "svelte-sonner";

  import { theme } from "#lib/stores/theme.svelte.js";

  let { ...restProps }: SonnerProps = $props();
</script>

<!-- Unstyled: the slip below owns the whole look, keyed off Sonner's data attributes. -->
<Sonner
  theme={theme.resolved}
  class="toaster group"
  toastOptions={{ unstyled: true }}
  {...restProps}
>
  {#snippet loadingIcon()}
    <Loader2Icon class="size-3.5 animate-spin" stroke={2.25} />
  {/snippet}
  {#snippet successIcon()}
    <CircleCheckIcon class="size-3.5" stroke={2.25} />
  {/snippet}
  {#snippet errorIcon()}
    <OctagonXIcon class="size-3.5" stroke={2.25} />
  {/snippet}
  {#snippet infoIcon()}
    <InfoIcon class="size-3.5" stroke={2.25} />
  {/snippet}
  {#snippet warningIcon()}
    <TriangleAlertIcon class="size-3.5" stroke={2.25} />
  {/snippet}
</Sonner>

<style>
  /*
   * A toast is a paper slip tucked into the journal: a bookmark ribbon in the toast's kind color
   * hangs from its top edge & pokes out below, and an action sits on a stub past a dashed tear line.
   * Every rule starts at the themed toaster so it outranks Sonner's own theme rules.
   */

  /* Sonner's own stylesheet uses a huge z-index; the token keeps it in the app's order. */
  :global([data-sonner-toaster][data-sonner-theme]) {
    /* A little wider than Sonner's 356px, so an error's description doesn't stack into a column,
     * but never wider than the window at a large default font size. Sonner sets its width as an
     * inline style, so only an important declaration can widen it. */
    --width: min(24rem, calc(100vw - 2rem)) !important;

    z-index: var(--z-toast);
    font-family: var(--font-body);
  }

  :global([data-sonner-toaster][data-sonner-theme] [data-sonner-toast]) {
    --toast-accent: var(--color-brand-accent);
    --toast-ribbon-inset: 12px;
    --toast-ribbon-width: 22px;
    --toast-ribbon-overhang: 6px;
    --toast-pad: 12px;

    display: flex;
    align-items: center;
    box-sizing: border-box;
    min-block-size: 3.25rem;
    padding-block: var(--toast-pad);
    padding-inline: calc(var(--toast-ribbon-inset) + var(--toast-ribbon-width) + 12px)
      var(--toast-pad);
    color: var(--color-ink);
    background: var(--color-paper-raised);
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 55%, transparent);
    border-radius: var(--radius-lg);
    box-shadow:
      var(--shadow-small),
      var(--shadow-overlay),
      inset 0 1px 0 color-mix(in srgb, var(--color-paper-raised) 60%, #fff);
  }

  /* The slip's shadow above replaces Sonner's focus ring, so focus gets its own. */
  :global([data-sonner-toaster][data-sonner-theme] [data-sonner-toast]:focus-visible) {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }

  /* Phones keep Sonner's own inset width; wider screens fill the toaster's column. */
  @media (min-width: 601px) {
    :global([data-sonner-toaster][data-sonner-theme] [data-sonner-toast]) {
      width: 100%;
    }
  }

  /* Kinds: the ribbon & the action's hover carry the color; the paper stays paper. */
  :global([data-sonner-toaster][data-sonner-theme] [data-sonner-toast][data-type="success"]) {
    --toast-accent: var(--color-status-success);
  }

  :global([data-sonner-toaster][data-sonner-theme] [data-sonner-toast][data-type="info"]) {
    --toast-accent: var(--color-status-info);
  }

  :global([data-sonner-toaster][data-sonner-theme] [data-sonner-toast][data-type="warning"]) {
    --toast-accent: var(--color-status-warning);
  }

  /* Paper-colored ink keeps the icon at 3:1 on dark mode's lighter amber ribbon. */
  :global(
    [data-sonner-toaster][data-sonner-theme="dark"]
      [data-sonner-toast][data-type="warning"]
      [data-icon]
  ) {
    color: var(--color-paper);
  }

  /* An error can cost progress, so its whole edge reads as one, not just its ribbon. */
  :global([data-sonner-toaster][data-sonner-theme] [data-sonner-toast][data-type="error"]) {
    --toast-accent: var(--destructive);

    background: color-mix(in srgb, var(--destructive) 5%, var(--color-paper-raised));
    border-color: color-mix(in srgb, var(--destructive) 55%, transparent);
  }

  /* The ribbon: hangs over the top border and ends in a swallowtail below the slip. */
  :global([data-sonner-toaster][data-sonner-theme] [data-sonner-toast] [data-content]::before) {
    position: absolute;
    inset-block: -1px calc(-1 * var(--toast-ribbon-overhang));
    inset-inline-start: var(--toast-ribbon-inset);
    inline-size: var(--toast-ribbon-width);
    background: var(--toast-accent);
    clip-path: polygon(
      0 0,
      100% 0,
      100% 100%,
      50% calc(100% - var(--toast-ribbon-overhang)),
      0 100%
    );
    content: "";
  }

  /* The kind's icon rides at the top of the ribbon, so color is never its only cue. */
  :global([data-sonner-toaster][data-sonner-theme] [data-sonner-toast] [data-icon]) {
    position: absolute;
    z-index: 1;
    inset-block-start: 9px;
    inset-inline-start: var(--toast-ribbon-inset);
    display: flex;
    align-items: center;
    justify-content: center;
    inline-size: var(--toast-ribbon-width);
    /* Matches the icons' size-3.5, so a loading spinner centers like the other icons. */
    block-size: 0.875rem;
    color: var(--color-ribbon-foreground);
  }

  :global([data-sonner-toaster][data-sonner-theme] [data-sonner-toast] [data-content]) {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  /* The tear line: runs the slip's full height between the message and its action stub. */
  :global(
    [data-sonner-toaster][data-sonner-theme] [data-sonner-toast] [data-content]:has(~ [data-button])
  ) {
    align-self: stretch;
    justify-content: center;
    margin-block: calc(-1 * var(--toast-pad));
    padding-block: var(--toast-pad);
    padding-inline-end: var(--toast-pad);
    border-inline-end: 1px dashed color-mix(in srgb, var(--color-ink-hairline) 55%, transparent);
  }

  /* One scale for every kind: the message leads in the body face; a description supports it. */
  :global([data-sonner-toaster][data-sonner-theme] [data-sonner-toast] [data-title]) {
    font-size: var(--text-sm);
    font-weight: 500;
    line-height: 1.35;
    color: var(--color-ink);
    overflow-wrap: anywhere;
  }

  /* Sonner's theme rule paints descriptions near-white, brighter than the title they support. */
  :global([data-sonner-toaster][data-sonner-theme] [data-sonner-toast] [data-description]) {
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
    line-height: 1.4;
    color: var(--color-ink-muted);
  }

  /* The stub's action: a steady minimum footprint, labelled like the toolbar's controls. Labels
   * wrap between words only; the max width fits the longest single word in the shipped locales. */
  :global([data-sonner-toaster][data-sonner-theme] [data-sonner-toast] [data-button]) {
    flex-shrink: 0;
    min-inline-size: 4.75rem;
    max-inline-size: 9rem;
    min-block-size: 2.25rem;
    margin-inline-start: var(--toast-pad);
    padding: 6px 10px;
    font-family: var(--font-controls);
    font-size: var(--text-2xs);
    line-height: 1.25;
    letter-spacing: 0.06em;
    text-align: center;
    text-transform: uppercase;
    text-wrap: balance;
    overflow-wrap: normal;
    color: var(--color-ink);
    cursor: pointer;
    background: var(--color-paper);
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 80%, transparent);
    border-radius: var(--radius);
    box-shadow: var(--shadow-small);
    transition:
      background-color 120ms ease-out,
      border-color 120ms ease-out,
      transform 80ms ease-out;
  }

  :global([data-sonner-toaster][data-sonner-theme] [data-sonner-toast] [data-button]:hover) {
    background: color-mix(in srgb, var(--toast-accent) 14%, var(--color-paper-raised));
    border-color: var(--toast-accent);
  }

  :global([data-sonner-toaster][data-sonner-theme] [data-sonner-toast] [data-button]:active) {
    box-shadow: none;
    transform: translateY(1px);
  }

  :global(
    [data-sonner-toaster][data-sonner-theme] [data-sonner-toast] [data-button]:focus-visible
  ) {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }

  /* The layout keeps the stack expanded, so this is a guard: should it ever collapse, the slips
   * behind show only their edge, not their words. Sonner's own rule for this is styled-mode only. */
  :global(
    [data-sonner-toaster][data-sonner-theme]
      [data-sonner-toast][data-expanded="false"][data-front="false"]
      > *
  ) {
    opacity: 0;
  }

  @media (forced-colors: active) {
    :global([data-sonner-toaster][data-sonner-theme] [data-sonner-toast] [data-icon]) {
      color: CanvasText;
    }
  }
</style>
