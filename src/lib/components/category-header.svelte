<script lang="ts">
  import { ArrowLeft, Search, X } from "@lucide/svelte";

  import AvailabilityToggle from "$lib/components/availability-toggle.svelte";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import WorldStateSelector from "$lib/components/world-state-selector.svelte";
  import { categoryColor, type CategoryMeta } from "$lib/data/categories.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import type { CategoryProgress } from "$lib/engine/progress.js";

  let {
    category,
    onSearch,
    progress,
    showWorldState = false,
  }: {
    category: CategoryMeta;
    onSearch?: (query: string) => void;
    progress: CategoryProgress;
    showWorldState?: boolean;
  } = $props();

  const Icon = $derived(category.icon);
  const color = $derived(categoryColor(category.key));

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

<div
  class="sticky top-0 z-10 -mx-4 flex flex-col gap-3 border-b border-border/50 bg-background px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3"
  style={color ? `--header-color: var(--${color})` : undefined}
>
  <div class="flex items-center gap-2">
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- known route -->
    <a class="text-muted-foreground hover:text-foreground" href="/">
      <ArrowLeft class="size-5" />
    </a>
    <Icon class={color ? "size-5 text-(--header-color)" : "size-5 text-muted-foreground"} />
    <h1 class="flex-1 text-xl font-semibold">{category.name}</h1>
    <span class="text-base text-muted-foreground">{pct}%</span>
    <span class="text-sm text-muted-foreground">({progress.completed}/{progress.total})</span>
  </div>

  {#if showWorldState}
    <WorldStateSelector />
    <AvailabilityToggle />
  {/if}

  {#if onSearch}
    <div class="relative">
      <Search class="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        class="px-9"
        placeholder="Filter by name..."
        type="text"
        value={filterValue}
        oninput={handleFilterInput}
      />
      {#if filterValue}
        <button
          class="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onclick={clearFilter}
          type="button"
        >
          <X class="size-4" />
        </button>
      {/if}
    </div>
  {/if}

  <label class="flex items-center gap-2 text-base">
    <Checkbox
      checked={userState.state.showCompleted}
      onCheckedChange={() => {
        userState.toggleShowCompleted();
      }}
    />
    Show completed
  </label>
</div>
