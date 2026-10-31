<script lang="ts">
  import { onMount, untrack } from "svelte";

  import { Icon } from "#lib/components/icon/index.js";

  import type { Snippet } from "svelte";

  let {
    children,
    completed = false,
    count,
    description,
    icon,
    id,
    name,
    revealTarget = "",
    visible = true,
  }: {
    children: Snippet;
    completed?: boolean;
    count?: Snippet;
    description?: string;
    icon: Snippet;
    id: string;
    name: string;
    revealTarget?: string;
    visible?: boolean;
  } = $props();
  let open = $state(untrack(() => !completed));
  let hydrated = $state(false);
  onMount(() => {
    hydrated = true;
  });
  const instanceId = $props.id();
  let contentId = $derived(`group-${instanceId}`);
  $effect(() => {
    if (revealTarget) open = true;
  });
</script>

<section aria-labelledby={id} hidden={!visible}>
  <h2
    {id}
    class="sticky z-[var(--z-section-header)] -mx-4 scroll-mt-32 bg-background"
    style="top: var(--section-header-sticky-top, 0px)"
  >
    <button
      type="button"
      class="flex min-h-11 w-full items-center gap-2 px-6 py-2 text-left text-sm font-semibold tracking-wide focus-visible:outline-2 focus-visible:outline-ring"
      aria-label={name}
      aria-describedby={description ? `${contentId}-description` : undefined}
      disabled={!hydrated}
      aria-busy={!hydrated}
      aria-expanded={open}
      aria-controls={contentId}
      onclick={() => {
        open = !open;
      }}
    >
      <Icon.UI
        type="disclosure"
        class="size-4 shrink-0 transition-transform motion-reduce:transition-none {open
          ? 'rotate-90'
          : ''}"
      />
      {@render icon()}
      <span class="flex-1">{name}</span>
      {#if count}{@render count()}{/if}
    </button>
  </h2>
  {#if description}<span id="{contentId}-description" class="sr-only">{description}</span>{/if}
  <div id={contentId} hidden={!open} class="flex flex-col gap-1">
    {@render children()}
  </div>
</section>
