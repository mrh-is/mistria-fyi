<script lang="ts">
  import { registerSourceFilters } from "#lib/controllers/source-filter-registration.svelte.js";

  registerSourceFilters("reactivity-test", () => ["forage"]);
</script>
