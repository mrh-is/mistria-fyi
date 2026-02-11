<script lang="ts">
  // Initialize theme store (side-effect: applies .dark class + syncs with localStorage)
  import "$lib/stores/theme.svelte.js";

  import "../app.css";

  let { children } = $props();
</script>

<div
  class="bg-background mx-auto flex min-h-dvh max-w-lg flex-col pb-[env(safe-area-inset-bottom)]"
>
  {@render children()}
</div>
