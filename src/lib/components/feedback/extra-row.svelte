<script lang="ts">
  import PeekSlip from "#lib/components/feedback/peek-slip.svelte";
  import VisibilityTag from "#lib/components/feedback/visibility-tag.svelte";
  import { Checkbox } from "#lib/components/ui/checkbox/index.js";

  import type { Snippet } from "svelte";

  import type { Visibility } from "#lib/components/feedback/visibility-tag.svelte";

  let {
    checked,
    children,
    description,
    id,
    label,
    onCheckedChange,
    peek,
    visibility,
  }: {
    checked: boolean;
    /** Shown inside the row while the extra is on, lined up under the label. */
    children?: Snippet;
    /** What the extra sends, read with the row's toggle before opting in. */
    description: string;
    id: string;
    label: string;
    onCheckedChange: (checked: boolean) => void;
    /** A slip that opens the extra's preview without turning it on. */
    peek?: { label: string; onclick: () => void };
    visibility: Visibility;
  } = $props();
</script>

<!--
  One optional extra: its toggle, a Peek slip for data extras, & who will see it. Each row is a
  subgrid of the list, so every row's tag shares one column and they line up on the right.
-->
<div class={["extra-row", checked && "extra-row--on"]}>
  <div class="extra-row__toggle">
    <Checkbox
      class="extra-row__box rounded-sm"
      {id}
      {checked}
      aria-describedby="{id}-visibility {id}-description"
      {onCheckedChange}
    />
    <label for={id}>{label}</label>
  </div>
  {#if peek}<PeekSlip label={peek.label} onclick={peek.onclick} />{/if}
  <span class="extra-row__tag"><VisibilityTag id="{id}-visibility" {visibility} /></span>
  <p id="{id}-description" class="sr-only">{description}</p>
  {#if checked && children}
    <div class="extra-row__more">{@render children()}</div>
  {/if}
</div>

<style>
  .extra-row {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    align-items: center;
    column-gap: 10px;
    min-height: 36px;
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 38%, transparent);
    border-radius: var(--radius-lg);
    padding: 0 8px 0 10px;
    transition:
      background-color 120ms ease-out,
      border-color 120ms ease-out;
  }

  .extra-row--on {
    border-color: color-mix(in srgb, var(--primary) 45%, transparent);
    background: color-mix(in srgb, var(--primary) 9%, var(--color-paper-raised));
  }

  .extra-row__toggle {
    position: relative;
    display: flex;
    min-width: 0;
    min-height: 34px;
    align-items: center;
    gap: 10px;
    font-family: var(--font-controls);
    font-size: var(--text-xs);
  }

  .extra-row__toggle label {
    min-width: 0;
    flex: 1;
    cursor: pointer;
    user-select: none;
  }

  /*
   * The whole label area toggles: its tap area covers the checkbox's line, 44px tall, and meets the
   * next row's without overlapping it.
   */
  .extra-row__toggle label::before {
    position: absolute;
    inset: -5px 0;
    content: "";
  }

  /* Above the label's tap area, so the box itself still takes hover & clicks. */
  .extra-row__toggle :global(.extra-row__box) {
    position: relative;
    z-index: 1;
  }

  .extra-row__tag {
    display: grid;
    grid-column: -2;
  }

  .extra-row__more {
    grid-column: 1 / -1;
    padding: 2px 0 10px 26px;
  }

  @media (prefers-reduced-motion: reduce) {
    .extra-row {
      transition: none;
    }
  }
</style>
