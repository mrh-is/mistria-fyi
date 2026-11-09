<script>
  import * as m from "#lib/paraglide/messages.js";

  let { locale } = $props();
</script>

<main>
  <h1>{m.toolbar_quick_settings({}, { locale })}</h1>
  <button>{m.action_retry({}, { locale })}</button>
</main>
