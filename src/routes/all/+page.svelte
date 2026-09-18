<script lang="ts">
  import AllCompleted from "$lib/components/all-completed.svelte";
  import { Icon } from "$lib/components/icon";
  import PageHeader from "$lib/components/page-header.svelte";
  import { trackerIndex } from "$lib/data/index.js";
  import { getAllProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { registerSourceFilters } from "$lib/utils/source-filter-registration.svelte.js";

  import AlmanacSection from "./AlmanacSection.svelte";
  import AnimalsSection from "./AnimalsSection.svelte";
  import CosmeticsSection from "./CosmeticsSection.svelte";
  import MinesSection from "./MinesSection.svelte";
  import MuseumSection from "./MuseumSection.svelte";
  import NpcsSection from "./NpcsSection.svelte";
  import QuestsSection from "./QuestsSection.svelte";
  import RenownSection from "./RenownSection.svelte";
  import SkillsSection from "./SkillsSection.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

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

  let overallProgress = $derived({
    completed: Object.values(progress).reduce((sum, p) => sum + p.completed, 0),
    filtered: Object.values(progress).reduce((sum, p) => sum + p.filtered, 0),
    total: Object.values(progress).reduce((sum, p) => sum + p.total, 0),
  });
</script>

<PageHeader bind:ref={headerEl} title="Everything" progress={overallProgress}>
  {#snippet icon(cls)}
    <Icon.Category category="all" useCategoryColor class={cls} />
  {/snippet}
</PageHeader>

<div class="flex flex-col gap-6 px-4 pb-4" style="--section-top: {headerH}px">
  <MuseumSection locale={data.locale} progress={progress.museum} />
  <AlmanacSection locale={data.locale} progress={progress.almanac} />
  <AnimalsSection locale={data.locale} progress={progress.animals} />
  <NpcsSection locale={data.locale} progress={progress.npcs} />
  <CosmeticsSection locale={data.locale} progress={progress.cosmetics} />
  <SkillsSection locale={data.locale} progress={progress.skills} />
  <RenownSection locale={data.locale} progress={progress.renown} />
  <QuestsSection locale={data.locale} progress={progress.quests} />
  <MinesSection locale={data.locale} progress={progress.mines} />

  <AllCompleted isAllCompleted={overallProgress.completed >= overallProgress.total} />
</div>
