<script lang="ts">
  import AllCompleted from "$lib/components/all-completed.svelte";
  import { Icon } from "$lib/components/icon";
  import PageHeader from "$lib/components/page-header.svelte";
  import { getAllProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import AlmanacSection from "./AlmanacSection.svelte";
  import AnimalsSection from "./AnimalsSection.svelte";
  import CosmeticsSection from "./CosmeticsSection.svelte";
  import MinesSection from "./MinesSection.svelte";
  import MuseumSection from "./MuseumSection.svelte";
  import NpcsSection from "./NpcsSection.svelte";
  import QuestsSection from "./QuestsSection.svelte";
  import RenownSection from "./RenownSection.svelte";
  import SkillsSection from "./SkillsSection.svelte";

  let headerEl = $state<HTMLDivElement | undefined>(undefined);
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
      availabilityMode: userState.state.availabilityMode,
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

<svelte:head>
  <title>Everything — Harvest Helper</title>
</svelte:head>

<PageHeader bind:ref={headerEl} title="Everything" progress={overallProgress}>
  {#snippet icon(cls)}
    <Icon.Category category="all" useCategoryColor class={cls} />
  {/snippet}
</PageHeader>

<div class="flex flex-col gap-6 px-4 pb-4" style="--section-top: {headerH}px">
  <MuseumSection progress={progress.museum} />
  <AlmanacSection progress={progress.almanac} />
  <AnimalsSection progress={progress.animals} />
  <NpcsSection progress={progress.npcs} />
  <CosmeticsSection progress={progress.cosmetics} />
  <SkillsSection progress={progress.skills} />
  <RenownSection progress={progress.renown} />
  <QuestsSection progress={progress.quests} />
  <MinesSection progress={progress.mines} />

  <AllCompleted isAllCompleted={overallProgress.completed >= overallProgress.total} />
</div>
