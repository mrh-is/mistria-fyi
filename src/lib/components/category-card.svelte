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
  <Card.Root class="hover:bg-accent/50 active:bg-accent/70 gap-0 py-4 transition-colors">
    <Card.Content class="flex flex-col gap-2 px-4">
      <div class="flex items-center gap-2">
        <Icon class="text-muted-foreground size-4 shrink-0" />
        <span class="min-w-0 flex-1 text-sm font-medium">{name}</span>
        <span class="text-muted-foreground shrink-0 text-xs">
          <span class="sm:hidden">{Math.round(pct)}%</span>
          <span class="hidden sm:inline">{progress.completed}/{displayTotal}</span>
        </span>
      </div>
      <Progress class="h-1.5" value={pct} />
    </Card.Content>
  </Card.Root>
</a>
