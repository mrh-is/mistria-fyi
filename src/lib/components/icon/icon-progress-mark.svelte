<script lang="ts">
  import { PROGRESS_MARK_ICON } from "#lib/components/icon/icon-maps.js";

  import type { IconProps, ProgressMarkType } from "#lib/components/icon/icon-maps.js";

  interface Props extends IconProps {
    type: ProgressMarkType;
  }

  let { type, ...rest }: Props = $props();

  const IconComp = $derived(PROGRESS_MARK_ICON[type]);
</script>

<IconComp {...rest} />
