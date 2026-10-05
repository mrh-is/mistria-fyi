<script lang="ts">
  import RecipesContent from "#lib/components/recipes-content.svelte";
  import { userState } from "#lib/stores/user-state.svelte.js";

  import SectionHeader from "./section-header.svelte";

  import type { CategoryProgress } from "#lib/engine/progress.js";
  import type { LocaleCode } from "#lib/types/locale.js";

  const { locale, progress }: { locale: LocaleCode; progress: CategoryProgress } = $props();
</script>

{#if progress.completed < progress.total || userState.state.showCompleted}
  <section
    aria-labelledby="category-recipes"
    class="flex flex-col gap-1"
    style="--primary: var(--cat-recipes)"
  >
    <SectionHeader key="recipes" {progress} />
    <RecipesContent {locale} />
  </section>
{/if}
