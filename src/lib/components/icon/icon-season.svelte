<script lang="ts">
  import { SEASON_ICON } from "$lib/components/icon/icon-maps.js";

  import type { LucideProps } from "$lib/components/icon/icon-maps.js";
  import type { Season } from "$lib/types/tracker-data.js";

  interface Props extends LucideProps {
    season: Season;
  }

  let { season, ...rest }: Props = $props();

  const IconComp = $derived(SEASON_ICON[season]);
</script>

<IconComp {...rest} />
