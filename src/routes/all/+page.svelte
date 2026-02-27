<script lang="ts">
  import { ArrowLeft, Layers } from "@lucide/svelte";

  import { resolve } from "$app/paths";
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

  let headerEl = $state<HTMLDivElement | null>(null);
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

  let overallCompleted = $derived(Object.values(progress).reduce((sum, p) => sum + p.completed, 0));
  let overallTotal = $derived(Object.values(progress).reduce((sum, p) => sum + p.total, 0));
  let overallPct = $derived(
    overallTotal > 0 ? Math.round((overallCompleted / overallTotal) * 100) : 0,
  );
</script>

<div
  bind:this={headerEl}
  class="sticky top-0 z-10 -mx-4 flex items-center gap-2 border-b border-border/50 bg-background px-4 pt-safe-or-4 pb-3"
>
  <a
    class="flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-foreground"
    href={resolve("/")}
    aria-label="Back to home"
  >
    <ArrowLeft class="size-5" />
  </a>
  <Layers class="size-5 text-muted-foreground" />
  <h1 class="flex-1 text-xl font-semibold">Everything</h1>
  <span class="shrink-0 text-sm text-muted-foreground">
    <span class="sm:hidden">{overallPct}%</span>
    <span class="hidden sm:inline">{overallCompleted}/{overallTotal}</span>
  </span>
</div>

<div class="flex flex-col gap-6 px-4 pb-4" style="--section-top: {headerH}px">
  <MuseumSection />
  <AlmanacSection />
  <AnimalsSection />
  <NpcsSection />
  <CosmeticsSection />
  <SkillsSection />
  <RenownSection />
  <QuestsSection />
  <MinesSection />

  {#if overallCompleted >= overallTotal && !userState.state.showCompleted}
    <p class="py-8 text-center text-base text-muted-foreground">
      All done! Toggle "Show completed" to review.
    </p>
  {/if}
</div>
