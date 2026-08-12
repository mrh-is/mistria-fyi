<script lang="ts">
  import { UI_ICON } from "$lib/components/icon/icon-maps.js";

  import type { LucideProps } from "$lib/components/icon/icon-maps.js";
  import type { UIIconType } from "$lib/components/icon/icon-maps.js";

  interface Props extends LucideProps {
    type: UIIconType;
  }

  let { type, ...rest }: Props = $props();

  const IconComp = $derived(UI_ICON[type]);
</script>

<IconComp {...rest} />
