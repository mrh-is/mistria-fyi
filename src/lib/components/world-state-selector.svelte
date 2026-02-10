<script lang="ts">
  import * as Select from "$lib/components/ui/select/index.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { seasonEmoji, seasonLabel, weatherEmoji, weatherLabel } from "$lib/utils/format.js";

  import type { Season, Weather } from "$lib/types/tracker-data.js";

  const seasons: Season[] = ["spring", "summer", "fall", "winter"];
  const weathers: Weather[] = ["calm", "inclement", "heavy_inclement", "special"];

  let currentSeason = $derived(userState.state.worldState.season);
</script>

<div class="flex gap-2">
  <Select.Root
    type="single"
    value={userState.state.worldState.season}
    onValueChange={(v) => {
      if (v) userState.setSeason(v as Season);
    }}
  >
    <Select.Trigger class="flex-1">
      {seasonEmoji(currentSeason)}
      {seasonLabel(currentSeason)}
    </Select.Trigger>
    <Select.Content>
      {#each seasons as s (s)}
        <Select.Item value={s}>{seasonEmoji(s)} {seasonLabel(s)}</Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>

  <Select.Root
    type="single"
    value={userState.state.worldState.weather}
    onValueChange={(v) => {
      if (v) userState.setWeather(v as Weather);
    }}
  >
    <Select.Trigger class="flex-1">
      {weatherEmoji(userState.state.worldState.weather)}
      {weatherLabel(userState.state.worldState.weather, currentSeason)}
    </Select.Trigger>
    <Select.Content>
      {#each weathers as w (w)}
        <Select.Item value={w}>
          {weatherEmoji(w)} {weatherLabel(w, currentSeason)}
        </Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>
</div>
