<script>
  import Panel from "#fixture-search";

  let { data } = $props();
  let count = $state(1);
</script>

<Panel {...data} {count} query="tea" showError={false} onCountChange={() => (count += 1)} />
