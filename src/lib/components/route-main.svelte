<script lang="ts">
  import { page } from "$app/state";

  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<!-- Each route mounts fresh; the book shell turns the page between them. -->
{#key page.url.pathname}
  <main id="main-content" class="flex flex-1 flex-col">
    {@render children()}
  </main>
{/key}
