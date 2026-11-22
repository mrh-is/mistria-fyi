<script lang="ts">
  import CategoryLedger from "#lib/components/ledger/category-ledger.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<CategoryLedger category="recipes" locale={data.locale} />
