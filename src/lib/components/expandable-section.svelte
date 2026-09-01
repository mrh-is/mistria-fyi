<script lang="ts">
  import { untrack } from "svelte";
  import { slide } from "svelte/transition";

  import { page } from "$app/state";
  import { Icon } from "$lib/components/icon/index.js";
  import { getFeedbackContextOrFallback } from "$lib/feedback/context.svelte.js";

  import type { Snippet } from "svelte";

  import type { FeedbackContext } from "$lib/feedback/context.svelte.js";

  let {
    children,
    count,
    defaultOpen = false,
    feedbackContext = getFeedbackContextOrFallback(),
    forceOpen = false,
    name,
    reportCategory,
    reportEntityId,
    reportExtra,
    total,
  }: {
    children: Snippet;
    count?: number;
    defaultOpen?: boolean;
    feedbackContext?: FeedbackContext;
    forceOpen?: boolean;
    name: string;
    reportCategory?: string;
    reportEntityId?: string;
    reportExtra?: Record<string, number | string>;
    total?: number;
  } = $props();
  let reportable = $derived(
    reportCategory
      ? feedbackContext.reportable({
          category: reportCategory,
          displayName: name,
          entityId: reportEntityId,
          extra: reportExtra,
          page: page.url.pathname,
        })
      : undefined,
  );

  let expanded = $state(untrack(() => defaultOpen));
  let isOpen = $derived(expanded || forceOpen);
</script>

<div>
  <button
    class="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-base hover:bg-accent/50"
    onclick={() => (expanded = !expanded)}
    type="button"
    aria-expanded={isOpen}
    {@attach reportable}
  >
    <Icon.UI
      type="disclosure"
      class="size-4 shrink-0 text-muted-foreground transition-transform {isOpen ? 'rotate-90' : ''}"
    />
    <span class="flex-1 font-medium">{name}</span>
    {#if total !== undefined && count !== undefined}
      <span class="text-sm text-muted-foreground">{count}/{total}</span>
    {/if}
  </button>

  {#if isOpen}
    <div class="pl-6" transition:slide={{ duration: 150 }}>
      {@render children()}
    </div>
  {/if}
</div>
