<script lang="ts">
  import { ArrowLeft } from "@lucide/svelte";

  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import type { Component } from "svelte";

  import type { CategoryProgress } from "$lib/engine/progress.js";

  let {
    icon: Icon,
    name,
    progress,
  }: {
    icon: Component<{ class?: string }>;
    name: string;
    progress: CategoryProgress;
  } = $props();

  let pct = $derived(
    progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0,
  );
</script>

<div class="flex flex-col gap-3">
  <div class="flex items-center gap-2">
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- known route -->
    <a class="text-muted-foreground hover:text-foreground" href="/">
      <ArrowLeft class="size-5" />
    </a>
    <Icon class="text-muted-foreground size-5" />
    <h1 class="flex-1 text-lg font-semibold">{name}</h1>
    <span class="text-muted-foreground text-sm">{pct}%</span>
    <span class="text-muted-foreground text-xs">({progress.completed}/{progress.total})</span>
  </div>

  <label class="flex items-center gap-2 text-sm">
    <Checkbox
      checked={userState.state.showCompleted}
      onCheckedChange={() => {
        userState.toggleShowCompleted();
      }}
    />
    Show completed
  </label>
</div>
