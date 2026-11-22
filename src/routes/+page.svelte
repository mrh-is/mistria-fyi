<script lang="ts">
  import { onMount } from "svelte";

  import { trackVisualViewport } from "#lib/attachments/visual-viewport.js";
  import { getBookPanels } from "#lib/components/book/book-panels.svelte.js";
  import ThumbTabIcon from "#lib/components/book/thumb-tab-icon.svelte";
  import SearchResults from "#lib/components/search-results.svelte";
  import GotItNote from "#lib/components/sync/got-it-note.svelte";
  import SyncTroubleNote from "#lib/components/sync/sync-trouble-note.svelte";
  import { categoryForKey } from "#lib/data/categories.js";
  import { trackerData } from "#lib/data/index.js";
  import { getName, nameCollator } from "#lib/data/names.js";
  import { SITE_NAME } from "#lib/data/site.js";
  import { CATEGORY_KEYS, getAllProgress } from "#lib/engine/categories.js";
  import {
    DAYS_PER_SEASON,
    gameDayOfYear,
    gameDaysBetween,
    SEASONS_PER_YEAR,
  } from "#lib/engine/game-calendar.js";
  import { MAX_HEART_LEVEL } from "#lib/engine/progress.js";
  import { projectVillagers } from "#lib/engine/projections/villagers.js";
  import plural from "#lib/i18n/catalogs/plural.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { progressImport, userState } from "#lib/stores/user-state.svelte.js";
  import { formatNumber, seasonLabel, weatherLabel } from "#lib/utils/format.js";
  import { localizedHref } from "#lib/utils/localized-href.js";

  import { HOME_PLACES_WARNING_LIMIT, projectHomePlaces } from "./home-places.js";
  import TodaysPlaces from "./todays-places.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
  const panels = getBookPanels();
  let content = $state<HTMLDivElement>();
  let mounted = $state(false);
  onMount(() => {
    mounted = true;
  });

  // A replacement query reveals from the beginning, including across locale navigation.
  $effect.pre(() => {
    const _query = toolbarState.searchQuery;
    const _locale = data.locale;
    if (content) content.scrollTop = 0;
  });

  let locale = $derived(data.locale);
  let bookOwner = $derived(progressImport.lastImport);
  let clock = $derived(userState.state.worldState);
  let noSave = $derived(
    !bookOwner &&
      !clock.saveDate &&
      !userState.syncLane &&
      userState.trackingLane === undefined &&
      !userState.hasAnyProgress &&
      clock.day === undefined &&
      clock.year === undefined &&
      clock.season === "spring" &&
      clock.weather === "calm",
  );
  let day = $derived(noSave ? 1 : clock.day);
  let year = $derived(noSave ? 1 : clock.year);
  let season = $derived(seasonLabel(clock.season, locale));
  let weather = $derived(weatherLabel(clock.weather, clock.season));
  let date = $derived.by(() => {
    if (day === undefined) return "Which day is it?";
    const dayNumber = formatNumber(day, locale);
    if (year === undefined) return /* @wc-include */ `${season} ${dayNumber}`;
    return `${season} ${dayNumber}, Year ${formatNumber(year, locale)}`;
  });
  let saveAge = $derived(
    clock.saveDate && day !== undefined && year !== undefined
      ? gameDaysBetween(clock.saveDate, { day, season: clock.season, year })
      : undefined,
  );

  let context = $derived(userState.progressContext);
  let allProgress = $derived(getAllProgress(context));
  let projection = $derived(
    mounted
      ? projectHomePlaces({
          ...context,
          worldState: { ...clock, day },
        })
      : { places: [], total: 0 },
  );
  let open = $derived(formatNumber(projection.total, locale));
  $effect(() => {
    if (import.meta.env.DEV && projection.total > HOME_PLACES_WARNING_LIMIT) {
      // oxlint-disable-next-line no-console -- The development warning flags missing availability gates.
      console.warn(
        `Home counts ${projection.total} open things. Check for a missing availability gate.`,
      );
    }
  });

  const yearLength = DAYS_PER_SEASON * SEASONS_PER_YEAR;
  let villagers = $derived(projectVillagers(context).rows.filter(({ locked }) => !locked));
  let birthdays = $derived.by(() => {
    if (day === undefined) return [];
    const today = gameDayOfYear({ day, season: clock.season });
    return villagers
      .map(({ id }) => {
        const birthday = trackerData.villagers[id].birthday;
        const offset = (gameDayOfYear(birthday) - today + yearLength) % yearLength;
        return { birthday, id, offset };
      })
      .filter(({ offset }) => offset < 7)
      .toSorted((a, b) => a.offset - b.offset)
      .slice(0, 3);
  });
  let heartsToGo = $derived(
    villagers
      .filter(({ hearts }) => hearts > 0 && hearts < MAX_HEART_LEVEL)
      .map(({ hearts, id }) => ({
        id,
        name: getName("villagers", id, locale),
        remaining: MAX_HEART_LEVEL - hearts,
      }))
      .toSorted((a, b) => a.remaining - b.remaining || nameCollator(locale).compare(a.name, b.name))
      .slice(0, 6),
  );
  let importHref = $derived(`${localizedHref("data")}?section=import`);
</script>

<div
  class="home-page"
  class:home-page--searching={toolbarState.searchOpen}
  data-ledger-layout
  {@attach toolbarState.searchOpen ? trackVisualViewport : undefined}
>
  {#if toolbarState.searchQuery}
    <header class="search-header">
      <h1 class="font-brand text-3xl">{SITE_NAME}</h1>
    </header>
    <div class="search-content px-4 pb-4" bind:this={content}>
      <SearchResults {locale} query={toolbarState.searchQuery} />
    </div>
  {:else}
    <div class="title-page">
      <h1>{SITE_NAME}</h1>
      <div class="today">
        <div class="clock-line">
          <button
            type="button"
            data-panel-entry="clock"
            aria-controls="clock-panel"
            aria-expanded={panels.active === "clock"}
            onclick={({ currentTarget }) => panels.toggle("clock", currentTarget)}>{date}</button
          >
          <span>{weather}</span>
          {#if saveAge !== undefined && saveAge > 0}
            {@const age = formatNumber(saveAge, locale)}
            <span
              >{plural(saveAge, [
                `from a save ${age} day old`,
                `from a save ${age} days old`,
              ])}</span
            >
            {#if userState.syncLane}
              <button
                type="button"
                class="text-link"
                data-panel-entry="sync"
                onclick={({ currentTarget }) => panels.open("sync", currentTarget)}
                >Load a newer save</button
              >
            {:else}
              <a class="text-link" href={importHref}>Load a newer save</a>
            {/if}
          {:else if saveAge === 0}
            <span>from your save</span>
          {:else if noSave}
            <span>day-one defaults</span>
          {:else if day !== undefined && (!bookOwner || clock.saveDate)}
            <span>set by hand</span>
          {/if}
        </div>
        {#if noSave}
          <p class="clock-note">
            <a class="text-link" href={importHref}>Load a save</a> to pick up on your farm’s day.
          </p>
        {/if}
        <GotItNote {locale} />
        <SyncTroubleNote />
        {#if mounted}
          <TodaysPlaces {locale} {projection} unknownDay={day === undefined} />
        {/if}

        {#if birthdays.length > 0}
          <section class="birthdays" aria-labelledby="birthdays-heading">
            <h2 id="birthdays-heading">Birthdays this week</h2>
            <ul>
              {#each birthdays as { birthday, id } (id)}
                {@const name = getName("villagers", id, locale)}
                {@const birthdaySeason = seasonLabel(birthday.season, locale)}
                {@const birthdayDay = formatNumber(birthday.day, locale)}
                <li>{/* @wc-include */ `${name}, ${birthdaySeason} ${birthdayDay}`}</li>
              {/each}
            </ul>
          </section>
        {/if}
        {#if heartsToGo.length > 0}
          <p class="hearts">
            <a class="text-link" href={localizedHref("villagers")}>Hearts to go</a>
            {#each heartsToGo as { id, name, remaining }, index (id)}
              <span
                >{name} <span class="player-number">{formatNumber(remaining, locale)}</span>{index +
                  1 <
                heartsToGo.length
                  ? ","
                  : ""}</span
              >
            {/each}
          </p>
        {/if}
      </div>

      <nav class="home-index" aria-labelledby="home-contents">
        <h2 id="home-contents">Contents</h2>
        <ul>
          {#each CATEGORY_KEYS as key (key)}
            {@const { color, href, name } = categoryForKey(key, locale)}
            {@const completed = formatNumber(allProgress[key].completed, locale)}
            {@const total = formatNumber(allProgress[key].total, locale)}
            <li>
              <a
                href={localizedHref(href)}
                aria-label={`${name}, ${completed} of ${total} completed`}
              >
                <span class="index-tab" style:--index-tab-color={color} aria-hidden="true"
                  ><ThumbTabIcon {key} class="size-4" /></span
                >
                <span>{name}</span>
                <span class="leader" aria-hidden="true"></span>
                <span class="index-count" aria-hidden="true"
                  ><span class="player-number">{completed}</span> / {total}</span
                >
              </a>
            </li>
          {/each}
          <li>
            <a href={`${localizedHref("everything")}?group=source`}>
              <span class="index-tab index-tab--everything" aria-hidden="true"
                ><ThumbTabIcon key="everything" class="size-4" /></span
              >
              <span class="italic">Everything</span>
              <span class="leader" aria-hidden="true"></span>
              <span class="index-count">{`${open} open`}</span>
            </a>
          </li>
        </ul>
      </nav>

      <div class="bookplate">
        <p>If found, please return to</p>
        <div class="bookplate-lines">
          <span>{bookOwner?.playerName}</span>
          <span>of</span>
          <span>{bookOwner?.farmName}</span>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .home-page {
    min-width: 0;
  }

  .title-page {
    display: grid;
    grid-template-areas: "title" "today" "contents" "plate";
    gap: 1rem;
    align-content: start;
    padding: 1rem 1rem 1.75rem;
  }

  h1 {
    grid-area: title;
    font-family: var(--font-brand);
    font-size: var(--text-3xl);
    line-height: 1;
  }

  .today {
    display: grid;
    min-width: 0;
    grid-area: today;
    align-content: start;
    gap: 0.625rem;
  }

  .clock-line {
    display: flex;
    min-height: 44px;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 0.625rem;
    border-block-end: 1px solid var(--color-rule);
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
  }

  .clock-line button:first-child {
    min-block-size: 44px;
    color: var(--color-guide-voice);
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    text-align: start;
    cursor: pointer;
  }

  .clock-line button:first-child:is(:hover, :focus-visible) {
    text-decoration: underline;
  }

  .text-link {
    color: var(--color-guide-voice);
    text-decoration: underline;
  }

  button.text-link {
    cursor: pointer;
  }

  .clock-note {
    font-family: var(--font-annotation);
    font-size: var(--text-sm);
  }

  .home-index {
    min-width: 0;
    grid-area: contents;
  }

  .home-index h2,
  .birthdays h2 {
    margin-block-end: 0.25rem;
    color: var(--color-guide-voice);
    font-family: var(--font-controls);
    font-size: var(--text-xs);
  }

  .home-index ul {
    border-block-start: 1px solid var(--color-rule);
  }

  .home-index a {
    display: flex;
    min-height: 44px;
    align-items: center;
    gap: 0.5rem;
    border-block-end: 1px solid var(--color-rule);
    font-family: var(--font-body);
  }

  .home-index a:is(:hover, :focus-visible) {
    color: var(--color-guide-voice);
  }

  .index-tab {
    display: grid;
    width: 2rem;
    height: 2rem;
    flex: none;
    order: 1;
    place-items: center;
    color: var(--color-ribbon-foreground);
    background: var(--index-tab-color);
    border-start-start-radius: var(--radius);
    border-end-start-radius: var(--radius);
  }

  .index-tab--everything {
    --index-tab-color: var(--color-ink);

    color: var(--color-paper);
  }

  .leader {
    min-width: 0.25rem;
    flex: 1;
    align-self: center;
    border-block-end: 1px dotted var(--color-ink-hairline);
  }

  .index-count {
    font-family: var(--font-data);
    font-size: var(--text-xs);
    text-align: end;
    white-space: nowrap;
  }

  .player-number {
    color: var(--color-hand-pencil);
    font-family: var(--font-hand);
  }

  .bookplate {
    grid-area: plate;
    align-self: start;
    padding: 0.625rem 0.75rem 0.875rem;
    border: 1px solid var(--color-rule);
    background: var(--color-paper-raised);
    outline: 1px solid var(--color-ink-hairline);
    outline-offset: -4px;
    font-family: var(--font-body);
    font-size: var(--text-sm);
    overflow-wrap: anywhere;
  }

  .bookplate-lines {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: end;
    gap: 0.5rem;
  }

  .bookplate-lines span:nth-child(odd) {
    min-height: 1.5rem;
    border-block-end: 1px solid var(--color-ink-hairline);
  }

  .birthdays {
    position: relative;
    justify-self: start;
    margin-block: 0.75rem 0.375rem;
    padding: 0.625rem 1rem;
    background: var(--color-tape-paper);
  }

  .birthdays::before {
    position: absolute;
    inset-block-start: -0.3rem;
    inset-inline-start: 1rem;
    width: 2.75rem;
    height: 0.625rem;
    background: var(--color-tape-strip);
    content: "";
    transform: rotate(-4deg);
  }

  .birthdays h2 {
    color: var(--color-tape-urgent);
  }

  .birthdays ul {
    font-family: var(--font-display);
    font-size: var(--text-xl);
  }

  .hearts {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.125rem 0.375rem;
    padding-block: 0.375rem;
    border-block: 1px solid var(--color-rule);
    font: var(--text-sm) var(--font-body);
  }

  .hearts .text-link {
    margin-inline-end: 0.375rem;
    font: var(--text-xs) var(--font-controls);
  }

  .home-page--searching {
    position: fixed;
    inset: var(--visual-viewport-top, 0px) 0 auto;
    display: flex;
    height: var(--visual-viewport-height, 100dvh);
    flex-direction: column;
    background: var(--color-paper);
  }

  .search-header {
    flex-shrink: 0;
    padding: 1rem;
    border-block-end: 1px solid var(--color-rule);
    background: var(--color-paper-raised);
  }

  .home-page--searching :is(.search-content, .title-page) {
    min-height: 0;
    flex: 1;
    padding-block-end: calc(72px + env(safe-area-inset-bottom));
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  @media (min-width: 48rem) and (min-height: 34rem) {
    .title-page {
      grid-template-areas: "title today" "contents today" "plate today" ". today";
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr);
      grid-template-rows: auto auto auto 1fr;
      column-gap: clamp(1rem, 3vw, 2rem);
      padding: 2rem clamp(1rem, 3vw, 2.5rem);
    }

    .today {
      padding-inline-start: clamp(1rem, 3vw, 2rem);
      border-inline-start: 1px solid var(--color-rule);
    }

    .clock-line {
      margin-block-start: var(--ledger-header-height);
    }

    .index-tab {
      width: 1.625rem;
      height: 1.625rem;
      order: 0;
      border-radius: var(--radius);
    }

    .home-page--searching {
      position: static;
      height: auto;
      background: none;
    }

    .home-page--searching :is(.search-content, .title-page) {
      overflow-y: visible;
      padding-block-end: 1rem;
    }
  }
</style>
