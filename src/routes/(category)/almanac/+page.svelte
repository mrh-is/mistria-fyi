<script lang="ts">
  import { deferLedgerTeardown } from "#lib/components/book/page-turn.js";

  import AlmanacLedger from "./almanac-ledger.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<div class="almanac-route" out:deferLedgerTeardown|global>
  <AlmanacLedger locale={data.locale} />
</div>

<style>
  /* Svelte sets inert on the outro and clears it if the route returns before removal. */
  .almanac-route:global([inert]) {
    display: none;
  }
</style>
