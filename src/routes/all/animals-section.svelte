<script lang="ts">
  import AnimalsContent from "#lib/components/animals-content.svelte";
  import { userState } from "#lib/stores/user-state.svelte.js";

  import SectionHeader from "./section-header.svelte";

  import type { CategoryProgress } from "#lib/engine/progress.js";
  import type { LocaleCode } from "#lib/types/locale.js";

  const { locale, progress }: { locale: LocaleCode; progress: CategoryProgress } = $props();
</script>

{#if progress.completed < progress.total || userState.state.showCompleted}
  <section
    aria-labelledby="category-animals"
    class="flex flex-col gap-1"
    style="--primary: var(--cat-animals)"
  >
    <SectionHeader key="animals" {progress} />
    <AnimalsContent {locale} />
  </section>
{/if}
