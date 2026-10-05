<script lang="ts">
  import MinesContent from "#lib/components/mines-content.svelte";
  import { userState } from "#lib/stores/user-state.svelte.js";

  import SectionHeader from "./section-header.svelte";

  import type { CategoryProgress } from "#lib/engine/progress.js";
  import type { LocaleCode } from "#lib/types/locale.js";

  let { locale, progress }: { locale: LocaleCode; progress: CategoryProgress } = $props();
</script>

{#if progress.completed < progress.total || userState.state.showCompleted}
  <section
    aria-labelledby="category-mines"
    class="flex flex-col gap-1"
    style="--primary: var(--cat-mines)"
  >
    <SectionHeader key="mines" {progress} />
    <MinesContent compact {locale} />
  </section>
{/if}
