<script lang="ts">
  import AlmanacLedger from "./almanac-ledger.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
  let locale = $derived(data.locale);
</script>

<AlmanacLedger {locale} />
