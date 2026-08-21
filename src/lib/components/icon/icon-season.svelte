<script lang="ts">
  import { SEASON_ICON } from "$lib/components/icon/icon-maps.js";

  import type { LucideProps } from "$lib/components/icon/icon-maps.js";
  import type { Season } from "$lib/types/tracker-data.js";

  interface Props extends LucideProps {
    season: Season;
  }

  let { season, ...rest }: Props = $props();

  const strokeWidth = $derived(
    season === "summer" ? 2.5 * Number(rest.strokeWidth ?? 2) : rest.strokeWidth,
  );
  const fallClass = $derived(season === "fall" ? "-scale-y-100 rotate-90" : "");

  const IconComp = $derived(SEASON_ICON[season]);
</script>

<IconComp {...rest} {strokeWidth} class={[rest.class, fallClass]} />
