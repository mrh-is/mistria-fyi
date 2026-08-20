<script lang="ts">
  import { SOURCE_ICON } from "$lib/components/icon/icon-maps.js";

  import type { LucideProps } from "$lib/components/icon/icon-maps.js";
  import type { Source } from "$lib/types/acquisition";

  interface Props extends LucideProps {
    type: Source["type"];
  }

  let { type, ...rest }: Props = $props();

  const IconComp = $derived(SOURCE_ICON[type]);
</script>

<IconComp {...rest} />
