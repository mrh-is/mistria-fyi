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
    <p>Track every collection,<br />quest, skill &amp; more</p>
  </header>
  <div class="stripe-scale">
    <CategoryCard
      key="almanac"
      mobileRibbon
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
    left: 80px;
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
    margin: 28px 0 0 4px;
    color: #514b45;
    font-family: var(--font-annotation);
    font-size: 34px;
    line-height: 0.98;
  }

  .stripe-scale {
    position: absolute;
    top: 372px;
    left: 60px;
    width: 360px;
    transform: scale(3);
    transform-origin: top left;
  }
</style>
