<!--
  Send a note & Settings, at the foot of the thumb-tab rail at book widths. They stay live while a
  panel is open, over the feedback scrim, so either can switch to its own panel or close it.
-->
<script lang="ts">
  import IconMessageReport from "@tabler/icons-svelte-runes/icons/message-report";
  import IconSettings from "@tabler/icons-svelte-runes/icons/settings";

  import { getBookPanels } from "#lib/components/book/book-panels.svelte.js";
  import RailTool from "#lib/components/book/rail-tool.svelte";
  import * as m from "#lib/paraglide/messages.js";

  const panels = getBookPanels();
</script>

<div class="rail-tools">
  <RailTool
    aria-label={m.toolbar_send_feedback()}
    aria-expanded={panels.active === "feedback"}
    data-panel-entry="feedback"
    onclick={(event) => {
      panels.toggle("feedback", event.currentTarget);
    }}
  >
    <IconMessageReport class="size-4" />
  </RailTool>
  <RailTool
    aria-label={m.toolbar_quick_settings()}
    aria-expanded={panels.active === "settings"}
    aria-controls="quick-settings-panel"
    data-panel-entry="settings"
    onclick={(event) => {
      panels.toggle("settings", event.currentTarget);
    }}
  >
    <IconSettings class="size-4" />
  </RailTool>
</div>

<style>
  .rail-tools {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
</style>
