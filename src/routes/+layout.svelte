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
  class="mx-auto flex min-h-dvh max-w-lg flex-col bg-background"
  style={hasToolbar
    ? "padding-bottom: calc(56px + max(0.5rem, env(safe-area-inset-bottom)))"
    : undefined}
>
  {@render children()}
</div>

<ToolbarFooter />
<Toaster position="bottom-center" offset="calc(56px + max(0.5rem, env(safe-area-inset-bottom)))" />
