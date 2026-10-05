<script lang="ts">
  import { SEASON_ICON } from "#lib/components/icon/icon-maps.js";

  import type { IconProps } from "#lib/components/icon/icon-maps.js";
  import type { Season } from "#lib/types/tracker-data.js";

  interface Props extends IconProps {
    season: Season;
  }

  let { season, ...rest }: Props = $props();

  const stroke = $derived(season === "summer" ? 1.5 * Number(rest.stroke ?? 2) : rest.stroke);
  const fallClass = $derived(season === "fall" ? "-scale-y-100 rotate-90" : "");

  const IconComp = $derived(SEASON_ICON[season]);
</script>

<IconComp {...rest} {stroke} class={`${rest.class ?? ""} ${fallClass}`.trim()} />
