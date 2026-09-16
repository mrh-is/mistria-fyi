<script lang="ts">
  import CategoryCard from "$lib/components/category-card.svelte";

  import type { CategoryProgress } from "$lib/engine/progress.js";

  let { total }: { total: number } = $props();

  let progress: CategoryProgress = $derived({
    completed: 1416,
    filtered: total - 1416,
    total,
  });
</script>

<div class="og-card">
  <header>
    <h1>Mistria Field Guide</h1>
    <p>Your unofficial completion companion</p>
  </header>
  <div class="stripe-scale">
    <CategoryCard
      key="almanac"
      {progress}
      displayCategory={{
        color: "home-accent",
        description: "Track every collection, quest, skill, & more.",
        href: "/",
        icon: "all",
        name: "Everything",
      }}
    />
  </div>
</div>

<style>
  .og-card {
    position: fixed;
    inset: 0;
    width: 1200px;
    height: 630px;
    overflow: hidden;
    background: var(--paper);
  }

  header {
    position: absolute;
    top: 92px;
    left: 126px;
  }

  h1 {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: 102px;
    font-style: italic;
    font-weight: 400;
    line-height: 0.9;
    letter-spacing: -0.04em;
  }

  p {
    margin: 30px 0 0 4px;
    color: var(--ink-muted);
    font-family: var(--font-controls);
    font-size: 23px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .stripe-scale {
    position: absolute;
    top: 352px;
    left: 126px;
    width: 350px;
    transform: scale(2.48);
    transform-origin: top left;
  }
</style>
