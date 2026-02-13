<script lang="ts">
  import CategoryCard from "$lib/components/category-card.svelte";
  import { CATEGORIES } from "$lib/data/categories.js";
  import { getAllProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  let progress = $derived(
    getAllProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );
</script>

<div class="grid grid-cols-2 gap-2">
  {#each CATEGORIES as cat (cat.key)}
    <CategoryCard
      color={cat.color}
      href={cat.href}
      icon={cat.icon}
      name={cat.name}
      progress={progress[cat.key]}
    />
  {/each}
</div>
