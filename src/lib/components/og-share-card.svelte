<script lang="ts">
  import CategoryCard from "#lib/components/category-card.svelte";
  import * as m from "#lib/paraglide/messages.js";

  import type { CategoryProgress } from "#lib/engine/progress.js";

  let { total }: { total: number } = $props();

  let progress: CategoryProgress = $derived({
    completed: 1416,
    filtered: total - 1416,
    total,
  });
</script>

<div class="og-card">
  <header>
    <h1>{m.app_name()}</h1>
    <p>{m.og_share_tagline()}</p>
  </header>
  <div class="stripe-scale">
    <CategoryCard
      key="almanac"
      mobileRibbon
      {progress}
      displayCompleted="??"
      displayCategory={{
        color: "fg-green",
        description: m.og_share_description(),
        href: "",
        icon: "all",
        name: m.home_everything_label(),
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
    /* stylelint-disable-next-line declaration-property-unit-disallowed-list -- fixed 1200×630 image */
    font-size: 102px;
    font-style: italic;
    font-weight: 400;
    line-height: 0.9;
    letter-spacing: -0.02em;
  }

  p {
    margin: 28px 0 0 4px;
    /* stylelint-disable-next-line color-no-hex -- a one-off ink tuned for the share image */
    color: #514b45;
    font-family: var(--font-annotation);
    /* stylelint-disable-next-line declaration-property-unit-disallowed-list -- fixed 1200×630 image */
    font-size: 40px;
    line-height: 0.98;
  }

  .stripe-scale {
    position: absolute;
    top: 372px;
    left: 60px;
    width: 360px;
    filter: drop-shadow(0 4px 10px color-mix(in srgb, var(--fg-green) 18%, transparent));
    transform: scale(3);
    transform-origin: top left;
  }
</style>
