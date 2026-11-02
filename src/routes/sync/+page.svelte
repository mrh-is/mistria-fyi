<script lang="ts">
  import IconDeviceDesktop from "@tabler/icons-svelte-runes/icons/device-desktop";
  import IconDeviceMobile from "@tabler/icons-svelte-runes/icons/device-mobile";
  import IconPencil from "@tabler/icons-svelte-runes/icons/pencil";
  import { onDestroy, onMount, tick } from "svelte";

  import PageHeader from "#lib/components/page-header.svelte";
  import StatusNote from "#lib/components/status-note.svelte";
  import SyncTagDialog from "#lib/components/sync/sync-tag-dialog.svelte";
  import * as m from "#lib/paraglide/messages.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { currentDevice } from "#lib/sync/device.js";
  import { parseFollowLink } from "#lib/sync/follow.js";
  import { syncNotice } from "#lib/sync/notice.svelte.js";
  import { browserGivesHandles } from "#lib/sync/save-source.js";
  import { followCode, retryPendingRetires, stopSyncing, switchCode } from "#lib/sync/sharing.js";
  import { BACKUP_FILE_PREFIX, downloadJson } from "#lib/utils/download.js";
  import { localizedHref } from "#lib/utils/localized-href.js";
  import { goto, replaceState } from "$app/navigation";
  import { page } from "$app/state";

  import ComputerSetup from "./computer-setup.svelte";
  import FollowSetup from "./follow-setup.svelte";
  import OnlySaveNote from "./only-save-note.svelte";
  import WhereChoice from "./where-choice.svelte";

  import type { FollowKey } from "#lib/sync/follow.js";
  import type { FollowOutcome } from "#lib/sync/sharing.js";

  /** How often a code with no save waiting checks again, in milliseconds. */
  const WAITING_POLL_MS = 30_000;

  let device = $state(currentDevice());
  let override = $state<"computer" | "phone" | null>(null);
  const computer = $derived(override === null ? device.computer : override === "computer");

  type View = "computer" | "follow" | "start";
  let ready = $state(false);
  let view = $state<View>("start");
  /** The followed key lives only here until the first save applies (docs/sync.md § Following). */
  let key = $state<FollowKey | undefined>();
  let outcome = $state<FollowOutcome | undefined>();
  let pending = $state(false);
  let alreadyHere = $state(false);
  let announcement = $state("");

  let freshOpen = $state(false);
  let chromeTipOpen = $state(false);
  let iosOpen = $state(false);
  let iosSteps = $state(false);
  let switchOpen = $state(false);
  let switchKey: FollowKey | undefined;
  let freshConfirmed = false;
  let iosAnswered = false;
  let afterGates: (() => void) | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  let retryPoll: (() => void) | undefined;
  let destroyed = false;
  /** Bumped whenever the player leaves the follow flow, so a request already running can't apply. */
  let followGeneration = 0;

  const lane = $derived(userState.syncLane);

  function announce(message: string): void {
    announcement = message;
  }

  function startComputer(): void {
    view = "computer";
    chromeTipOpen = !browserGivesHandles();
  }

  async function copyPageLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(page.url.href);
    } catch {
      // Leave the tip open so the player can retry or copy the address by hand.
    }
  }

  /** Runs `next` once the iOS question & the fresh-start warning, where they apply, are settled. */
  function throughGates(next: () => void, ios: boolean): void {
    afterGates = next;
    if (ios && device.iosBrowser && !iosAnswered) {
      iosOpen = true;
      return;
    }
    if (userState.syncLane === undefined && userState.hasAnyProgress && !freshConfirmed) {
      freshOpen = true;
      return;
    }
    afterGates = undefined;
    next();
  }

  function continueGates(): void {
    const next = afterGates;
    if (next) throughGates(next, view === "follow");
  }

  async function follow(): Promise<void> {
    const following = key;
    if (!following) return;
    const generation = followGeneration;
    // Only the code still on this page, in the follow flow, may erase & start the lane.
    const current = () => !destroyed && generation === followGeneration && key === following;
    pending = true;
    const result = await followCode(following, current);
    if (!current()) return;
    pending = false;
    settle(result, () => void follow());
  }

  /** Leaves the follow flow: forgets the key, stops checking, & orphans any request in flight. */
  function cancelFollow(): void {
    followGeneration++;
    key = undefined;
    outcome = undefined;
    pending = false;
    stopPolling();
  }

  function settle(result: FollowOutcome, retry: () => void): void {
    outcome = result;
    if (result.kind === "applied") {
      stopPolling();
      syncNotice.show(result.save.modified);
      void goto(localizedHref(""));
      return;
    }
    if (result.kind === "empty") {
      retryPoll = retry;
      startPolling();
    } else {
      stopPolling();
    }
  }

  function startPolling(): void {
    if (poll !== undefined) return;
    poll = setInterval(() => {
      if (!pending) retryPoll?.();
    }, WAITING_POLL_MS);
  }

  function stopPolling(): void {
    if (poll !== undefined) clearInterval(poll);
    poll = undefined;
    retryPoll = undefined;
  }

  function handleKey(next: FollowKey): void {
    const current = userState.syncLane;
    if (current?.kind === "computer") {
      alreadyHere = true;
      return;
    }
    if (current?.kind === "following") {
      if (current.key === next) {
        void goto(localizedHref(""));
        return;
      }
      switchKey = next;
      switchOpen = true;
      return;
    }
    key = next;
    outcome = undefined;
    view = "follow";
    throughGates(() => void follow(), true);
  }

  async function switchFollow(following: FollowKey, generation: number): Promise<void> {
    const current = () => !destroyed && generation === followGeneration;
    pending = true;
    const result = await switchCode(following, current);
    if (!current()) return;
    pending = false;
    settle(result, () => void switchFollow(following, generation));
  }

  async function confirmSwitch(): Promise<void> {
    switchOpen = false;
    if (!switchKey) return;
    // Each confirmed switch orphans the previous one's retries, so only the newest code can apply.
    stopPolling();
    const generation = ++followGeneration;
    await switchFollow(switchKey, generation);
  }

  async function stop(): Promise<void> {
    await stopSyncing();
    void goto(localizedHref("data"));
  }

  function backup(): void {
    downloadJson(userState.exportBackup(), BACKUP_FILE_PREFIX);
  }

  function trackByHand(): void {
    cancelFollow();
    userState.markDefaultUnlocksComplete();
    void goto(localizedHref(""));
  }

  function init(): void {
    device = currentDevice();
    // Opening a code strips its fragment, so the key never lingers in the address bar or history.
    const fromLink = parseFollowLink(page.url.href);
    if (page.url.hash !== "") {
      replaceState(page.url.pathname + page.url.search, page.state);
    }
    void retryPendingRetires();
    const current = userState.syncLane;
    if (current?.kind === "computer") view = "computer";
    else if (current?.kind === "following" || !computer) view = "follow";
    ready = true;
    if (fromLink) handleKey(fromLink);
    else if (view === "follow" && current === undefined) throughGates(() => undefined, true);
  }

  onMount(() => {
    // The root layout loads stored progress in its own `onMount`, which runs after this one.
    void (async () => {
      await tick();
      init();
    })();
  });

  onDestroy(() => {
    destroyed = true;
    stopPolling();
  });
</script>

<PageHeader title={m.sync_page_title()} backLabel={m.common_go_back()} historyBack />

<div class="sync-page">
  <div class="sr-only" role="status" aria-live="polite">{announcement}</div>

  {#if !ready}
    <!-- Nothing renders until stored progress has loaded, so no lane flashes the wrong view. -->
  {:else if userState.syncBlocked}
    <StatusNote tone="warning">
      <p>{m.sync_blocked()}</p>
      <a class="underline" href={localizedHref("data")}>{m.data_title()}</a>
    </StatusNote>
  {:else if alreadyHere}
    <StatusNote tone="success">{m.sync_already_here()}</StatusNote>
    <ComputerSetup {announce} linkOrigin={page.url.origin} />
  {:else if view === "computer"}
    <ComputerSetup {announce} linkOrigin={page.url.origin} />
  {:else if view === "follow"}
    <FollowSetup
      onkey={handleKey}
      onstop={stop}
      {outcome}
      {pending}
      showStop={lane?.kind === "following"}
    />
    <OnlySaveNote {computer} />
    <div class="sync-page__small">
      {#if lane === undefined}
        <button type="button" class="sync-small-button" onclick={trackByHand}>
          <IconPencil aria-hidden="true" />
          {m.sync_where_hand()}
        </button>
      {/if}
      {#if computer || lane === undefined}
        <button
          type="button"
          class="sync-small-button"
          onclick={() => {
            cancelFollow();
            override = "computer";
            view = "start";
          }}
        >
          <IconDeviceDesktop aria-hidden="true" />
          {m.sync_override_computer()}
        </button>
      {/if}
    </div>
  {:else}
    <h2 class="sync-page__title">{m.sync_where_title()}</h2>
    <WhereChoice
      mac={device.mac}
      onother={() => {
        view = "follow";
        throughGates(() => undefined, true);
      }}
      onhere={() => {
        cancelFollow();
        throughGates(startComputer, false);
      }}
      onhand={trackByHand}
    />
    <OnlySaveNote {computer} />
    <div class="sync-page__small">
      <button
        type="button"
        class="sync-small-button"
        onclick={() => {
          override = "phone";
          view = "follow";
          throughGates(() => undefined, true);
        }}
      >
        <IconDeviceMobile aria-hidden="true" />
        {m.sync_override_phone()}
      </button>
    </div>
  {/if}
</div>

<SyncTagDialog
  bind:open={chromeTipOpen}
  title={m.sync_tip_chrome()}
  body={m.sync_tip_chrome_body()}
  actions={[
    {
      label: m.sync_tip_chrome_dismiss(),
      onclick: () => {
        chromeTipOpen = false;
      },
    },
    { label: m.sync_tip_chrome_copy(), onclick: () => void copyPageLink(), primary: true },
  ]}
>
  <p>{m.sync_tip_chrome_after()}</p>
</SyncTagDialog>

<SyncTagDialog
  bind:open={freshOpen}
  title={m.sync_fresh_title()}
  body={m.sync_fresh_body()}
  actions={[
    { label: m.sync_fresh_backup(), onclick: backup },
    {
      label: m.sync_fresh_confirm(),
      onclick: () => {
        freshConfirmed = true;
        freshOpen = false;
        continueGates();
      },
      primary: true,
    },
    {
      label: m.sync_fresh_cancel(),
      onclick: () => {
        freshOpen = false;
        afterGates = undefined;
        cancelFollow();
        view = computer ? "start" : "follow";
        if (!computer) void goto(localizedHref(""));
      },
    },
  ]}
/>

<SyncTagDialog
  bind:open={iosOpen}
  title={m.sync_ios_title()}
  body={m.sync_ios_body()}
  actions={[
    {
      label: m.sync_ios_here({ browser: device.browserName }),
      onclick: () => {
        iosAnswered = true;
        iosOpen = false;
        continueGates();
      },
    },
    ...(iosSteps
      ? []
      : [
          {
            label: m.sync_ios_app(),
            onclick: () => {
              iosSteps = true;
            },
            primary: true,
          },
        ]),
  ]}
>
  {#if iosSteps}
    <p>{m.sync_ios_app_steps()}</p>
  {/if}
</SyncTagDialog>

<SyncTagDialog
  bind:open={switchOpen}
  title={m.sync_switch_title()}
  body={m.sync_switch_body()}
  actions={[
    { label: m.sync_switch_backup(), onclick: backup },
    { label: m.sync_switch_confirm(), onclick: () => void confirmSwitch(), primary: true },
    {
      label: m.sync_switch_cancel(),
      onclick: () => {
        switchOpen = false;
      },
    },
  ]}
/>

<style>
  .sync-page {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 18px 16px 28px;
  }

  .sync-page__title {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-style: italic;
    line-height: 1.15;
  }

  .sync-page__small {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  /* Small hairline buttons for the overrides & the Mac option, findable without competing. */
  :global(.sync-small-button) {
    display: inline-flex;
    width: fit-content;
    min-height: 32px;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 60%, transparent);
    background: var(--color-paper-raised);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    cursor: pointer;
  }

  :global(.sync-small-button svg) {
    width: 14px;
    height: 14px;
  }

  :global(.sync-small-button:is(:hover, :focus-visible, :focus-within)) {
    outline: 2px solid var(--color-home-accent);
    outline-offset: 2px;
  }

  @media (max-width: 767px) {
    :global(.sync-small-button) {
      min-height: 44px;
    }
  }
</style>
