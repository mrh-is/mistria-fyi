<script lang="ts">
  import "../app.css";
  // Initialize theme store (side-effect: applies .dark class + syncs with localStorage)
  import "$lib/stores/theme.svelte.js";

  let { children } = $props();
</script>

<div class="bg-background mx-auto flex min-h-dvh max-w-lg flex-col">
  {@render children()}
</div>
