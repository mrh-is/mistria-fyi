<script lang="ts">
  import { ChevronDown, RotateCcw } from "@lucide/svelte";
  import { prefersReducedMotion } from "svelte/motion";
  import { fade, slide } from "svelte/transition";

  import BlockySwitch from "$lib/components/blocky-switch.svelte";
  import { weatherIcon } from "$lib/components/icon/icon-maps.js";
  import { Icon } from "$lib/components/icon/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { seasonLabel, weatherLabel, weathersForSeason } from "$lib/utils/format.js";

  import type { AvailabilityMode } from "$lib/stores/user-state.svelte.js";
  import type { Season } from "$lib/types/tracker-data.js";

  let { showSeasonality }: { showSeasonality: boolean } = $props();

  const seasons: Season[] = ["spring", "summer", "fall", "winter"];
  const labelWidth = "w-20 shrink-0";
  const transitionDuration = 150;

  let seasonalityExpanded = $state(false);
  let sourcesExpanded = $state(false);

  let currentSeason = $derived(userState.state.worldState.season);
  let availableWeathers = $derived(weathersForSeason(currentSeason));
  let filtersActive = $derived(
    userState.state.availabilityMode !== "available" ||
      userState.state.showCompleted ||
      toolbarState.sourceFilterActive,
  );
  let hiddenSourceCount = $derived(
    toolbarState.sourceFilters.length - toolbarState.activeSourceLabels.size,
  );
  let seasonSummary = $derived(seasonLabel(currentSeason));
  let weatherSummary = $derived(weatherLabel(userState.state.worldState.weather, currentSeason));
  let sourceSummary = $derived(
    hiddenSourceCount === 0 ? "All shown" : `${hiddenSourceCount.toString()} hidden`,
  );

  const availabilityModeLabel: Record<AvailabilityMode, string> = {
    available: "What's available now",
    everything: "Everything",
    timely: "Current specials",
  };

  $effect(() => {
    if (!availableWeathers.includes(userState.state.worldState.weather)) {
      userState.setWeather("calm");
    }
  });

  function resetFilters(): void {
    userState.setAvailabilityMode("available");
    if (userState.state.showCompleted) userState.toggleShowCompleted();
    toolbarState.resetSourceFilters();
  }

  function duration(): number {
    return prefersReducedMotion.current ? 0 : transitionDuration;
  }
</script>

<div class="flex max-h-[70vh] flex-col gap-3 overflow-y-auto rounded-xl p-4">
  {#if showSeasonality}
    <section class="flex flex-col gap-2" aria-label="Seasonality controls">
      <button
        class="flex min-h-11 w-full items-center gap-2 text-left"
        type="button"
        aria-expanded={seasonalityExpanded}
        onclick={() => {
          seasonalityExpanded = !seasonalityExpanded;
        }}
      >
        <span class="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Seasonality
        </span>
        <span class="ml-auto text-xs text-muted-foreground">
          {#if userState.state.availabilityMode === "everything"}
            Everything
          {:else}
            {#key seasonSummary}
              <span
                class="inline-block"
                in:fade={{ duration: duration() }}
                out:fade={{ duration: duration() }}
              >
                {seasonSummary}
              </span>
            {/key}
            <span class="opacity-50">/</span>
            {#key weatherSummary}
              <span
                class="inline-block"
                in:fade={{ duration: duration() }}
                out:fade={{ duration: duration() }}
              >
                {weatherSummary}
              </span>
            {/key}
          {/if}
        </span>
        <ChevronDown
          class="size-4 text-muted-foreground transition-transform {seasonalityExpanded
            ? 'rotate-180'
            : ''} motion-reduce:transition-none"
        />
      </button>

      {#if seasonalityExpanded}
        <div class="flex flex-col gap-2" transition:slide={{ duration: duration() }}>
          <div class="flex items-center gap-2">
            <p class="{labelWidth} text-xs font-medium text-muted-foreground">Only show</p>
            <ToggleGroup.Root
              class="flex-1 rounded-lg border border-input p-0.5"
              type="single"
              value={userState.state.availabilityMode}
              onValueChange={(value) => {
                if (value) userState.setAvailabilityMode(value as AvailabilityMode);
              }}
            >
              {#each ["timely", "available", "everything"] as const as mode (mode)}
                <ToggleGroup.Item class="flex-1 rounded-md text-xs" value={mode}>
                  {availabilityModeLabel[mode]}
                </ToggleGroup.Item>
              {/each}
            </ToggleGroup.Root>
          </div>

          {#if userState.state.availabilityMode !== "everything"}
            <div class="flex items-center gap-2">
              <p class="{labelWidth} text-xs text-muted-foreground">Season</p>
              <div class="flex flex-1 gap-0.5 rounded-lg border border-input p-0.5">
                {#each seasons as season (season)}
                  {@const selected = season === currentSeason}
                  <button
                    class="flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-accent motion-reduce:transition-none {selected
                      ? 'bg-accent font-semibold text-foreground'
                      : 'text-muted-foreground'}"
                    type="button"
                    aria-pressed={selected}
                    onclick={() => {
                      userState.setSeason(season);
                    }}
                  >
                    <Icon.Season {season} class="size-3.5" />
                    {seasonLabel(season)}
                  </button>
                {/each}
              </div>
            </div>

            <div class="flex items-center gap-2">
              <p class="{labelWidth} text-xs text-muted-foreground">Weather</p>
              {#key currentSeason}
                <div
                  class="flex flex-1 gap-0.5 rounded-lg border border-input p-0.5"
                  in:fade={{ duration: duration() }}
                  out:fade={{ duration: duration() }}
                >
                  {#each availableWeathers as weather (weather)}
                    {@const selected = weather === userState.state.worldState.weather}
                    {@const WeatherIcon = weatherIcon(weather, currentSeason)}
                    <button
                      class="flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-accent motion-reduce:transition-none {selected
                        ? 'bg-accent font-semibold text-foreground'
                        : 'text-muted-foreground'}"
                      type="button"
                      aria-pressed={selected}
                      onclick={() => {
                        userState.setWeather(weather);
                      }}
                    >
                      <WeatherIcon class="size-3.5" />
                      {weatherLabel(weather, currentSeason)}
                    </button>
                  {/each}
                </div>
              {/key}
            </div>
          {/if}
        </div>
      {/if}
    </section>
  {/if}

  {#if toolbarState.sourceFilters.length > 0}
    <section class="flex flex-col gap-2" aria-label="Source type controls">
      <button
        class="flex min-h-11 w-full items-center gap-2 text-left"
        type="button"
        aria-expanded={sourcesExpanded}
        onclick={() => {
          sourcesExpanded = !sourcesExpanded;
        }}
      >
        <span class="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Source types
        </span>
        <span class="ml-auto text-xs text-muted-foreground">{sourceSummary}</span>
        <ChevronDown
          class="size-4 text-muted-foreground transition-transform {sourcesExpanded
            ? 'rotate-180'
            : ''} motion-reduce:transition-none"
        />
      </button>

      {#if sourcesExpanded}
        <div class="flex flex-col gap-2" transition:slide={{ duration: duration() }}>
          <div class="flex justify-end gap-3">
            <button
              class="min-h-11 px-2 text-xs text-muted-foreground hover:text-foreground"
              type="button"
              onclick={() => {
                toolbarState.showAllSourceFilters();
              }}
            >
              Show all
            </button>
            <button
              class="min-h-11 px-2 text-xs text-muted-foreground hover:text-foreground"
              type="button"
              onclick={() => {
                toolbarState.hideAllSourceFilters();
              }}
            >
              Hide all
            </button>
          </div>
          <div class="flex flex-wrap gap-1.5">
            {#each toolbarState.sourceFilters as filter (filter.label)}
              {@const active = toolbarState.activeSourceLabels.has(filter.label)}
              {@const FilterIcon = filter.icon}
              <button
                class="inline-flex min-h-11 items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors motion-reduce:transition-none {active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:bg-muted'}"
                type="button"
                aria-pressed={active}
                onclick={() => {
                  toolbarState.toggleSourceFilter(filter);
                }}
              >
                <FilterIcon class="size-3" />
                {filter.label}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </section>
  {/if}

  <section class="flex min-h-8 items-center" aria-label="Completed items toggle">
    <span class="text-xs font-medium tracking-wide text-muted-foreground uppercase">
      Completed
    </span>
    <span class="ml-auto">
      <BlockySwitch
        checked={userState.state.showCompleted}
        onCheckedChange={() => {
          userState.toggleShowCompleted();
        }}
      >
        {userState.state.showCompleted ? "Shown" : "Hidden"}
      </BlockySwitch>
    </span>
  </section>

  {#if filtersActive}
    <button
      class="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground motion-reduce:transition-none"
      type="button"
      onclick={resetFilters}
    >
      <RotateCcw class="size-3.5" />
      Reset filters
    </button>
  {/if}
</div>
