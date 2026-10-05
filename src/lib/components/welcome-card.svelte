<script lang="ts">
  import IconFileDownload from "@tabler/icons-svelte-runes/icons/file-download";
  import IconPencil from "@tabler/icons-svelte-runes/icons/pencil";
  import IconQrcode from "@tabler/icons-svelte-runes/icons/qrcode";
  import IconSparkles from "@tabler/icons-svelte-runes/icons/sparkles";
  import { onMount } from "svelte";

  import * as m from "#lib/paraglide/messages.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { localizedHref } from "#lib/utils/localized-href.js";

  type OnboardingFlow = "desktop" | "mobile";

  let detectedMobile = $state(false);
  let flowOverride = $state<null | OnboardingFlow>(null);
  let showMobileFlow = $derived(flowOverride ? flowOverride === "mobile" : detectedMobile);

  onMount(() => {
    detectedMobile = navigator.maxTouchPoints > 0 && window.innerWidth < 1024;
  });

  function startManually(): void {
    userState.applyStartingItems();
  }

  function switchFlow(): void {
    flowOverride = showMobileFlow ? "desktop" : "mobile";
  }
</script>

{#if !userState.hasAnyProgress}
  <section class="welcome-card" aria-label={m.onboarding_region_label()}>
    <div class="welcome-card__marker" aria-hidden="true">
      <IconSparkles />
    </div>

    <div class="welcome-card__copy">
      <p class="welcome-card__overline">{m.onboarding_overline()}</p>
      <h2>{m.onboarding_title()}</h2>
      <p>
        {showMobileFlow ? m.onboarding_mobile_description() : m.onboarding_desktop_description()}
      </p>
      <p>{m.onboarding_manual_description()}</p>
    </div>

    <div class="welcome-card__actions">
      {#if showMobileFlow}
        <a class="welcome-card__primary" href="{localizedHref('data')}?section=transfer">
          <IconQrcode aria-hidden="true" />
          <span>{m.onboarding_transfer_action()}</span>
        </a>
      {:else}
        <a class="welcome-card__primary" href="{localizedHref('data')}?section=import">
          <IconFileDownload aria-hidden="true" />
          <span>{m.onboarding_import_action()}</span>
        </a>
      {/if}

      <button class="welcome-card__secondary" type="button" onclick={startManually}>
        <IconPencil aria-hidden="true" />
        <span>{m.onboarding_manual_action()}</span>
      </button>
    </div>

    <button class="welcome-card__switch" type="button" onclick={switchFlow}>
      {showMobileFlow ? m.onboarding_desktop_override() : m.onboarding_mobile_override()}
      <span aria-hidden="true">→</span>
    </button>
  </section>
{/if}

<style>
  .welcome-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 19px 18px 16px 21px;
    overflow: clip;
    border: 1px solid color-mix(in srgb, var(--hairline) 38%, transparent);
    border-left: 3px solid var(--home-accent);
    background:
      linear-gradient(
        135deg,
        color-mix(in srgb, var(--home-accent) 7%, transparent),
        transparent 55%
      ),
      var(--paper-raised);
    box-shadow: var(--shadow-small);
  }

  .welcome-card::after {
    position: absolute;
    right: -19px;
    bottom: -26px;
    width: 84px;
    height: 84px;
    border: 1px solid color-mix(in srgb, var(--home-accent) 12%, transparent);
    border-radius: 50%;
    content: "";
  }

  .welcome-card__marker {
    position: absolute;
    top: 17px;
    right: 17px;
    display: grid;
    width: 30px;
    height: 30px;
    place-items: center;
    color: var(--home-accent);
    background: color-mix(in srgb, var(--home-accent) 10%, var(--paper-raised));
    border-radius: 50%;
    transform: rotate(5deg);
  }

  .welcome-card__marker :global(svg) {
    width: 17px;
    height: 17px;
  }

  .welcome-card__copy {
    position: relative;
    z-index: 1;
    max-width: calc(100% - 40px);
  }

  .welcome-card__overline {
    margin-bottom: 4px;
    color: var(--home-accent);
    font-family: var(--font-controls);
    font-size: var(--text-3xs);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .welcome-card h2 {
    margin-bottom: 7px;
    font-family: var(--font-display);
    font-size: var(--text-xl);
    font-weight: 600;
    line-height: 1.15;
  }

  .welcome-card__copy > p:not(.welcome-card__overline) {
    color: var(--ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
    line-height: 1.45;
  }

  .welcome-card__copy > p + p {
    margin-top: 4px;
  }

  .welcome-card__actions {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 8px;
  }

  .welcome-card__primary,
  .welcome-card__secondary {
    display: flex;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px 12px;
    border: 1px solid var(--home-accent);
    font-family: var(--font-controls);
    font-size: var(--text-xs);
    font-weight: 600;
    line-height: 1.2;
    text-align: center;
    transition:
      background-color 140ms ease-out,
      color 140ms ease-out,
      transform 140ms ease-out;
  }

  .welcome-card__primary {
    color: var(--home-accent-ink);
    background: var(--home-accent);
  }

  .welcome-card__secondary {
    color: var(--ink);
    background: color-mix(in srgb, var(--paper-raised) 92%, var(--home-accent));
  }

  .welcome-card__primary :global(svg),
  .welcome-card__secondary :global(svg) {
    width: 17px;
    height: 17px;
    flex: none;
  }

  .welcome-card__primary:is(:hover, :focus-visible),
  .welcome-card__secondary:is(:hover, :focus-visible) {
    outline: 2px solid var(--home-accent);
    outline-offset: 2px;
    transform: translateY(-1px);
  }

  .welcome-card__secondary:hover {
    background: color-mix(in srgb, var(--paper-raised) 80%, var(--home-accent));
  }

  .welcome-card__switch {
    position: relative;
    z-index: 1;
    display: flex;
    width: fit-content;
    min-height: 32px;
    align-items: center;
    gap: 5px;
    margin: -5px 0 -7px;
    color: var(--ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-2xs);
    text-align: left;
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, currentColor 42%, transparent);
    text-decoration-style: dotted;
    text-underline-offset: 3px;
  }

  .welcome-card__switch:is(:hover, :focus-visible) {
    color: var(--ink);
    outline: none;
    text-decoration-style: solid;
  }

  @media (max-width: 460px) {
    .welcome-card__actions {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .welcome-card__primary,
    .welcome-card__secondary {
      transition-duration: 0.01ms;
    }
  }
</style>
