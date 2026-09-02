import IconCategory from "$lib/components/icon/icon-category.svelte";
import IconCompletion from "$lib/components/icon/icon-completion.svelte";
import IconProgressMark from "$lib/components/icon/icon-progress-mark.svelte";
import IconRestriction from "$lib/components/icon/icon-restriction.svelte";
import IconSeason from "$lib/components/icon/icon-season.svelte";
import IconSource from "$lib/components/icon/icon-source.svelte";
import IconUI from "$lib/components/icon/icon-ui.svelte";
import IconWeather from "$lib/components/icon/icon-weather.svelte";

export type { LucideIcon, LucideProps } from "$lib/components/icon/icon-maps.js";
export { SOURCE_FILTERS, SOURCE_ICON } from "$lib/components/icon/icon-maps.js";

export const Icon = {
  Category: IconCategory,
  Completion: IconCompletion,
  ProgressMark: IconProgressMark,
  Restriction: IconRestriction,
  Season: IconSeason,
  Source: IconSource,
  UI: IconUI,
  Weather: IconWeather,
};
