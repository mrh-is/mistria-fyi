<script lang="ts">
  import { COMPLETION_ICON } from "$lib/components/icon/icon-maps.js";

  import type { LucideProps } from "$lib/components/icon/icon-maps.js";
  import type { QuestState } from "$lib/stores/user-state.svelte.js";

  interface Props extends LucideProps {
    state: QuestState;
  }

  let { state, ...rest }: Props = $props();

  const IconComp = $derived(COMPLETION_ICON[state]);
</script>

<IconComp {...rest} />
