<script lang="ts">
  import IconEye from "@tabler/icons-svelte-runes/icons/eye";
  import IconLink from "@tabler/icons-svelte-runes/icons/link";
  import IconLoader2 from "@tabler/icons-svelte-runes/icons/loader-2";
  import IconPlayerPause from "@tabler/icons-svelte-runes/icons/player-pause";
  import { onMount } from "svelte";

  import StatusNote from "#lib/components/status-note.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as m from "#lib/paraglide/messages.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { syncCourier } from "#lib/sync/courier-state.svelte.js";
  import { buildFollowLink } from "#lib/sync/follow.js";
  import { shareCode, shareFailureCopy } from "#lib/sync/sharing.js";

  import { generateTransferQr } from "../data/transfer-qr.js";

  import type { FollowKey } from "#lib/sync/follow.js";
  import type { ShareFailureCopy } from "#lib/sync/sharing.js";

  import type { TransferQr } from "../data/transfer-qr.js";

  let {
    linkOrigin,
    onpaused,
    onshared,
    revealed = false,
  }: {
    /** The origin the link names: production's, or this preview's own. */
    linkOrigin: string;
    onpaused?: () => void;
    onshared?: () => void;
    /** Starts with an existing code showing, as Data's “Show code” does. */
    revealed?: boolean;
  } = $props();

  type CodeState = "covered" | "making" | "shown";

  // svelte-ignore state_referenced_locally
  let codeState = $state<CodeState>(revealed ? "shown" : "covered");
  let failure = $state<null | ShareFailureCopy>(null);
  let qr = $state<null | TransferQr>(null);
  let copied = $state(false);

  const sharedKey = $derived.by(() => {
    const lane = userState.syncLane;
    return lane?.kind === "computer" ? (lane.code?.key as FollowKey | undefined) : undefined;
  });
  const link = $derived(sharedKey ? buildFollowLink(sharedKey, linkOrigin) : undefined);

  $effect(() => {
    if (link === undefined) {
      qr = null;
      return;
    }
    let current = true;
    void (async () => {
      const generated = await generateTransferQr(link);
      if (current) qr = generated;
    })();
    return () => {
      current = false;
    };
  });

  // A code shown again might be getting scanned right now, so it's worth checking what it holds.
  onMount(() => {
    if (revealed && sharedKey) void syncCourier.check();
  });

  /** Makes the code on first use; reveals it only once its mailbox exists. */
  async function ensureCode(): Promise<boolean> {
    if (sharedKey) {
      void syncCourier.check();
      return true;
    }
    codeState = "making";
    failure = null;
    const result = await shareCode();
    if (result.kind === "shared") {
      onshared?.();
      void syncCourier.check();
      return true;
    }
    failure = shareFailureCopy(result);
    codeState = "covered";
    if (failure === "paused") onpaused?.();
    return false;
  }

  async function show(): Promise<void> {
    if (await ensureCode()) codeState = "shown";
  }

  async function copyLink(): Promise<void> {
    if (!(await ensureCode())) return;
    if (codeState === "making") codeState = "covered";
    const target = sharedKey ? buildFollowLink(sharedKey, linkOrigin) : undefined;
    if (!target) return;
    try {
      await navigator.clipboard.writeText(target);
      copied = true;
    } catch {
      copied = false;
    }
  }
</script>

<div class="code-area">
  {#if failure === "paused"}
    <div class="code-area__paused" role="status">
      <IconPlayerPause aria-hidden="true" />
      <div>
        <p class="code-area__paused-title">{m.sync_paused_title()}</p>
        <p>{m.sync_paused_setup()}</p>
      </div>
    </div>
  {:else}
    <div class="code-area__frame">
      {#if codeState === "shown" && qr}
        <img
          alt={m.sync_code_alt()}
          src={qr.dataUrl}
          width={qr.displayPixels}
          height={qr.displayPixels}
        />
      {:else if codeState === "making"}
        <p class="code-area__making" role="status">
          <IconLoader2 class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {m.sync_making_code()}
        </p>
      {:else}
        <Button variant="outline" size="sm" onclick={show}>
          <IconEye />
          {m.sync_phone_show()}
        </Button>
      {/if}
    </div>
    <p class="code-area__stream">{m.sync_phone_stream()}</p>
    <div class="code-area__link">
      <Button variant="outline" size="sm" disabled={codeState === "making"} onclick={copyLink}>
        <IconLink />
        {copied ? m.sync_find_copied() : m.sync_phone_copy_link()}
      </Button>
      <span>{m.sync_phone_copy_link_sub()}</span>
    </div>
    {#if failure === "unreachable"}
      <StatusNote tone="warning">
        <p class="font-semibold">{m.sync_unreachable_title()}</p>
        <p>{m.sync_unreachable_body()}</p>
        <Button class="mt-2" size="sm" variant="outline" onclick={show}>
          {m.sync_try_again()}
        </Button>
      </StatusNote>
    {:else if failure === "too-many"}
      <StatusNote tone="warning">{m.sync_too_many()}</StatusNote>
    {/if}
  {/if}
</div>

<style>
  .code-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 14px 12px;
    border-block: 1px solid color-mix(in srgb, var(--color-ink-hairline) 38%, transparent);
    background: color-mix(in srgb, var(--color-paper) 70%, var(--color-ink-hairline) 6%);
  }

  /* Photo-mount corners hold the code like a print in a field journal. */
  .code-area__frame {
    position: relative;
    display: grid;
    width: min(100%, 220px);
    aspect-ratio: 1;
    place-items: center;
    padding: 8px;
    background: var(--color-paper-raised);
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 30%, transparent);
  }

  .code-area__frame::before,
  .code-area__frame::after {
    position: absolute;
    width: 12px;
    height: 12px;
    background: var(--color-home-accent);
    content: "";
  }

  .code-area__frame::before {
    top: -2px;
    left: -2px;
    clip-path: polygon(0 0, 100% 0, 0 100%);
  }

  .code-area__frame::after {
    right: -2px;
    bottom: -2px;
    clip-path: polygon(100% 0, 100% 100%, 0 100%);
  }

  .code-area__frame img {
    width: 100%;
    height: auto;
    image-rendering: pixelated;
  }

  .code-area__making {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
  }

  .code-area__stream,
  .code-area__link span {
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-2xs);
    text-align: center;
  }

  .code-area__link {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }

  .code-area__paused {
    display: flex;
    width: 100%;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--color-ink-hairline);
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
    line-height: 1.4;
  }

  .code-area__paused :global(svg) {
    width: 16px;
    flex: none;
  }

  .code-area__paused-title {
    font-weight: 600;
  }
</style>
