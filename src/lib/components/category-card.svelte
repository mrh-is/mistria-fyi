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

  // Show available count when filtering is active (filtered < total - completed)
  let displayTotal = $derived(progress.completed + progress.filtered);
  let pct = $derived(displayTotal > 0 ? (progress.completed / displayTotal) * 100 : 0);
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- href is a known route path -->
<a class="block" {href}>
  <Card.Root class="hover:bg-accent/50 transition-colors">
    <Card.Content class="flex items-center gap-2 px-2.5 py-1">
      <div class="text-muted-foreground shrink-0">
        <Icon class="size-4" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline justify-between">
          <span class="text-sm font-medium">{name}</span>
          <span class="text-muted-foreground text-[10px]">{progress.completed}/{displayTotal}</span>
        </div>
        <Progress class="mt-0.5 h-1" value={pct} />
      </div>
    </Card.Content>
  </Card.Root>
</a>
