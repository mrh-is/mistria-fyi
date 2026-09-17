<script lang="ts">
  import { IconBeta, IconChevronRight, IconLanguage } from "@tabler/icons-svelte-runes";
  import { slide } from "svelte/transition";

  import localeManifest from "$lib/data/locales.json";
  import { getLocale } from "$lib/paraglide/runtime.js";
  import { localePreference } from "$lib/stores/locale-preference.svelte.js";

  import type { LocaleManifest } from "$lib/types/locale.js";

  let open = $state(false);
  const locales = localeManifest as LocaleManifest;
  const currentLocale = getLocale();
  const currentLocaleName =
    locales.find(({ tag }) => tag === currentLocale)?.displayName ?? "English";
</script>

<div class="language-setting">
  <div class="language-setting__row">
    <span class="language-setting__label"><IconLanguage class="size-3.5" />Language</span>
    <button
      aria-controls="language-picker-options"
      aria-expanded={open}
      aria-label="Choose language"
      class="language-setting__trigger"
      type="button"
      onclick={() => {
        open = !open;
      }}
    >
      <span>{currentLocaleName}</span>
      <IconChevronRight class="language-setting__chevron size-3.5" />
    </button>
  </div>

  {#if open}
    <div
      aria-label="Languages"
      class="language-setting__options"
      id="language-picker-options"
      role="group"
      transition:slide={{ duration: 150 }}
    >
      {#each locales as locale (locale.tag)}
        <button
          aria-current={locale.tag === currentLocale ? "true" : undefined}
          class:language-setting__option--current={locale.tag === currentLocale}
          class="language-setting__option"
          type="button"
          onclick={() => {
            localePreference.select(locale.tag);
          }}
        >
          <span>{locale.displayName}</span>
          {#if locale.status === "beta"}
            <span class="language-setting__beta"><IconBeta class="size-3" />Beta</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .language-setting {
    border-bottom: 1px solid color-mix(in srgb, var(--hairline) 24%, transparent);
  }

  .language-setting__row {
    display: flex;
    min-height: 52px;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 18px;
  }

  .language-setting__label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-muted);
    font-family: var(--font-annotation);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  .language-setting__trigger {
    display: flex;
    min-height: 34px;
    min-width: 110px;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 9px;
    border: 1px solid color-mix(in srgb, var(--hairline) 42%, transparent);
    color: var(--ink);
    font-family: var(--font-controls);
    font-size: 10px;
  }

  .language-setting__trigger[aria-expanded="true"] {
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 12%, var(--paper-raised));
  }

  :global(.language-setting__chevron) {
    transition: transform 150ms ease-out;
  }

  .language-setting__trigger[aria-expanded="true"] :global(.language-setting__chevron) {
    transform: rotate(90deg);
  }

  .language-setting__options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 2px;
    margin: 0 18px 12px;
    padding: 4px;
    border-left: 2px solid color-mix(in srgb, var(--primary) 42%, var(--hairline));
    background: color-mix(in srgb, var(--primary) 5%, var(--paper-raised));
  }

  .language-setting__option {
    display: flex;
    min-height: 36px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 8px;
    color: var(--ink);
    font-family: var(--font-controls);
    font-size: 11px;
    text-align: left;
  }

  .language-setting__option:hover,
  .language-setting__option:focus-visible,
  .language-setting__option--current {
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 12%, var(--paper-raised));
    outline: 2px solid var(--primary);
    outline-offset: -2px;
  }

  .language-setting__beta {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 4px;
    border: 1px solid color-mix(in srgb, var(--primary) 34%, transparent);
    color: var(--ink-muted);
    font-family: var(--font-annotation);
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
</style>
