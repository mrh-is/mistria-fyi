<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import { theme, type Theme } from "$lib/stores/theme.svelte.js";
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>Theme</Card.Title>
  </Card.Header>
  <Card.Content>
    <ToggleGroup.Root
      class="border-input w-full rounded-md border"
      type="single"
      value={theme.preference}
      onValueChange={(v) => {
        if (v) theme.set(v as Theme);
      }}
    >
      <ToggleGroup.Item class="flex-1" value="system">System</ToggleGroup.Item>
      <ToggleGroup.Item class="flex-1" value="light">Light</ToggleGroup.Item>
      <ToggleGroup.Item class="flex-1" value="dark">Dark</ToggleGroup.Item>
    </ToggleGroup.Root>
  </Card.Content>
</Card.Root>
