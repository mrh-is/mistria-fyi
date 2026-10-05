<script lang="ts">
  import RenownCurrentRecord from "#lib/components/renown-current-record.svelte";
  import { userState } from "#lib/stores/user-state.svelte.js";

  import SectionHeader from "./section-header.svelte";

  import type { CategoryProgress } from "#lib/engine/progress.js";
  import type { LocaleCode } from "#lib/types/locale.js";

  let { locale, progress }: { locale: LocaleCode; progress: CategoryProgress } = $props();
</script>

{#if progress.completed < progress.total || userState.state.showCompleted}
  <section aria-labelledby="category-renown" style="--primary: var(--cat-renown)">
    <SectionHeader key="renown" {progress} />
    <RenownCurrentRecord compact {locale} />
  </section>
{/if}
