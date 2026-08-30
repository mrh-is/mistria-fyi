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
  <Card.Root class={variant === "danger" ? "border-red-200 dark:border-red-900" : undefined}>
    <Card.Header class="p-0">
      <Collapsible.Trigger
        class="flex w-full items-start gap-3 rounded-xl px-6 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <span class="flex min-w-0 flex-1 flex-col gap-1.5">
          <span
            class="leading-none font-semibold {variant === 'danger'
              ? 'text-red-600 dark:text-red-400'
              : ''}"
          >
            {title}
          </span>
          <span class="text-base text-muted-foreground">{summary}</span>
        </span>
        <Icon.UI
          type="disclosure"
          class="mt-0.5 size-5 shrink-0 text-muted-foreground transition-transform {open
            ? 'rotate-90'
            : ''}"
        />
      </Collapsible.Trigger>
    </Card.Header>
    <Collapsible.Content forceMount class="data-[state=closed]:hidden">
      <Card.Content>
        {@render children()}
      </Card.Content>
    </Collapsible.Content>
  </Card.Root>
</Collapsible.Root>
