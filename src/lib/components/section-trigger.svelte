<!--
  The header surface shared by every tracker section: an expandable section's
  disclosure button, & the inert header a spoiler-hidden section shows in its
  place. Sharing it keeps their box & disclosure icon in step. Only the button
  is a control; the inert header's spoiler mask is the reveal target, so the row
  takes a fainter hover tint with no outline, pressed, or focused state.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAttributes, HTMLButtonAttributes } from "svelte/elements";

  type Props = (
    | (HTMLAttributes<HTMLDivElement> & { element: "div" })
    | (HTMLButtonAttributes & { element?: "button" })
  ) & { children: Snippet };

  let { children, class: className, element = "button", ...rest }: Props = $props();
</script>

{#if element === "div"}
  <div
    class={["section-trigger", "section-trigger--inert", className]}
    data-section-trigger
    {...rest as HTMLAttributes<HTMLDivElement>}
  >
    {@render children()}
  </div>
{:else}
  <button
    class={["section-trigger", className]}
    data-section-trigger
    type="button"
    {...rest as HTMLButtonAttributes}
  >
    {@render children()}
  </button>
{/if}

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

  button.section-trigger:is(:active, :focus-visible) {
    background: color-mix(in srgb, var(--primary) 7%, transparent);
    outline: 2px solid var(--primary);
    outline-offset: -2px;
  }

  @media (hover: hover) {
    button.section-trigger:hover {
      background: color-mix(in srgb, var(--primary) 7%, transparent);
      outline: 2px solid var(--primary);
      outline-offset: -2px;
    }

    .section-trigger--inert:hover {
      background: color-mix(in srgb, var(--primary) 3%, transparent);
    }
  }
</style>
