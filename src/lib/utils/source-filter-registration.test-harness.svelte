<script lang="ts">
  import { registerSourceFilters } from "$lib/utils/source-filter-registration.svelte.js";

  registerSourceFilters("reactivity-test", () => [{ type: "forage" }]);
</script>
