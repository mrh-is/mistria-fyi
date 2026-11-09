<script>
  import Panel from "#fixture-search";

  let { data } = $props();
  let count = $derived(data.count);
</script>

<Panel {...data} {count} onCountChange={() => (count += 1)} />
