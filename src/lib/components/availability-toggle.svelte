<script lang="ts">
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import type { AvailabilityMode } from "$lib/stores/user-state.svelte.js";
</script>

<ToggleGroup.Root
  class="w-full"
  type="single"
  value={userState.state.availabilityMode}
  onValueChange={(v) => {
    if (v) userState.setAvailabilityMode(v as AvailabilityMode);
  }}
>
  <ToggleGroup.Item class="flex-1" value="timely">Timely</ToggleGroup.Item>
  <ToggleGroup.Item class="flex-1" value="available">Available</ToggleGroup.Item>
  <ToggleGroup.Item class="flex-1" value="everything">Everything</ToggleGroup.Item>
</ToggleGroup.Root>
