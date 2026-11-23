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

  function requiredName(names: Record<string, string>, id: string, type: Source["type"]): string {
    const name = names[id];
    if (!name) throw new Error(`No Home place name for ${type} ID ${id} in ${locale}`);
    return name;
  }

  function placeLabel(source: Source | undefined): { kind: string; name: string } {
    if (!source) return { kind: "Quests", name: "Available quests" };
    switch (source.type) {
      case "festival":
      case "festival_activity":
        return {
          kind: sourceFilterLabel("festivals", locale),
          name: getName("festivals", source.festivalId, locale),
        };
      case "scroll_bundle":
      case "store":
      case "upgrade":
        return {
          kind: sourceFilterLabel("stores", locale),
          name: getName("stores", source.storeId, locale),
        };
      case "artifact_dig":
      case "bug_catch":
      case "forage": {
        const names = { artifact_dig: "Dig sites", bug_catch: "Bug catching", forage: "Foraging" };
        return {
          kind: sourceFilterLabel("gathering", locale),
          name: source.locationIds
            ? requiredName(locations, source.locationIds[0], source.type)
            : names[source.type],
        };
      }
      case "dive":
      case "fish": {
        const kind = source.type === "dive" ? "Diving" : sourceFilterLabel("fishing", locale);
        return {
          kind,
          name: source.waterTypes ? requiredName(waters, source.waterTypes[0], source.type) : kind,
        };
      }
      case "mine":
      case "mines_dig_site":
        return {
          kind: sourceFilterLabel("mines", locale),
          name: getName("mines", source.biomeId, locale),
        };
      case "mine_fish":
        return {
          kind: sourceFilterLabel("mines", locale),
          name: source.biomeId
            ? getName("mines", source.biomeId, locale)
            : sourceFilterLabel("fishing", locale),
        };
      case "station":
        return {
          kind: sourceFilterLabel("crafting", locale),
          name: requiredName(stationNames, source.stationId, source.type),
        };
      default:
        throw new Error(`Unexpected Home place source type: ${source.type}`);
    }
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
        {@const { name, kind } = placeLabel(source)}
        <li>
          <a
            href={source
              ? `${everything}?group=source#${id}`
              : `${everything}?group=category#category-quests`}
          >
            <span>
              <span>{name}</span>
              <small>{kind}</small>
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
