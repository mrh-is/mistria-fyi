<script lang="ts">
  import { onNavigate } from "$app/navigation";
  import { page } from "$app/state";

  import { routeFade } from "./route-fade.svelte.js";

  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();

  // A full load paints at full opacity; only client-side navigations fade the new page in. That
  // keeps a reload or direct visit from showing a half-faded page, which screenshots would catch.
  // `onNavigate` runs before the new page renders, so the remounted `<main>` gets the classes. A
  // query-only navigation keeps the same `<main>`, so it mustn't fade the page already showing.
  onNavigate(({ from, to }) => {
    if (to?.url.pathname !== from?.url.pathname) routeFade.active = true;
  });
</script>

{#key page.url.pathname}
  <main
    id="main-content"
    class={[
      "flex flex-1 flex-col",
      routeFade.active && "motion-safe:animate-in motion-safe:duration-200 motion-safe:fade-in",
    ]}
  >
    {@render children()}
  </main>
{/key}
