<script lang="ts">
  import { ArrowLeft, Search, X } from "@lucide/svelte";

  import AvailabilityToggle from "$lib/components/availability-toggle.svelte";
  import WorldStateSelector from "$lib/components/world-state-selector.svelte";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import type { Component } from "svelte";

  import type { CategoryProgress } from "$lib/engine/progress.js";

  let {
    icon: Icon,
    name,
    onSearch,
    progress,
    showWorldState = false,
  }: {
    icon: Component<{ class?: string }>;
    name: string;
    onSearch?: (query: string) => void;
    progress: CategoryProgress;
    showWorldState?: boolean;
  } = $props();

  let pct = $derived(
    progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0,
  );

  let filterValue = $state("");

  function handleFilterInput(e: Event) {
    const target = e.target as HTMLInputElement;
    filterValue = target.value;
    onSearch?.(filterValue);
  }

  function clearFilter() {
    filterValue = "";
    onSearch?.("");
  }
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

  {#if showWorldState}
    <WorldStateSelector />
    <AvailabilityToggle />
  {/if}

  {#if onSearch}
    <div class="relative">
      <Search class="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        class="px-9"
        placeholder="Filter by name..."
        type="text"
        value={filterValue}
        oninput={handleFilterInput}
      />
      {#if filterValue}
        <button
          class="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
          onclick={clearFilter}
          type="button"
        >
          <X class="size-4" />
        </button>
      {/if}
    </div>
  {/if}

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
