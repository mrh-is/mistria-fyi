<script lang="ts">
  import { SOURCE_ICON } from "$lib/components/icon/icon-maps.js";

  import type { LucideProps } from "$lib/components/icon/icon-maps.js";
  import type { AcquisitionSource } from "$lib/types/tracker-data.js";

  interface Props extends LucideProps {
    type: AcquisitionSource["type"];
  }

  let { type, ...rest }: Props = $props();

  const IconComp = $derived(SOURCE_ICON[type]);
</script>

<IconComp {...rest} />
