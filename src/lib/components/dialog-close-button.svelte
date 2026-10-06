<script lang="ts">
  import XIcon from "@tabler/icons-svelte-runes/icons/x";

  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import * as m from "#lib/paraglide/messages.js";
</script>

<!--
  The vendored `Dialog.Content` close button hardcodes an English "Close", so dialogs pass
  `showCloseButton={false}` and render this one, which matches its placement & styling.
-->
<Dialog.Close
  class="absolute inset-e-4 top-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
>
  <XIcon />
  <span class="sr-only">{m.common_close()}</span>
</Dialog.Close>
