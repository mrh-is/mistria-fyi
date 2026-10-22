<script lang="ts">
  import { Icon } from "#lib/components/icon/index.js";
  import * as m from "#lib/paraglide/messages.js";

  let { class: className = "" }: { class?: string } = $props();
</script>

<div
  class="flex items-center gap-1.5 font-controls text-2xs tracking-[0.14em] text-(--color-progress-complete) uppercase {className}"
>
  <Icon.Category category="complete" class="size-3.5" />
  <h2>{m.common_completed_heading()}</h2>
</div>
