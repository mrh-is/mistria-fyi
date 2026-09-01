<script lang="ts">
  import { ChevronDown, RotateCcw } from "@lucide/svelte";
  import { prefersReducedMotion } from "svelte/motion";
  import { slide } from "svelte/transition";

  import { weatherIcon } from "$lib/components/icon/icon-maps.js";
  import { Icon } from "$lib/components/icon/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { seasonLabel, weatherLabel, weathersForSeason } from "$lib/utils/format.js";

  import type { LucideIcon } from "@lucide/svelte";

  import type { AvailabilityMode } from "$lib/stores/user-state.svelte.js";
  import type { Season, Weather } from "$lib/types/tracker-data.js";

  let { showSeasonality }: { showSeasonality: boolean } = $props();

  const seasons: Season[] = ["spring", "summer", "fall", "winter"];
  const allWeathers: Weather[] = ["calm", "inclement", "heavy_inclement", "special"];
  const labelWidth = "w-20 shrink-0";
  const TRANSITION_MS = 120;
  const SESSION_KEY_SEASONALITY = "filter-panel-seasonality-expanded";
  const SESSION_KEY_SOURCES = "filter-panel-sources-expanded";

  function readSessionFlag(key: string, fallback: boolean): boolean {
    if (typeof window === "undefined") return fallback;
    try {
      const stored = sessionStorage.getItem(key);
      return stored === null ? fallback : stored === "true";
    } catch {
      return fallback;
    }
  }

  function writeSessionFlag(key: string, value: boolean): void {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(key, String(value));
    } catch {
      // blocked
    }
  }

  let seasonalityExpanded = $state(readSessionFlag(SESSION_KEY_SEASONALITY, false));
  let sourcesExpanded = $state(readSessionFlag(SESSION_KEY_SOURCES, false));

  $effect(() => {
    writeSessionFlag(SESSION_KEY_SEASONALITY, seasonalityExpanded);
  });
  $effect(() => {
    writeSessionFlag(SESSION_KEY_SOURCES, sourcesExpanded);
  });

  let currentSeason = $derived(userState.state.worldState.season);
  let availableWeathers = $derived(weathersForSeason(currentSeason));
  let hasSpecialWeather = $derived(availableWeathers.includes("special"));
  let filtersActive = $derived(
    userState.state.availabilityMode !== "available" ||
      userState.state.showCompleted ||
      toolbarState.sourceFilterActive,
  );
  let hiddenSourceCount = $derived(
    toolbarState.sourceFilters.length - toolbarState.activeSourceLabels.size,
  );
  let sourceSummary = $derived(
    hiddenSourceCount === 0 ? "All shown" : `${hiddenSourceCount.toString()} hidden`,
  );

  const availabilityModeLabel: Record<AvailabilityMode, string> = {
    available: "What's available now",
    everything: "Everything",
    timely: "Current specials",
  };

  // Sequential fade transition for summary text: fade out → swap → fade in
  let seasonDisplay = $state(seasonLabel(userState.state.worldState.season));
  let weatherDisplay = $state(
    weatherLabel(userState.state.worldState.weather, userState.state.worldState.season),
  );
  let seasonFading = $state(false);
  let weatherFading = $state(false);

  $effect(() => {
    const next = seasonLabel(currentSeason);
    if (next !== seasonDisplay) {
      seasonFading = true;
      setTimeout(() => {
        seasonDisplay = next;
        seasonFading = false;
      }, duration());
    }
  });

  $effect(() => {
    const next = weatherLabel(userState.state.worldState.weather, currentSeason);
    if (next !== weatherDisplay) {
      weatherFading = true;
      setTimeout(() => {
        weatherDisplay = next;
        weatherFading = false;
      }, duration());
    }
  });

  // Weather button content transitions: fade icons/labels when they change per-slot
  interface WeatherSlot {
    icon: LucideIcon;
    label: string;
  }

  function buildWeatherSlots(season: Season): Record<Weather, WeatherSlot> {
    return Object.fromEntries(
      allWeathers.map((w) => [w, { icon: weatherIcon(w, season), label: weatherLabel(w, season) }]),
    ) as Record<Weather, WeatherSlot>;
  }

  let weatherSlotDisplay = $state(buildWeatherSlots(userState.state.worldState.season));
  let weatherSlotFading = $state(
    Object.fromEntries(allWeathers.map((w) => [w, false])) as Record<Weather, boolean>,
  );

  $effect(() => {
    for (const w of allWeathers) {
      const nextLabel = weatherLabel(w, currentSeason);
      const nextIcon = weatherIcon(w, currentSeason);
      if (nextLabel !== weatherSlotDisplay[w].label || nextIcon !== weatherSlotDisplay[w].icon) {
        weatherSlotFading[w] = true;
        const weather = w;
        setTimeout(() => {
          weatherSlotDisplay[weather] = { icon: nextIcon, label: nextLabel };
          weatherSlotFading[weather] = false;
        }, duration());
      }
    }
  });

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
    return prefersReducedMotion.current ? 0 : TRANSITION_MS;
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
            <span
              class="inline-block transition-opacity motion-reduce:transition-none"
              style:transition-duration="{duration()}ms"
              style:opacity={seasonFading ? 0 : 1}
            >
              {seasonDisplay}
            </span>
            <span class="opacity-50">/</span>
            <span
              class="inline-block transition-opacity motion-reduce:transition-none"
              style:transition-duration="{duration()}ms"
              style:opacity={weatherFading ? 0 : 1}
            >
              {weatherDisplay}
            </span>
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
            <div class="flex flex-1 gap-0.5 rounded-lg border border-input p-0.5">
              <ToggleGroup.Root
                class="flex flex-1"
                type="single"
                value={userState.state.availabilityMode}
                onValueChange={(value) => {
                  if (value) userState.setAvailabilityMode(value as AvailabilityMode);
                }}
              >
                {#each ["timely", "available", "everything"] as const as mode (mode)}
                  <ToggleGroup.Item class="flex-1 rounded-full px-2.5 py-1 text-xs" value={mode}>
                    {availabilityModeLabel[mode]}
                  </ToggleGroup.Item>
                {/each}
              </ToggleGroup.Root>
            </div>
          </div>

          {#if userState.state.availabilityMode !== "everything"}
            <div class="flex items-center gap-2">
              <p class="{labelWidth} text-xs text-muted-foreground">Season</p>
              <div class="flex flex-1 gap-0.5 rounded-lg border border-input p-0.5">
                {#each seasons as season (season)}
                  {@const selected = season === currentSeason}
                  <button
                    class="flex flex-1 items-center justify-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors hover:bg-accent motion-reduce:transition-none {selected
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
              <div
                class="flex flex-1 gap-0.5 rounded-lg border border-input p-0.5 transition-[width] motion-reduce:transition-none"
                style:transition-duration="{duration()}ms"
              >
                {#each allWeathers as weather (weather)}
                  {@const selected = weather === userState.state.worldState.weather}
                  {@const isSpecial = weather === "special"}
                  {@const SlotIcon = weatherSlotDisplay[weather].icon}
                  {#if !isSpecial || hasSpecialWeather}
                    <button
                      class="flex flex-1 items-center justify-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors hover:bg-accent motion-reduce:transition-none {selected
                        ? 'bg-accent font-semibold text-foreground'
                        : 'text-muted-foreground'}"
                      type="button"
                      aria-pressed={selected}
                      onclick={() => {
                        userState.setWeather(weather);
                      }}
                      transition:slide={{ axis: "x", duration: isSpecial ? duration() : 0 }}
                    >
                      <span
                        class="inline-flex items-center gap-1 transition-opacity motion-reduce:transition-none"
                        style:transition-duration="{duration()}ms"
                        style:opacity={weatherSlotFading[weather] ? 0 : 1}
                      >
                        <SlotIcon class="size-3.5" />
                        {weatherSlotDisplay[weather].label}
                      </span>
                    </button>
                  {/if}
                {/each}
              </div>
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
      Show completed items
    </span>
    <Switch
      class="ml-auto h-5 w-9 rounded-md px-px *:data-[slot=switch-thumb]:size-4 *:data-[slot=switch-thumb]:rounded-sm data-[state=checked]:bg-primary *:data-[slot=switch-thumb]:data-[state=checked]:translate-x-full data-[state=unchecked]:bg-input"
      checked={userState.state.showCompleted}
      onCheckedChange={() => {
        userState.toggleShowCompleted();
      }}
      aria-label="Show completed items"
    />
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
