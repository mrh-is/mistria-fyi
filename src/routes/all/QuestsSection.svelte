<script lang="ts">
  import QuestsContent from "#lib/components/quests-content.svelte";
  import { userState } from "#lib/stores/user-state.svelte.js";

  import SectionHeader from "./SectionHeader.svelte";

  import type { CategoryProgress } from "#lib/engine/progress.js";
  import type { LocaleCode } from "#lib/types/locale.js";

  const { locale, progress }: { locale: LocaleCode; progress: CategoryProgress } = $props();
</script>

{#if progress.completed < progress.total || userState.state.showCompleted}
  <section
    aria-labelledby="category-quests"
    class="flex flex-col gap-1"
    style="--primary: var(--cat-quests)"
  >
    <SectionHeader key="quests" {progress} />
    <QuestsContent {locale} />
  </section>
{/if}
