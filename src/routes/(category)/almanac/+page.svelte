<script lang="ts">
  import { deferLedgerTeardown } from "#lib/components/book/page-turn.js";

  import AlmanacLedger from "./almanac-ledger.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<div out:deferLedgerTeardown|global>
  <AlmanacLedger locale={data.locale} />
</div>
