<script lang="ts">
  import { ChevronDown } from "@lucide/svelte";
  import { prefersReducedMotion } from "svelte/motion";
  import { slide } from "svelte/transition";

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

  let seasonalityExpanded = $state(true);
  let sourcesExpanded = $state(true);

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
  let seasonalitySummary = $derived(
    userState.state.availabilityMode === "everything"
      ? "All items"
      : `${seasonLabel(currentSeason)} / ${weatherLabel(userState.state.worldState.weather, currentSeason)}`,
  );
  let sourceSummary = $derived(
    hiddenSourceCount === 0 ? "All shown" : `${hiddenSourceCount.toString()} hidden`,
  );

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
</script>

<div class="flex max-h-[70vh] flex-col gap-4 overflow-y-auto rounded-xl p-4">
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
        <span class="ml-auto text-xs text-muted-foreground">{seasonalitySummary}</span>
        <ChevronDown
          class="size-4 text-muted-foreground transition-transform motion-reduce:transition-none {seasonalityExpanded
            ? 'rotate-180'
            : ''}"
        />
      </button>

      <ToggleGroup.Root
        class="w-full rounded-md border border-input"
        type="single"
        value={userState.state.availabilityMode}
        onValueChange={(value) => {
          if (value) userState.setAvailabilityMode(value as AvailabilityMode);
        }}
      >
        <ToggleGroup.Item class="flex-1 text-xs" value="timely">Seasonal</ToggleGroup.Item>
        <ToggleGroup.Item class="flex-1 text-xs" value="available">Accessible</ToggleGroup.Item>
        <ToggleGroup.Item class="flex-1 text-xs" value="everything">All items</ToggleGroup.Item>
      </ToggleGroup.Root>

      {#if seasonalityExpanded && userState.state.availabilityMode !== "everything"}
        <div
          class="flex flex-col gap-3"
          transition:slide={{ duration: prefersReducedMotion.current ? 0 : 150 }}
        >
          <div>
            <p class="mb-1 text-xs font-medium text-muted-foreground">Season</p>
            <div class="grid grid-cols-4 gap-1">
              {#each seasons as season (season)}
                {@const selected = season === currentSeason}
                <button
                  class="flex flex-col items-center gap-1 rounded-lg p-1.5 text-xs transition-colors hover:bg-accent motion-reduce:transition-none {selected
                    ? 'bg-accent font-semibold text-foreground'
                    : 'text-muted-foreground'}"
                  type="button"
                  aria-pressed={selected}
                  onclick={() => {
                    userState.setSeason(season);
                  }}
                >
                  <Icon.Season {season} class="size-4" />
                  {seasonLabel(season)}
                </button>
              {/each}
            </div>
          </div>

          <div>
            <p class="mb-1 text-xs font-medium text-muted-foreground">Weather</p>
            <div class="flex justify-center gap-1">
              {#each availableWeathers as weather (weather)}
                {@const selected = weather === userState.state.worldState.weather}
                {@const WeatherIcon = weatherIcon(weather, currentSeason)}
                <button
                  class="flex w-1/4 flex-col items-center gap-1 rounded-lg p-1.5 text-xs transition-colors hover:bg-accent motion-reduce:transition-none {selected
                    ? 'bg-accent font-semibold text-foreground'
                    : 'text-muted-foreground'}"
                  type="button"
                  aria-pressed={selected}
                  onclick={() => {
                    userState.setWeather(weather);
                  }}
                >
                  <WeatherIcon class="size-4" />
                  {weatherLabel(weather, currentSeason)}
                </button>
              {/each}
            </div>
          </div>
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
        <div
          class="flex flex-col gap-2"
          transition:slide={{ duration: prefersReducedMotion.current ? 0 : 150 }}
        >
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

  <BlockySwitch
    checked={userState.state.showCompleted}
    onCheckedChange={() => {
      userState.toggleShowCompleted();
    }}
  >
    Show completed items
  </BlockySwitch>

  {#if filtersActive}
    <button
      class="w-full rounded-md border border-border py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground motion-reduce:transition-none"
      type="button"
      onclick={resetFilters}
    >
      Reset filters
    </button>
  {/if}
</div>
