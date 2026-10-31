<script lang="ts">
  import { untrack } from "svelte";

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
  import { createCompletionScope } from "#lib/controllers/completion-scope.svelte.js";

  import SectionHeader from "./section-header.svelte";

  import type { Component } from "svelte";

  import type { CategoryKey } from "#lib/engine/categories.js";
  import type { CategoryProgress } from "#lib/engine/progress.js";
  import type { LocaleCode } from "#lib/types/locale.js";

  /**
   * How a category renders on `/everything`. `compact` asks a record-style view for its condensed form.
   */
  interface SectionContent {
    compact: boolean;
    component: Component<{ compact?: boolean; locale: LocaleCode }>;
  }

  const CONTENT: Record<CategoryKey, SectionContent> = {
    almanac: { compact: false, component: AlmanacContent },
    animals: { compact: false, component: AnimalsContent },
    cosmetics: { compact: false, component: CosmeticsContent },
    mines: { compact: true, component: MinesContent },
    museum: { compact: false, component: MuseumContent },
    quests: { compact: false, component: QuestsContent },
    recipes: { compact: false, component: RecipesContent },
    renown: { compact: true, component: RenownContent },
    skills: { compact: true, component: SkillsContent },
    villagers: { compact: true, component: VillagersContent },
  };

  let {
    completed = false,
    hasContent = $bindable(),
    key,
    locale,
    progress,
  }: {
    completed?: boolean;
    /** Whether this category shows anything in its list, for a page's Completed divider. */
    hasContent?: boolean;
    key: CategoryKey;
    locale: LocaleCode;
    progress: CategoryProgress;
  } = $props();

  const scope = createCompletionScope(untrack(() => completed));

  let content = $derived(CONTENT[key]);
  let visible = $derived(
    scope.hasContent(completed ? progress.completed > 0 : progress.completed < progress.total),
  );

  $effect(() => {
    hasContent = visible;
  });
</script>

<div class="contents" style="--primary: var(--color-category-{key})">
  <SectionHeader {key} {progress} {completed} {visible}>
    {#if content.compact}
      <content.component compact {locale} />
    {:else}
      <content.component {locale} />
    {/if}
  </SectionHeader>
</div>
