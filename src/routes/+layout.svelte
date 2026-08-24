<script lang="ts">
  // Initialize theme store (side-effect: applies .dark class + syncs with localStorage)
  import "$lib/stores/theme.svelte.js";

  import "../app.css";

  import { onMount } from "svelte";

  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import ToolbarFooter from "$lib/components/toolbar-footer.svelte";
  import { Toaster } from "$lib/components/ui/sonner/index.js";
  import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  let { children } = $props();

  // Clear search when navigating so home search doesn't bleed into category pages
  afterNavigate(() => {
    toolbarState.closeSearch();
  });

  onMount(() => {
    userState.restorePersistedState();
  });

  let hasToolbar = $derived(page.url.pathname !== "/settings" && page.url.pathname !== "/privacy");
</script>

<div
  class="mx-auto flex min-h-dvh max-w-lg flex-col bg-background {hasToolbar
    ? 'pb-safe-offset-14'
    : ''}"
>
  {#key page.url.pathname}
    <main class="flex flex-1 animate-in flex-col duration-200 fade-in">
      {@render children()}
    </main>
  {/key}
</div>

<ToolbarFooter hidden={!hasToolbar} />
<Toaster position="bottom-center" offset="calc(56px + env(safe-area-inset-bottom))" />
