<script lang="ts">
  import {
    ChevronDown,
    ChevronUp,
    CloudDrizzle,
    CloudLightning,
    CloudRain,
    CloudSnow,
    Flower,
    Leaf,
    ListFilter,
    Search,
    Snowflake,
    Sun,
    SunDim,
    Wind,
    X,
  } from "@lucide/svelte";
  import { flip } from "svelte/animate";
  import { fade, fly } from "svelte/transition";

  import { page } from "$app/state";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { seasonLabel, weatherLabel, weathersForSeason } from "$lib/utils/format.js";

  import type { Component } from "svelte";
  import type { TransitionConfig } from "svelte/transition";

  import type { AvailabilityMode } from "$lib/stores/user-state.svelte.js";
  import type { Season, Weather } from "$lib/types/tracker-data.js";

  type ActivePanel = "filters" | "world" | null;

  const seasons: Season[] = ["spring", "summer", "fall", "winter"];
  const SEASON_ICON: Record<Season, Component<{ class?: string; strokeWidth?: number }>> = {
    fall: Leaf,
    spring: Flower,
    summer: Sun,
    winter: Snowflake,
  };

  let currentSeason = $derived(userState.state.worldState.season);
  let CurrentSeasonIcon = $derived(SEASON_ICON[currentSeason]);
  let availableWeathers = $derived(weathersForSeason(currentSeason));

  function weatherIcon(weather: Weather, season: Season): Component<{ class?: string }> {
    if (weather === "calm") return SunDim;
    if (weather === "special") return Wind;
    if (weather === "heavy_inclement") return season === "winter" ? CloudDrizzle : CloudLightning;
    if (season === "winter") return CloudSnow;
    return CloudRain;
  }

  let CurrentWeatherIcon = $derived(weatherIcon(userState.state.worldState.weather, currentSeason));
  let currentWeatherLabel = $derived(
    weatherLabel(userState.state.worldState.weather, currentSeason),
  );

  // Enter transition: simple fade+scale, stays in flow so flip can measure correctly.
  function weatherTileIn(_node: Element): TransitionConfig {
    return {
      css: (t) => {
        const scale = 0.85 + 0.15 * t;
        return `opacity: ${t}; transform: scale(${scale})`;
      },
      duration: 180,
    };
  }

  // Exit transition: captures position then goes absolute so the leaving tile
  // stays pinned in its original spot while siblings flip into new positions.
  function weatherTileOut(node: Element): TransitionConfig {
    const rect = node.getBoundingClientRect();
    const parentRect = node.parentElement?.getBoundingClientRect() ?? rect;
    const left = rect.left - parentRect.left;
    const top = rect.top - parentRect.top;

    return {
      css: (t) => {
        const scale = 0.85 + 0.15 * t;
        return `position: absolute; left: ${String(left)}px; top: ${String(top)}px; width: ${String(rect.width)}px; opacity: ${t}; transform: scale(${scale})`;
      },
      duration: 180,
    };
  }

  /** Weather tiles derived from current season, keyed by display name for stable identity */
  interface WeatherTile {
    icon: Component<{ class?: string }>;
    label: string;
    weather: Weather;
  }

  let weatherTiles = $derived<WeatherTile[]>(
    availableWeathers.map((w) => ({
      icon: weatherIcon(w, currentSeason),
      label: weatherLabel(w, currentSeason),
      weather: w,
    })),
  );

  $effect(() => {
    if (!availableWeathers.includes(userState.state.worldState.weather)) {
      userState.setWeather("calm");
    }
  });

  // ── Route awareness ───────────────────────────────────────────────────────
  const WORLD_STATE_ROUTES = new Set(["/", "/almanac", "/animals", "/museum"]);

  let pathname = $derived(page.url.pathname);
  let hidden = $derived(pathname === "/settings");
  let showWorldState = $derived(WORLD_STATE_ROUTES.has(pathname));

  // ── Panel state ───────────────────────────────────────────────────────────
  let activePanel = $state<ActivePanel>(null);

  function togglePanel(panel: ActivePanel) {
    activePanel = panel === activePanel ? null : panel;
  }

  function closePanel() {
    activePanel = null;
  }

  // ── Search ────────────────────────────────────────────────────────────────
  let searchInput = $state<HTMLInputElement | null>(null);
  let debounceTimer: ReturnType<typeof setTimeout>;

  function handleSearchInput(e: Event) {
    const target = e.target as HTMLInputElement;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      toolbarState.setSearch(target.value);
    }, 200);
  }

  function openSearch() {
    closePanel();
    toolbarState.openSearch();
    setTimeout(() => searchInput?.focus(), 50);
  }

  function closeSearch() {
    clearTimeout(debounceTimer);
    toolbarState.closeSearch();
  }

  // ── Filter active state ───────────────────────────────────────────────────
  let filtersActive = $derived(
    userState.state.availabilityMode !== "available" ||
      userState.state.showCompleted ||
      userState.state.showSpoilers,
  );
</script>

{#if !hidden}
  <!-- Floating panel above toolbar -->
  {#if activePanel !== null}
    <!-- Backdrop -->
    <button class="fixed inset-0 z-20" onclick={closePanel} type="button" aria-label="Close panel"
    ></button>

    <!-- Floating card -->
    <div
      class="fixed right-0 bottom-safe-offset-14 left-0 z-30 mx-auto max-w-lg px-3"
      transition:fly={{ duration: 150, y: 8 }}
    >
      <div class="rounded-xl border border-border bg-background p-4 shadow-lg">
        {#if activePanel === "world"}
          <!-- Season row -->
          <p class="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Season
          </p>
          <div class="mb-4 grid grid-cols-4 gap-1">
            {#each seasons as s (s)}
              {@const Icon = SEASON_ICON[s]}
              {@const isSelected = s === currentSeason}
              <button
                class="flex flex-col items-center gap-1.5 rounded-lg p-2.5 text-xs transition-colors hover:bg-accent {isSelected
                  ? 'bg-accent font-semibold text-foreground'
                  : 'text-muted-foreground'}"
                onclick={() => {
                  userState.setSeason(s);
                }}
                type="button"
              >
                <Icon
                  class="size-5 {s === 'fall' ? '-scale-y-100 rotate-90' : ''}"
                  strokeWidth={s === "summer" ? 2.5 : undefined}
                />
                {seasonLabel(s)}
              </button>
            {/each}
          </div>

          <!-- Weather row -->
          <p class="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Weather
          </p>
          <div class="relative flex justify-center gap-1">
            {#each weatherTiles as tile (tile.weather)}
              {@const isSelected = tile.weather === userState.state.worldState.weather}
              <div
                class="w-1/4"
                animate:flip={{ duration: 200 }}
                in:weatherTileIn
                out:weatherTileOut
              >
                <button
                  class="flex w-full flex-col items-center gap-1.5 rounded-lg p-2.5 text-xs transition-colors hover:bg-accent {isSelected
                    ? 'bg-accent font-semibold text-foreground'
                    : 'text-muted-foreground'}"
                  onclick={() => {
                    userState.setWeather(tile.weather);
                  }}
                  type="button"
                >
                  <span class="relative inline-flex size-5">
                    {#key tile.label}
                      <span
                        class="absolute inset-0"
                        in:fade={{ delay: 75, duration: 150 }}
                        out:fade={{ duration: 75 }}
                      >
                        <tile.icon class="size-5" />
                      </span>
                    {/key}
                  </span>
                  <span class="relative inline-flex h-4 w-full items-center justify-center">
                    {#key tile.label}
                      <span
                        class="absolute inset-0 flex items-center justify-center"
                        in:fade={{ delay: 75, duration: 150 }}
                        out:fade={{ duration: 75 }}
                      >
                        {tile.label}
                      </span>
                    {/key}
                  </span>
                </button>
              </div>
            {/each}
          </div>
        {:else if activePanel === "filters"}
          <div class="flex flex-col gap-4">
            {#if showWorldState}
              <div class="flex flex-col gap-2">
                <p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Show items
                </p>
                <ToggleGroup.Root
                  class="w-full rounded-md border border-input"
                  type="single"
                  value={userState.state.availabilityMode}
                  onValueChange={(v) => {
                    if (v) userState.setAvailabilityMode(v as AvailabilityMode);
                  }}
                >
                  <ToggleGroup.Item class="flex-1 text-xs" value="timely">Seasonal</ToggleGroup.Item
                  >
                  <ToggleGroup.Item class="flex-1 text-xs" value="available"
                    >Accessible</ToggleGroup.Item
                  >
                  <ToggleGroup.Item class="flex-1 text-xs" value="everything"
                    >All items</ToggleGroup.Item
                  >
                </ToggleGroup.Root>
              </div>
            {/if}
            <label class="flex cursor-pointer items-center gap-3 text-sm">
              <Switch
                class="h-5 w-9 rounded-md px-px *:data-[slot=switch-thumb]:size-4 *:data-[slot=switch-thumb]:rounded-sm data-[state=checked]:bg-primary *:data-[slot=switch-thumb]:data-[state=checked]:translate-x-full data-[state=unchecked]:bg-input"
                checked={userState.state.showCompleted}
                onCheckedChange={() => {
                  userState.toggleShowCompleted();
                }}
              />
              Show completed items
            </label>
            <label class="flex cursor-pointer items-center gap-3 text-sm">
              <Switch
                class="h-5 w-9 rounded-md px-px *:data-[slot=switch-thumb]:size-4 *:data-[slot=switch-thumb]:rounded-sm data-[state=checked]:bg-primary *:data-[slot=switch-thumb]:data-[state=checked]:translate-x-full data-[state=unchecked]:bg-input"
                checked={userState.state.showSpoilers}
                onCheckedChange={() => {
                  userState.toggleShowSpoilers();
                }}
              />
              Show all spoilers
            </label>
            {#if filtersActive}
              <button
                class="w-full rounded-md border border-border py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onclick={() => {
                  userState.setAvailabilityMode("available");
                  if (userState.state.showCompleted) userState.toggleShowCompleted();
                  if (userState.state.showSpoilers) userState.toggleShowSpoilers();
                }}
                type="button"
              >
                Reset filters
              </button>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Toolbar bar -->
  <div
    class="pb-safe-offset-1.5 fixed right-0 bottom-0 left-0 z-20 mx-auto max-w-lg border-t border-border/50 bg-background pt-1.5"
  >
    {#if toolbarState.searchOpen}
      <div class="flex items-center gap-2 px-3">
        <div class="relative flex-1">
          <Search class="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            bind:ref={searchInput}
            class="px-9"
            placeholder="Search items..."
            type="text"
            value={toolbarState.searchQuery}
            oninput={handleSearchInput}
          />
          {#if toolbarState.searchQuery}
            <button
              class="absolute top-1/2 right-0 flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
              onclick={() => {
                toolbarState.setSearch("");
              }}
              type="button"
              aria-label="Clear search"
            >
              <X class="size-4" />
            </button>
          {/if}
        </div>
        <button
          class="min-h-11 px-2 text-sm text-muted-foreground hover:text-foreground"
          onclick={closeSearch}
          type="button"
        >
          Cancel
        </button>
      </div>
    {:else}
      <div class="flex items-center px-3">
        <!-- Left slot: Search (world-state pages only) -->
        <div class="flex flex-1 justify-start">
          {#if pathname === "/" || pathname === "/museum" || pathname === "/almanac"}
            <button
              class="flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onclick={openSearch}
              type="button"
              aria-label="Search"
            >
              <Search class="size-5" />
            </button>
          {/if}
        </div>

        <!-- Center slot: Season + Weather pill (world-state pages only) -->
        <div class="flex flex-1 justify-center">
          {#if showWorldState}
            <button
              class="flex min-h-11 items-center gap-1.5 rounded-lg border border-border/60 px-3 transition-colors hover:bg-accent {activePanel ===
              'world'
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground'}"
              onclick={() => {
                togglePanel("world");
              }}
              type="button"
              aria-label="Set season and weather"
              aria-expanded={activePanel === "world"}
            >
              <span class="relative inline-flex size-4">
                {#key currentSeason}
                  <span
                    class="absolute inset-0"
                    in:fade={{ delay: 75, duration: 150 }}
                    out:fade={{ duration: 75 }}
                  >
                    <CurrentSeasonIcon
                      class="size-4 {currentSeason === 'fall' ? '-scale-y-100 rotate-90' : ''}"
                      strokeWidth={currentSeason === "summer" ? 2.5 : undefined}
                    />
                  </span>
                {/key}
              </span>
              <span class="relative inline-flex size-4">
                {#key currentWeatherLabel}
                  <span
                    class="absolute inset-0"
                    in:fade={{ delay: 75, duration: 150 }}
                    out:fade={{ duration: 75 }}
                  >
                    <CurrentWeatherIcon class="size-4" />
                  </span>
                {/key}
              </span>
              {#if activePanel === "world"}
                <ChevronUp class="size-3 opacity-50" />
              {:else}
                <ChevronDown class="size-3 opacity-50" />
              {/if}
            </button>
          {/if}
        </div>

        <!-- Right slot: Filters (always) -->
        <div class="flex flex-1 justify-end">
          <button
            class="flex min-h-11 items-center gap-1.5 rounded-md px-3 transition-colors {activePanel ===
            'filters'
              ? 'bg-accent text-foreground'
              : filtersActive
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
            onclick={() => {
              togglePanel("filters");
            }}
            type="button"
            aria-label="Filters"
            aria-expanded={activePanel === "filters"}
          >
            <ListFilter class="size-4" />
            {#if activePanel === "filters"}
              <ChevronUp class="size-3 opacity-50" />
            {:else}
              <ChevronDown class="size-3 opacity-50" />
            {/if}
          </button>
        </div>
      </div>
    {/if}
  </div>
{/if}
