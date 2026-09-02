<script lang="ts">
  import { Icon } from "$lib/components/icon/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";

  import type { Snippet } from "svelte";

  let {
    children,
    open = $bindable(false),
    summary,
    title,
    variant = "default",
  }: {
    children: Snippet;
    open?: boolean;
    summary: string;
    title: string;
    variant?: "danger" | "default";
  } = $props();
</script>

<Collapsible.Root bind:open>
  <Card.Root
    class={variant === "danger" ? "gap-0 border-red-200 py-0 dark:border-red-900" : "gap-0 py-0"}
  >
    <Card.Header class="gap-0 p-0">
      <Collapsible.Trigger
        class="flex w-full items-start gap-3 rounded-xl px-4 py-3 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <span class="flex min-w-0 flex-1 flex-col gap-0">
          <span
            class="leading-none font-semibold {variant === 'danger'
              ? 'text-red-700 dark:text-red-400'
              : ''}"
          >
            {title}
          </span>
          <span
            aria-hidden={open}
            class="overflow-hidden text-xs text-muted-foreground transition-[max-height,margin-top,opacity] duration-150 ease-out motion-reduce:transition-none {open
              ? 'mt-0 max-h-0 opacity-0'
              : 'mt-1.5 max-h-4 opacity-100'}"
          >
            {summary}
          </span>
        </span>
        <Icon.UI
          type="disclosure"
          class="mt-0.5 size-5 shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none {open
            ? 'rotate-90'
            : ''}"
        />
      </Collapsible.Trigger>
    </Card.Header>
    <Collapsible.Content
      forceMount
      aria-hidden={!open}
      inert={!open}
      class="grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none {open
        ? 'grid-rows-[1fr] opacity-100'
        : 'grid-rows-[0fr] opacity-0'}"
    >
      <div class="min-h-0 overflow-hidden">
        <Card.Content class="px-4 pt-2 pb-4">
          {@render children()}
        </Card.Content>
      </div>
    </Collapsible.Content>
  </Card.Root>
</Collapsible.Root>
