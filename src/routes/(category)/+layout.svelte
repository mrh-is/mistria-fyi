<script lang="ts">
  import { page } from "$app/state";
  import { Icon } from "$lib/components/icon";
  import PageHeader from "$lib/components/page-header.svelte";
  import { categoryForKey, type CategoryKey } from "$lib/data/categories.js";
  import { getCategoryProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  let { children } = $props();

  let key = $derived(page.url.pathname.slice(1) as CategoryKey);
  const { color, name } = $derived(categoryForKey(key));

  let progress = $derived(
    getCategoryProgress(key, {
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );
</script>

<svelte:head>
  <title>{name} — Harvest Helper</title>
</svelte:head>

<div class="flex flex-col gap-4 px-4 pb-4" style="--primary: var(--{color})">
  <PageHeader title={name} {progress}>
    {#snippet icon(cls)}
      <Icon.Category category={key} useCategoryColor class={cls} />
    {/snippet}
  </PageHeader>
  {@render children()}
</div>
