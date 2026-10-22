<!--
  The header surface shared by every tracker section: an expandable section's
  disclosure button, & the inert header a spoiler-hidden section shows in its
  place. Sharing it keeps their box & hover in step; only the button shows a
  pressed or focused state, since the inert header does nothing when tapped.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";

  let {
    children,
    class: className,
    element = "button",
    ...rest
  }: HTMLButtonAttributes & {
    children: Snippet;
    element?: "button" | "div";
  } = $props();
</script>

<svelte:element
  this={element}
  class={["section-trigger", className]}
  data-section-trigger
  {...rest}
>
  {@render children()}
</svelte:element>

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

  button.section-trigger:is(:active, :focus-visible) {
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
