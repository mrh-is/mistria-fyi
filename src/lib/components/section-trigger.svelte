<!--
  The header button shared by every tracker section: an expandable section's
  disclosure, & the reveal button a spoiler-hidden section shows in its place.
  Sharing it keeps their box, disclosure icon, hover, & focus in step.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";

  let {
    type = "button",
    children,
    class: className,
    ...rest
  }: HTMLButtonAttributes & {
    children: Snippet;
  } = $props();
</script>

<button class={["section-trigger", className]} data-section-trigger {type} {...rest}>
  {@render children()}
</button>

<style>
  .section-trigger {
    position: relative;
    display: grid;
    width: 100%;
    min-height: 44px;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 5px 8px 7px;
    border: 0;
    background: transparent;
    color: var(--color-ink);
    text-align: left;
  }

  .section-trigger :global(.section-disclosure) {
    color: var(--color-ink-muted);
  }

  .section-trigger:is(:active, :focus-visible) {
    background: color-mix(in srgb, var(--primary) 7%, transparent);
    outline: 2px solid var(--primary);
    outline-offset: -2px;
  }

  @media (hover: hover) {
    .section-trigger:hover {
      background: color-mix(in srgb, var(--primary) 7%, transparent);
      outline: 2px solid var(--primary);
      outline-offset: -2px;
    }
  }
</style>
