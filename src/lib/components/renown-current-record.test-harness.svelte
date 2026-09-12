<script lang="ts">
  import RenownCurrentRecord from "$lib/components/renown-current-record.svelte";

  let { compact = false }: { compact?: boolean } = $props();
</script>

<RenownCurrentRecord {compact} />
