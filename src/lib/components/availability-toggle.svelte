<script lang="ts">
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import type { AvailabilityMode } from "$lib/stores/user-state.svelte.js";
</script>

<div class="rounded-lg border border-border p-1">
  <ToggleGroup.Root
    class="w-full"
    type="single"
    value={userState.state.availabilityMode}
    onValueChange={(v) => {
      if (v) userState.setAvailabilityMode(v as AvailabilityMode);
    }}
  >
    <ToggleGroup.Item
      class="flex-1"
      title="Only items restricted to the current season or weather"
      value="timely"
    >
      Timely
    </ToggleGroup.Item>
    <ToggleGroup.Item
      class="flex-1"
      title="All items accessible given the current world state"
      value="available"
    >
      Available
    </ToggleGroup.Item>
    <ToggleGroup.Item
      class="flex-1"
      title="All incomplete items regardless of world state"
      value="everything"
    >
      Everything
    </ToggleGroup.Item>
  </ToggleGroup.Root>
</div>
