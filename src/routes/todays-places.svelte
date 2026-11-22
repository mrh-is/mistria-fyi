<script lang="ts">
  import { getName, getNameTable } from "#lib/data/names.js";
  import { sourceFilterLabel } from "#lib/data/source-filters.js";
  import plural from "#lib/i18n/catalogs/plural.js";
  import { buildLocationNames, buildWaterNames } from "#lib/sources/source-names.js";
  import { formatNumber } from "#lib/utils/format.js";
  import { localizedHref } from "#lib/utils/localized-href.js";

  import { projectHomePlaces } from "./home-places.js";

  import type { Source } from "#lib/types/acquisition.js";
  import type { LocaleCode } from "#lib/types/locale.js";

  let {
    locale,
    projection,
    unknownDay,
  }: {
    locale: LocaleCode;
    projection: ReturnType<typeof projectHomePlaces>;
    unknownDay: boolean;
  } = $props();
  let { places, total } = $derived(projection);
  let number = $derived(formatNumber(total, locale));
  let placeCount = $derived(formatNumber(places.length, locale));
  let where = $derived(
    plural(places.length, [`in ${placeCount} place`, `in ${placeCount} places`]),
  );
  let everything = $derived(localizedHref("everything"));
  let locations: Record<string, string> = $derived(buildLocationNames(locale));
  let waters: Record<string, string> = $derived(buildWaterNames(locale));
  let stationNames: Record<string, string> = $derived(getNameTable("items", locale));

  function placeName(source: Source | undefined): string {
    if (!source) return "Available quests";
    if ("festivalId" in source) return getName("festivals", source.festivalId, locale);
    if ("storeId" in source) return getName("stores", source.storeId, locale);
    if ("locationIds" in source && source.locationIds) return locations[source.locationIds[0]];
    if ("waterTypes" in source && source.waterTypes) return waters[source.waterTypes[0]];
    if ("biomeId" in source && source.biomeId) return getName("mines", source.biomeId, locale);
    switch (source.type) {
      case "artifact_dig":
        return "Dig sites";
      case "bug_catch":
        return "Bug catching";
      case "forage":
        return "Foraging";
      case "dive":
        return "Diving";
      case "station":
        return stationNames[source.stationId];
      default:
        return sourceFilterLabel("fishing", locale);
    }
  }

  function placeKind(source: Source | undefined): string {
    if (!source) return "Quests";
    if ("festivalId" in source) return sourceFilterLabel("festivals", locale);
    if ("storeId" in source) return sourceFilterLabel("stores", locale);
    if (source.type === "station") {
      return sourceFilterLabel("crafting", locale);
    }
    if ("biomeId" in source) return sourceFilterLabel("mines", locale);
    if (source.type === "dive") return "Diving";
    if (source.type === "fish") {
      return sourceFilterLabel("fishing", locale);
    }
    return sourceFilterLabel("gathering", locale);
  }
</script>

<section aria-labelledby="places-heading">
  <h2 id="places-heading">Places to go today</h2>
  {#if places.length > 0}
    <p class="annotation">
      {plural(total, [
        `${number} thing ${where}, with nothing known in the way`,
        `${number} things ${where}, with nothing known in the way`,
      ])}
    </p>
  {:else}
    <p class="annotation">No open places to list.</p>
  {/if}
  {#if unknownDay}
    <p class="annotation">Pick a day to see seasonal places.</p>
  {/if}
  {#if places.length > 0}
    <ol class="places">
      {#each places.slice(0, 8) as { id, source, count } (id)}
        <li>
          <a
            href={source
              ? `${everything}?group=source#${id}`
              : `${everything}?group=category#category-quests`}
          >
            <span>
              <span>{placeName(source)}</span>
              <small>{placeKind(source)}</small>
            </span>
            <span class="count">{formatNumber(count, locale)}</span>
          </a>
        </li>
      {/each}
    </ol>
    <a class="all-places" href={`${everything}?group=source`}>
      {plural(places.length, [`See ${placeCount} place`, `All ${placeCount} places`])}
    </a>
  {/if}
</section>

<style>
  h2 {
    font-family: var(--font-body);
    font-size: var(--text-xl);
  }

  .annotation,
  small {
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
  }

  .places {
    display: grid;
    margin-block-start: 0.625rem;
    border-block-start: 1px solid var(--color-rule);
  }

  .places a {
    display: flex;
    min-block-size: 44px;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding-block: 0.25rem;
    border-block-end: 1px solid var(--color-rule);
    color: var(--color-guide-voice);
    overflow-wrap: anywhere;
  }

  small {
    display: block;
  }

  .count {
    font-family: var(--font-data);
    font-size: var(--text-xs);
  }

  .all-places {
    display: inline-flex;
    min-block-size: 44px;
    align-items: center;
    color: var(--color-guide-voice);
    font-family: var(--font-annotation);
    font-size: var(--text-sm);
    text-decoration: underline;
  }

  .places a:is(:hover, :focus-visible) {
    text-decoration: underline;
  }

  @container (width >= 58rem) {
    .places {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: 1.5rem;
    }
  }

  @media (width < 48rem), (height < 34rem) {
    .places li:nth-child(n + 5) {
      display: none;
    }
  }
</style>
