<script lang="ts">
  import VillagerRoster from "#lib/components/villager-roster.svelte";
  import { userState } from "#lib/stores/user-state.svelte.js";

  import SectionHeader from "./section-header.svelte";

  import type { CategoryProgress } from "#lib/engine/progress.js";
  import type { LocaleCode } from "#lib/types/locale.js";

  const { locale, progress }: { locale: LocaleCode; progress: CategoryProgress } = $props();
</script>

{#if progress.completed < progress.total || userState.state.showCompleted}
  <section aria-labelledby="category-villagers" style="--primary: var(--cat-villagers)">
    <SectionHeader key="villagers" {progress} />
    <VillagerRoster compact {locale} />
  </section>
{/if}
