<script lang="ts">
  import { RESTRICTION_ICON } from "$lib/components/icon/icon-maps.js";

  import type { IconProps } from "$lib/components/icon/icon-maps.js";

  interface Props extends IconProps {
    type: keyof typeof RESTRICTION_ICON;
  }

  let { type, ...rest }: Props = $props();

  const IconComp = $derived(RESTRICTION_ICON[type]);
</script>

<IconComp {...rest} />
