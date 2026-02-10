<script lang="ts">
  import { Loader2, Search, X } from "@lucide/svelte";

  import { Input } from "$lib/components/ui/input/index.js";

  let { onSearch }: { onSearch: (query: string) => void } = $props();

  let value = $state("");
  let searching = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout>;

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    value = target.value;
    searching = true;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      onSearch(value);
      searching = false;
    }, 200);
  }

  function clear() {
    clearTimeout(debounceTimer);
    value = "";
    searching = false;
    onSearch("");
  }
</script>

<div class="relative">
  {#if searching}
    <Loader2
      class="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2 animate-spin"
    />
  {:else}
    <Search class="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
  {/if}
  <Input class="px-9" placeholder="Search items..." type="text" {value} oninput={handleInput} />
  {#if value}
    <button
      class="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
      onclick={clear}
      type="button"
    >
      <X class="size-4" />
    </button>
  {/if}
</div>
