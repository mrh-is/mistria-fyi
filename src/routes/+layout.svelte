<script lang="ts">
  // Initialize theme store (side-effect: applies .dark class + syncs with localStorage)
  import "$lib/stores/theme.svelte.js";

  import "../app.css";

  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import ToolbarFooter from "$lib/components/toolbar-footer.svelte";
  import { Toaster } from "$lib/components/ui/sonner/index.js";
  import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";

  let { children } = $props();

  // Clear search when navigating so home search doesn't bleed into category pages
  afterNavigate(() => {
    toolbarState.closeSearch();
  });

  let hasToolbar = $derived(page.url.pathname !== "/settings");
</script>

<div
  class="mx-auto flex min-h-dvh max-w-lg flex-col bg-background {hasToolbar
    ? 'pb-safe-offset-14'
    : ''}"
>
  {#key page.url.pathname}
    <div class="flex flex-1 animate-in flex-col duration-200 fade-in">
      {@render children()}
    </div>
  {/key}
</div>

<ToolbarFooter />
<Toaster position="bottom-center" offset="calc(56px + env(safe-area-inset-bottom))" />
