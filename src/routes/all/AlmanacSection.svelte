<script lang="ts">
  import AlmanacContent from "$lib/components/almanac-content.svelte";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import SectionHeader from "./SectionHeader.svelte";

  import type { CategoryProgress } from "$lib/engine/progress.js";
  import type { LocaleCode } from "$lib/types/locale.js";

  const { locale, progress }: { locale: LocaleCode; progress: CategoryProgress } = $props();
</script>

{#if progress.completed < progress.total || userState.state.showCompleted}
  <section
    aria-labelledby="category-almanac"
    class="flex flex-col gap-1"
    style="--primary: var(--cat-almanac)"
  >
    <SectionHeader key="almanac" {locale} {progress} />
    <AlmanacContent {locale} />
  </section>
{/if}
