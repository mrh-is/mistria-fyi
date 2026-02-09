<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import { Progress } from "$lib/components/ui/progress/index.js";

  import type { Component } from "svelte";

  import type { CategoryProgress } from "$lib/engine/progress.js";

  let {
    href,
    icon: Icon,
    name,
    progress,
  }: {
    href: string;
    icon: Component<{ class?: string }>;
    name: string;
    progress: CategoryProgress;
  } = $props();

  let pct = $derived(progress.total > 0 ? (progress.completed / progress.total) * 100 : 0);
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- href is a known route path -->
<a class="block" {href}>
  <Card.Root class="hover:bg-accent/50 transition-colors">
    <Card.Content class="flex items-center gap-3 p-3">
      <div class="text-muted-foreground shrink-0">
        <Icon class="size-5" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline justify-between">
          <span class="text-sm font-medium">{name}</span>
          <span class="text-muted-foreground text-xs">{progress.completed}/{progress.total}</span>
        </div>
        <Progress class="mt-1 h-1.5" value={pct} />
        {#if progress.filtered > 0 && progress.filtered < progress.total - progress.completed}
          <span class="text-muted-foreground mt-0.5 block text-[10px]">
            {progress.filtered} available
          </span>
        {/if}
      </div>
    </Card.Content>
  </Card.Root>
</a>
