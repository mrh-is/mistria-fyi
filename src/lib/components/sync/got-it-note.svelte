<script lang="ts">
  import IconCircleCheck from "@tabler/icons-svelte-runes/icons/circle-check";

  import { syncNotice } from "#lib/sync/notice.svelte.js";

  import type { LocaleCode } from "#lib/types/locale.js";

  let { locale }: { locale: LocaleCode } = $props();

  const time = $derived(
    syncNotice.applied
      ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
          syncNotice.applied.modified,
        )
      : "",
  );
</script>

{#if syncNotice.applied}
  <aside class="got-it" role="status">
    <span class="got-it__tape" aria-hidden="true"></span>
    <IconCircleCheck class="got-it__icon" aria-hidden="true" />
    <div>
      <p class="got-it__title">Got it!</p>
      <p>
        {`Your farm as of ${time}. We’ll keep up from here.`}
        Anything you check off by hand on this device stays here.
      </p>
    </div>
  </aside>
{/if}

<style>
  .got-it {
    position: relative;
    display: flex;
    gap: 9px;
    padding: 16px 14px 13px;
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 34%, transparent);
    background: var(--color-paper-raised);
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
    line-height: 1.45;
  }

  .got-it__tape {
    position: absolute;
    top: -7px;
    left: 18px;
    width: 46px;
    height: 13px;
    background: color-mix(in srgb, var(--color-status-success) 30%, var(--color-paper));
    transform: rotate(-2deg);
  }

  .got-it :global(.got-it__icon) {
    width: 16px;
    height: 16px;
    flex: none;
    margin-top: 2px;
    color: var(--color-status-success);
  }

  .got-it__title {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 600;
  }
</style>
