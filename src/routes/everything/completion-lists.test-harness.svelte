<script lang="ts">
  import { createSharedReveals } from "#lib/controllers/completion-scope.svelte.js";
  import { getAllProgress } from "#lib/engine/categories.js";
  import { userState } from "#lib/stores/user-state.svelte.js";

  import CategorySection from "./category-section.svelte";

  import type { CategoryKey } from "#lib/engine/categories.js";

  /** The page's two lists for a few categories, since rendering all of them is slow. */
  let { categories }: { categories: readonly CategoryKey[] } = $props();

  createSharedReveals();

  let progress = $derived(getAllProgress(userState.progressContext));
</script>

{#each categories as category (category)}
  <CategorySection key={category} locale="en" progress={progress[category]} />
{/each}
{#if userState.state.showCompleted}
  <div data-testid="everything-completed">
    {#each categories as category (category)}
      <CategorySection completed key={category} locale="en" progress={progress[category]} />
    {/each}
  </div>
{/if}
