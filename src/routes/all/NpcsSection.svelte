<script lang="ts">
  import NpcRoster from "$lib/components/npc-roster.svelte";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import SectionHeader from "./SectionHeader.svelte";

  import type { CategoryProgress } from "$lib/engine/progress.js";
  import type { LocaleCode } from "$lib/types/locale.js";

  const { locale, progress }: { locale: LocaleCode; progress: CategoryProgress } = $props();
</script>

{#if progress.completed < progress.total || userState.state.showCompleted}
  <section aria-labelledby="category-npcs" style="--primary: var(--cat-npcs)">
    <SectionHeader key="npcs" {locale} {progress} />
    <NpcRoster compact {locale} />
  </section>
{/if}
