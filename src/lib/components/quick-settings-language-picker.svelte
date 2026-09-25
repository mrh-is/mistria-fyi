<script lang="ts">
  import { IconBeta, IconChevronRight, IconLanguage } from "@tabler/icons-svelte-runes";
  import { slide } from "svelte/transition";

  import { page } from "$app/state";
  import localeManifest from "$lib/data/locales.json";
  import { getName } from "$lib/data/names.js";
  import * as m from "$lib/paraglide/messages.js";
  import { getLocale } from "$lib/paraglide/runtime.js";
  import { localePreference } from "$lib/stores/locale-preference.svelte.js";

  import type { LocaleCode, LocaleManifest } from "$lib/types/locale.js";

  let open = $state(false);
  /** A locale the player tried to switch to while offline, before it was downloaded. */
  let unavailableLocale = $state<LocaleCode | null>(null);
  const locales = localeManifest as LocaleManifest;
  const currentLocale = getLocale();
  const currentLocaleName =
    locales.find(({ tag }) => tag === currentLocale)?.displayName ?? "English";
  // Named in the reader's own language ("Japanese", not "日本語"), since it sits inside a sentence.
  const languageNames = new Intl.DisplayNames([currentLocale], { type: "language" });

  async function select(locale: LocaleCode): Promise<void> {
    unavailableLocale = null;
    if (!(await localePreference.select(locale))) unavailableLocale = locale;
  }
</script>

<div class="language-setting">
  <div class="language-setting__row">
    <span class="language-setting__label"
      ><IconLanguage class="size-3.5" />{getName("ui", "language", page.data.locale)}</span
    >
    <button
      aria-controls="language-picker-options"
      aria-expanded={open}
      aria-label={m.settings_choose_language()}
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
      aria-label={m.settings_languages_group_aria()}
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
          onclick={() => void select(locale.tag)}
        >
          <span>{locale.displayName}</span>
          {#if locale.status === "beta"}
            <span aria-label={m.settings_beta_translation_aria()} class="language-setting__beta">
              <IconBeta class="size-3" />
            </span>
          {/if}
        </button>
      {/each}
      <p
        class="language-setting__offline"
        class:language-setting__offline--shown={unavailableLocale}
        role="status"
      >
        {#if unavailableLocale}
          {m.settings_language_offline({
            language: languageNames.of(unavailableLocale) ?? unavailableLocale,
          })}
        {/if}
      </p>
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

  .language-setting__offline {
    grid-column: 1 / -1;
    color: var(--ink-muted);
    font-family: var(--font-annotation);
    font-size: 11px;
    line-height: 1.4;
  }

  .language-setting__offline--shown {
    padding: 6px 8px;
  }

  .language-setting__beta {
    display: inline-flex;
    width: 18px;
    height: 16px;
    flex: none;
    align-items: center;
    justify-content: center;
    border: 1px solid color-mix(in srgb, var(--hairline) 58%, transparent);
    border-radius: 3px;
    color: var(--ink-muted);
  }
</style>
