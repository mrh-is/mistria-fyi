<script lang="ts">
  import IconInfoCircle from "@tabler/icons-svelte-runes/icons/info-circle";

  import * as m from "#lib/paraglide/messages.js";

  let { computer }: { computer: boolean } = $props();
</script>

<!-- A field note taped beside the choices: what syncs & what stays here. -->
<aside class="only-save-note">
  <span class="only-save-note__tape" aria-hidden="true"></span>
  <IconInfoCircle class="only-save-note__icon" aria-hidden="true" />
  <div>
    <p class="only-save-note__title">{m.sync_only_save_title()}</p>
    <p>{computer ? m.sync_only_save_computer() : m.sync_only_save_phone()}</p>
  </div>
</aside>

<style>
  .only-save-note {
    position: relative;
    display: flex;
    gap: 9px;
    padding: 16px 14px 13px;
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 34%, transparent);
    background: var(--color-paper-raised);
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
    line-height: 1.45;
    transform: rotate(-0.3deg);
  }

  .only-save-note__tape {
    position: absolute;
    top: -7px;
    left: 18px;
    width: 46px;
    height: 13px;
    background: color-mix(in srgb, var(--color-ink-hairline) 26%, var(--color-paper));
    transform: rotate(-2deg);
  }

  .only-save-note :global(.only-save-note__icon) {
    width: 15px;
    height: 15px;
    flex: none;
    margin-top: 2px;
    color: var(--color-ink-muted);
  }

  .only-save-note__title {
    margin-bottom: 2px;
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 600;
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--color-home-accent) 30%, transparent);
    text-decoration-thickness: 5px;
    text-underline-offset: -1px;
  }
</style>
