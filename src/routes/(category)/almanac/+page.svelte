<script lang="ts">
  import AlmanacLedger from "./almanac-ledger.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<AlmanacLedger locale={data.locale} />
