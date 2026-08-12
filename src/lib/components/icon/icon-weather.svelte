<script lang="ts">
  import { weatherIcon } from "$lib/components/icon/icon-maps.js";

  import type { LucideProps } from "$lib/components/icon/icon-maps.js";
  import type { Season, Weather } from "$lib/types/tracker-data.js";

  interface Props extends LucideProps {
    season: Season;
    weather: Weather;
  }

  let { season, weather, ...rest }: Props = $props();

  const IconComp = $derived(weatherIcon(weather, season));
</script>

<IconComp {...rest} />
