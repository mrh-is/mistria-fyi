<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";

  import { weatherIcon } from "#lib/components/icon/icon-maps.js";
  import { Icon } from "#lib/components/icon/index.js";
  import { weathersForSeason } from "#lib/engine/world-state.js";
  import * as m from "#lib/paraglide/messages.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { seasonLabel, seasonLabelAbbr, weatherLabel } from "#lib/utils/format.js";
  import { page } from "$app/state";

  import type { Icon as AppIcon } from "@tabler/icons-svelte-runes";

  import type { Season, Weather } from "#lib/types/tracker-data.js";

  const seasons: Season[] = ["spring", "summer", "fall", "winter"];
  const allWeathers: Weather[] = ["calm", "inclement", "heavy_inclement", "special"];
  const TRANSITION_MS = 180;

  let currentSeason = $derived(userState.state.worldState.season);
  let availableWeathers = $derived(weathersForSeason(currentSeason));
  let hasSpecialWeather = $derived(availableWeathers.includes("special"));
  let weatherColumns = $derived(
    `repeat(3, minmax(0, 1fr)) minmax(0, ${hasSpecialWeather ? "1fr" : "0fr"})`,
  );

  interface WeatherSlot {
    icon: AppIcon;
    label: string;
  }

  function buildWeatherSlots(season: Season): Record<Weather, WeatherSlot> {
    return Object.fromEntries(
      allWeathers.map((weather) => [
        weather,
        { icon: weatherIcon(weather, season), label: weatherLabel(weather, season) },
      ]),
    ) as Record<Weather, WeatherSlot>;
  }

  function transitionDuration(): number {
    return prefersReducedMotion.current ? 0 : TRANSITION_MS;
  }

  let weatherSlotDisplay = $state(buildWeatherSlots(userState.state.worldState.season));
  const weatherSlotFading = $state(
    Object.fromEntries(allWeathers.map((weather) => [weather, false])) as Record<Weather, boolean>,
  );

  $effect(() => {
    const next = buildWeatherSlots(currentSeason);
    const changed = allWeathers.filter(
      (weather) =>
        next[weather].label !== weatherSlotDisplay[weather].label ||
        next[weather].icon !== weatherSlotDisplay[weather].icon,
    );
    if (changed.length === 0) return;
    for (const weather of changed) weatherSlotFading[weather] = true;
    const timeout = setTimeout(() => {
      weatherSlotDisplay = next;
      for (const weather of changed) weatherSlotFading[weather] = false;
    }, transitionDuration() / 2);
    return () => {
      clearTimeout(timeout);
    };
  });

  // Native radio-group keyboard model: arrows move selection (wrapping), Home & End jump.
  function moveRadioFocus(event: KeyboardEvent & { currentTarget: HTMLElement }): void {
    const step: Record<string, number> = {
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -1,
    };
    const group = event.currentTarget.closest('[role="radiogroup"]');
    if (!group) return;
    const radios = [...group.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)')];
    const current = radios.indexOf(event.currentTarget as HTMLButtonElement);
    let next: number | undefined;
    if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = radios.length - 1;
    } else if (event.key in step) {
      next = (current + (step[event.key] ?? 0) + radios.length) % radios.length;
    }
    if (current === -1 || next === undefined) return;
    event.preventDefault();
    radios[next]?.focus();
    radios[next]?.click();
  }
</script>

<div class="clock-panel">
  <div class="world-state-grid">
    <div>
      <p>{m.visibility_season_label()}</p>
      <div class="radio-strip" role="radiogroup" aria-label={m.visibility_season_label()}>
        {#each seasons as season (season)}
          {@const selected = season === currentSeason}
          <button
            type="button"
            role="radio"
            onkeydown={moveRadioFocus}
            aria-label={seasonLabel(season, page.data.locale)}
            aria-checked={selected}
            tabindex={selected ? 0 : -1}
            class="focus-visible:panel-segment-outline enabled:hover:panel-segment-outline"
            class:radio-strip__active={selected}
            onclick={() => {
              userState.setSeason(season);
            }}><Icon.Season {season} class="size-3" />{seasonLabelAbbr(season)}</button
          >
        {/each}
      </div>
    </div>

    <div>
      <p>{m.visibility_weather_label()}</p>
      <div
        class="radio-strip radio-strip--weather"
        role="radiogroup"
        aria-label={m.visibility_weather_label()}
        style:grid-template-columns={weatherColumns}
        style:transition-duration="{transitionDuration()}ms"
      >
        {#each allWeathers as weather (weather)}
          {@const selected = weather === userState.state.worldState.weather}
          {@const isSpecial = weather === "special"}
          {@const SlotIcon = weatherSlotDisplay[weather].icon}
          <div
            class="radio-strip__slot"
            class:radio-strip__slot--last-visible={!hasSpecialWeather &&
              weather === "heavy_inclement"}
          >
            <button
              type="button"
              role="radio"
              onkeydown={moveRadioFocus}
              aria-label={weatherLabel(weather, currentSeason)}
              aria-checked={selected}
              aria-hidden={isSpecial && !hasSpecialWeather}
              class="focus-visible:panel-segment-outline enabled:hover:panel-segment-outline"
              class:radio-strip__active={selected}
              disabled={isSpecial && !hasSpecialWeather}
              tabindex={selected && !(isSpecial && !hasSpecialWeather) ? 0 : -1}
              onclick={() => {
                userState.setWeather(weather);
              }}
            >
              <span
                class="radio-strip__content"
                style:opacity={weatherSlotFading[weather] ? 0 : 1}
                style:transition-duration="{transitionDuration() / 2}ms"
              >
                <SlotIcon class="size-3" />
                {weatherSlotDisplay[weather].label}
              </span>
            </button>
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  .clock-panel {
    padding: 11px 18px;
  }

  .world-state-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 8px;
  }

  .world-state-grid p {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 4px;
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-3xs);
  }

  .radio-strip {
    display: flex;
    min-width: 0;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 34%, transparent);
  }

  .radio-strip button {
    display: flex;
    min-width: 0;
    min-height: 44px;
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: 3px;
    overflow: hidden;
    padding: 4px 5px;
    border-right: 1px solid color-mix(in srgb, var(--color-ink-hairline) 28%, transparent);
    color: var(--color-ink-muted);
    background: var(--color-paper-sunken);
    font-family: var(--font-controls);
    font-size: var(--text-3xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (hover: hover) and (pointer: fine) {
    .radio-strip button {
      min-height: 34px;
    }
  }

  .radio-strip button,
  .radio-strip__content,
  .radio-strip--weather {
    transition-timing-function: ease-out;
  }

  .radio-strip__content {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    justify-content: center;
    gap: 3px;
    transition-property: opacity;
  }

  .radio-strip--weather {
    display: grid;
    transition-property: grid-template-columns;
  }

  .radio-strip__slot {
    min-width: 0;
    overflow: hidden;
  }

  .radio-strip__slot button {
    width: 100%;
    height: 100%;
  }

  .radio-strip > button:last-child,
  .radio-strip__slot:last-child button {
    border-right: 0;
  }

  .radio-strip__slot--last-visible button {
    border-right: 0;
  }

  .radio-strip .radio-strip__active {
    color: var(--color-ink);
    background: color-mix(in srgb, var(--primary) 12%, var(--color-paper-raised));
  }

  @media (max-width: 479px) {
    .world-state-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .radio-strip button,
    .radio-strip__content,
    .radio-strip--weather {
      transition-duration: 0.01ms !important;
      transition-delay: 0s !important;
    }
  }
</style>
