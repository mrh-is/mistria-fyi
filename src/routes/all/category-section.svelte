<script lang="ts">
  import AlmanacContent from "#lib/components/almanac-content.svelte";
  import AnimalsContent from "#lib/components/animals-content.svelte";
  import CosmeticsContent from "#lib/components/cosmetics-content.svelte";
  import MinesContent from "#lib/components/mines-content.svelte";
  import MuseumContent from "#lib/components/museum-content.svelte";
  import QuestsContent from "#lib/components/quests-content.svelte";
  import RecipesContent from "#lib/components/recipes-content.svelte";
  import RenownContent from "#lib/components/renown-content.svelte";
  import SkillsContent from "#lib/components/skills-content.svelte";
  import VillagersContent from "#lib/components/villagers-content.svelte";
  import { userState } from "#lib/stores/user-state.svelte.js";

  import SectionHeader from "./section-header.svelte";

  import type { Component } from "svelte";

  import type { CategoryKey } from "#lib/data/categories.js";
  import type { CategoryProgress } from "#lib/engine/progress.js";
  import type { LocaleCode } from "#lib/types/locale.js";

  /**
   * How a category renders on `/all`. `compact` asks a record-style view for its condensed form;
   * `stacked` spaces a list of sections under the header.
   */
  interface SectionContent {
    compact: boolean;
    component: Component<{ compact?: boolean; locale: LocaleCode }>;
    stacked: boolean;
  }

  const CONTENT: Record<CategoryKey, SectionContent> = {
    almanac: { compact: false, component: AlmanacContent, stacked: true },
    animals: { compact: false, component: AnimalsContent, stacked: true },
    cosmetics: { compact: false, component: CosmeticsContent, stacked: true },
    mines: { compact: true, component: MinesContent, stacked: true },
    museum: { compact: false, component: MuseumContent, stacked: true },
    quests: { compact: false, component: QuestsContent, stacked: true },
    recipes: { compact: false, component: RecipesContent, stacked: true },
    renown: { compact: true, component: RenownContent, stacked: false },
    skills: { compact: true, component: SkillsContent, stacked: false },
    villagers: { compact: true, component: VillagersContent, stacked: false },
  };

  let {
    key,
    locale,
    progress,
  }: { key: CategoryKey; locale: LocaleCode; progress: CategoryProgress } = $props();

  let content = $derived(CONTENT[key]);
</script>

{#if progress.completed < progress.total || userState.state.showCompleted}
  <section
    aria-labelledby="category-{key}"
    class={content.stacked ? "flex flex-col gap-1" : undefined}
    style="--primary: var(--cat-{key})"
  >
    <SectionHeader {key} {progress} />
    {#if content.compact}
      <content.component compact {locale} />
    {:else}
      <content.component {locale} />
    {/if}
  </section>
{/if}
