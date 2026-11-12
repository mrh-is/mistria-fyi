<!-- A quiet tool on the cover beside the thumb tabs: an outline on the cloth, brighter when you point at it or its panel is open. -->
<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";

  let { children, ...rest }: HTMLButtonAttributes = $props();
</script>

<button class="rail-tool" type="button" {...rest}>
  {@render children?.()}
</button>

<style>
  .rail-tool {
    display: grid;
    width: 2rem;
    height: 2rem;
    flex: none;
    margin-left: 0.25rem;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--color-cover-ink) 22%, transparent);
    background: none;
    color: var(--color-cover-ink-muted);
    transition:
      color 150ms ease-out,
      border-color 150ms ease-out;
  }

  .rail-tool:is(:hover, :focus-visible, [aria-expanded="true"], [aria-pressed="true"]) {
    border-color: color-mix(in srgb, var(--color-cover-ink) 60%, transparent);
    color: var(--color-cover-ink);
  }

  .rail-tool:focus-visible {
    outline: 2px solid var(--color-cover-ink);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .rail-tool {
      transition: none;
    }
  }
</style>
