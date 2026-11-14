<script lang="ts">
  import IconPencil from "@tabler/icons-svelte-runes/icons/pencil";
  import IconSparkles from "@tabler/icons-svelte-runes/icons/sparkles";
  import { onMount } from "svelte";

  import { trackingReminders } from "#lib/controllers/tracking-reminders.svelte.js";
  import { currentDevice } from "#lib/sync/device.js";
  import { localizedHref } from "#lib/utils/localized-href.js";

  let syncComputer = $state(true);
  let {
    body = "Let’s get you set up to keep track of all that hard work. How do you wanna work?",
    framed = true,
    onSync,
    title = "Ready to get started?",
  }: {
    body?: string;
    framed?: boolean;
    onSync?: () => void;
    title?: string;
  } = $props();

  onMount(() => {
    syncComputer = currentDevice().computer;
  });

  function startManually(): void {
    void trackingReminders.chooseHandTracking();
  }
</script>

<section class="welcome-card" class:welcome-card--framed={framed} aria-label="Getting started">
  {#if framed}
    <div class="welcome-card__marker" aria-hidden="true">
      <IconSparkles />
    </div>
  {/if}

  <div class="welcome-card__copy">
    {#if framed}<p class="welcome-card__overline">New field guide</p>{/if}
    <h2>{title}</h2>
    <p>{body}</p>
  </div>

  <div class="welcome-card__choices">
    <a
      class="welcome-card__choice welcome-card__choice--sync"
      href={localizedHref("sync")}
      onclick={onSync}
    >
      <IconSparkles aria-hidden="true" />
      <span>
        <span class="welcome-card__choice-title">Sync from my farm automagically</span>
        <span class="welcome-card__choice-sub">
          {syncComputer
            ? "Set up in 2 minutes, plus phone sync"
            : "Set up in 2 minutes from your gaming computer"}
        </span>
      </span>
    </a>
    <button class="welcome-card__choice" type="button" onclick={startManually}>
      <IconPencil aria-hidden="true" />
      <span>
        <span class="welcome-card__choice-title">I’ll track it all by hand</span>
        <span class="welcome-card__choice-sub">The way my ancestors did it</span>
      </span>
    </button>
  </div>
</section>

<style>
  .welcome-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .welcome-card--framed {
    padding: 19px 18px 16px 21px;
    overflow: clip;
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 38%, transparent);
    border-left: 3px solid var(--color-home-accent);
    background:
      linear-gradient(
        135deg,
        color-mix(in srgb, var(--color-home-accent) 7%, transparent),
        transparent 55%
      ),
      var(--color-paper-raised);
    box-shadow: var(--shadow-small);
  }

  .welcome-card--framed::after {
    position: absolute;
    right: -19px;
    bottom: -26px;
    width: 84px;
    height: 84px;
    border: 1px solid color-mix(in srgb, var(--color-home-accent) 12%, transparent);
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
    color: var(--color-home-accent);
    background: color-mix(in srgb, var(--color-home-accent) 10%, var(--color-paper-raised));
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
    color: var(--color-home-accent);
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
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
    line-height: 1.45;
  }

  .welcome-card__choices {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Whole-card choices: the title in the controls face, a subtitle in the annotation face. */
  .welcome-card__choice {
    display: flex;
    min-height: 44px;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border: 1px solid var(--color-home-accent);
    color: var(--color-ink);
    background: color-mix(in srgb, var(--color-paper-raised) 92%, var(--color-home-accent));
    text-align: left;
    transition: transform 140ms ease-out;
  }

  .welcome-card__choice--sync {
    color: var(--color-home-accent-foreground);
    background: var(--color-home-accent);
  }

  .welcome-card__choice > span {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }

  .welcome-card__choice :global(svg) {
    width: 17px;
    height: 17px;
    flex: none;
  }

  .welcome-card__choice-title {
    font-family: var(--font-controls);
    font-size: var(--text-xs);
    font-weight: 600;
    line-height: 1.25;
  }

  .welcome-card__choice-sub {
    font-family: var(--font-annotation);
    font-size: var(--text-2xs);
    line-height: 1.3;
  }

  .welcome-card__choice:is(:hover, :focus-visible) {
    outline: 2px solid var(--color-home-accent);
    outline-offset: 2px;
    transform: translateY(-1px);
  }

  @media (prefers-reduced-motion: reduce) {
    .welcome-card__choice {
      transition-duration: 0.01ms;
    }
  }
</style>
