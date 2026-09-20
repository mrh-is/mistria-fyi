<script lang="ts">
  import AllCompleted from "$lib/components/all-completed.svelte";
  import { Icon } from "$lib/components/icon";
  import PageHeader from "$lib/components/page-header.svelte";
  import { CATEGORY_KEYS, sortCategoryKeysByName } from "$lib/data/categories.js";
  import { trackerIndex } from "$lib/data/index.js";
  import { getAllProgress, getOverallProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { registerSourceFilters } from "$lib/utils/source-filter-registration.svelte.js";

  import AlmanacSection from "./AlmanacSection.svelte";
  import AnimalsSection from "./AnimalsSection.svelte";
  import CosmeticsSection from "./CosmeticsSection.svelte";
  import MinesSection from "./MinesSection.svelte";
  import MuseumSection from "./MuseumSection.svelte";
  import QuestsSection from "./QuestsSection.svelte";
  import RecipesSection from "./RecipesSection.svelte";
  import RenownSection from "./RenownSection.svelte";
  import SkillsSection from "./SkillsSection.svelte";
  import VillagersSection from "./VillagersSection.svelte";

  import type { CategoryKey } from "$lib/data/categories.js";

  import type { PageProps } from "./$types";

  const sectionComponents: Record<CategoryKey, typeof AlmanacSection> = {
    almanac: AlmanacSection,
    animals: AnimalsSection,
    cosmetics: CosmeticsSection,
    mines: MinesSection,
    museum: MuseumSection,
    quests: QuestsSection,
    recipes: RecipesSection,
    renown: RenownSection,
    skills: SkillsSection,
    villagers: VillagersSection,
  };

  let { data }: PageProps = $props();

  let orderedCategories = $derived(sortCategoryKeysByName(CATEGORY_KEYS, data.locale));

  registerSourceFilters("all", () => trackerIndex.categorySourceTypes.all);

  let headerEl = $state<HTMLElement | undefined>(undefined);
  let headerH = $state(0);

  $effect(() => {
    if (!headerEl) return;
    const el = headerEl;
    const ro = new ResizeObserver(() => {
      headerH = el.offsetHeight;
    });
    ro.observe(headerEl);
    return () => {
      ro.disconnect();
    };
  });

  let progress = $derived(
    getAllProgress({
      availabilityWindows: userState.state.availabilityWindows,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );

  let overallProgress = $derived(getOverallProgress(progress));
</script>

<PageHeader bind:ref={headerEl} title="Everything" progress={overallProgress}>
  {#snippet icon(cls)}
    <Icon.Category category="all" useCategoryColor class={cls} />
  {/snippet}
</PageHeader>

<div class="flex flex-col gap-6 px-4 pb-4" style="--section-top: {headerH}px">
  {#each orderedCategories as category (category)}
    {@const SectionComponent = sectionComponents[category]}
    <SectionComponent locale={data.locale} progress={progress[category]} />
  {/each}

  <AllCompleted isAllCompleted={overallProgress.completed >= overallProgress.total} />
</div>
