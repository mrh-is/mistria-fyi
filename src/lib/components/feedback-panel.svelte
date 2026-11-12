<script lang="ts">
  import IconCopy from "@tabler/icons-svelte-runes/icons/copy";
  import IconInfoCircle from "@tabler/icons-svelte-runes/icons/info-circle";
  import IconPointer from "@tabler/icons-svelte-runes/icons/pointer";
  import IconUserShield from "@tabler/icons-svelte-runes/icons/user-shield";
  import IconX from "@tabler/icons-svelte-runes/icons/x";
  import { onDestroy, tick, untrack } from "svelte";
  import { toast } from "svelte-sonner";

  import FeedbackPicker from "#lib/components/feedback-picker.svelte";
  import ExtraRow from "#lib/components/feedback/extra-row.svelte";
  import ExtrasCard from "#lib/components/feedback/extras-card.svelte";
  import PreviewSheet from "#lib/components/feedback/preview-sheet.svelte";
  import FoldoutPanel from "#lib/components/foldout-panel.svelte";
  import PanelOverlay from "#lib/components/panel-overlay.svelte";
  import { trackerData } from "#lib/data/index.js";
  import { getFeedbackContext } from "#lib/feedback/context.svelte.js";
  import { progressAttachment } from "#lib/feedback/progress-attachment.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { syncDiagnostics } from "#lib/sync/diagnostics.svelte.js";
  import { ensureTurnstileScript } from "#lib/turnstile.js";
  import { version } from "$app/env";

  import type { Preview } from "#lib/components/feedback/preview-sheet.svelte";
  import type { ReportTarget } from "#lib/feedback/types.js";
  import type { SerializedState } from "#lib/stores/progress-storage.js";

  const TURNSTILE_SITE_KEY = "0x4AAAAAAEjKeNTnEDdgRcXX";

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  const feedbackContext = getFeedbackContext();

  let {
    accentColor,
    allowSyncLog = true,
    initialMessage = "",
    onClose,
    open,
    pickerEnabled = false,
    restoreFocus = true,
  }: {
    accentColor?: string;
    allowSyncLog?: boolean;
    /** Used only when this draft mounts; subsequent edits belong to the user. */
    initialMessage?: string;
    onClose: () => void;
    open: boolean;
    pickerEnabled?: boolean;
    restoreFocus?: boolean;
  } = $props();

  const CLIENT_TIMEOUT_MS = 15_000;

  let message = $state(untrack(() => initialMessage));
  let email = $state("");
  let wantsReply = $state(false);
  let includeSaveData = $state(false);
  let includeSyncLog = $state(false);
  let extrasCardOpen = $state(false);
  let previewOpen = $state(false);
  // Kept after the sheet closes, so its content stays put while it slides away.
  let preview = $state<Preview>("progress");
  // Previewing never opts in: each extra's toggle alone decides whether its data is sent.
  let syncLogSnapshot = $derived(
    allowSyncLog && (includeSyncLog || (previewOpen && preview === "syncLog"))
      ? syncDiagnostics.snapshot(version, userState.syncLane?.kind ?? "manual")
      : undefined,
  );
  let syncLog = $derived(includeSyncLog ? syncLogSnapshot : undefined);
  let submitting = $state(false);
  let submitError = $state("");
  let messageInput = $state<HTMLTextAreaElement | null>(null);
  let pickerButton = $state<HTMLButtonElement | null>(null);
  let selectedElement = $state<ReportTarget | undefined>();
  let opener: HTMLElement | null = null;
  let pickerActive = $state(false);
  let submitGeneration = 0;
  let activeController: AbortController | null = null;
  let submitTimeout: ReturnType<typeof setTimeout> | undefined;
  let visible = $derived(open && !pickerActive);
  let pickerAvailable = $derived(pickerEnabled && feedbackContext.registrations.size > 0);
  let turnstileToken = $state("");
  let turnstileContainer = $state<HTMLDivElement | null>(null);
  let turnstileWidgetId = $state<string | undefined>();
  let turnstileReady = $state(false);
  let turnstileError = $state(false);
  let turnstileGeneration = 0;
  let turnstileInteractive = $state(false);

  let messageTouched = $state(false);
  let messageInvalid = $derived(messageTouched && !message.trim());
  let emailTouched = $state(false);
  let emailInvalid = $derived(
    wantsReply && emailTouched && (email.trim() === "" || !EMAIL_PATTERN.test(email.trim())),
  );
  let emailMissing = $derived(wantsReply && emailTouched && email.trim() === "");
  let canSubmit = $derived(
    message.trim() &&
      !submitting &&
      turnstileReady &&
      (!wantsReply || (email.trim() !== "" && EMAIL_PATTERN.test(email.trim()))),
  );
  let submitShake = $state(false);

  function currentProgressAttachment(): Record<string, unknown> | undefined {
    try {
      const exported = JSON.parse(userState.exportBackup()) as SerializedState;
      return progressAttachment(exported.progress);
    } catch {
      // Serialization failed; there's nothing to show or send.
      return undefined;
    }
  }

  let progressPreview = $derived(
    previewOpen && preview === "progress" ? currentProgressAttachment() : undefined,
  );

  function openPreview(next: Preview): void {
    preview = next;
    previewOpen = true;
  }

  function setAttached(extra: Preview, attached: boolean): void {
    if (extra === "progress") {
      includeSaveData = attached;
    } else {
      includeSyncLog = attached;
    }
  }

  function removeTurnstileWidget(): void {
    if (turnstileWidgetId !== undefined && globalThis.turnstile) {
      globalThis.turnstile.remove(turnstileWidgetId);
    }
    turnstileWidgetId = undefined;
    turnstileToken = "";
    turnstileReady = false;
    turnstileError = false;
    turnstileInteractive = false;
  }

  function renderTurnstile(container: HTMLDivElement): void {
    if (!globalThis.turnstile || !container.isConnected) return;
    if (turnstileWidgetId !== undefined) {
      globalThis.turnstile.remove(turnstileWidgetId);
    }
    turnstileToken = "";
    turnstileReady = false;
    turnstileError = false;
    turnstileInteractive = false;
    turnstileWidgetId = globalThis.turnstile.render(container, {
      "before-interactive-callback": () => {
        turnstileInteractive = true;
      },
      callback: (token: string) => {
        turnstileToken = token;
        turnstileReady = true;
        turnstileInteractive = false;
      },
      "error-callback": () => {
        turnstileToken = "";
        turnstileReady = false;
        turnstileError = true;
        turnstileInteractive = false;
      },
      "expired-callback": () => {
        turnstileToken = "";
        turnstileReady = false;
      },
      sitekey: TURNSTILE_SITE_KEY,
      theme: "auto",
    });
  }

  function resetTurnstileWidget(): void {
    if (turnstileWidgetId !== undefined && globalThis.turnstile) {
      globalThis.turnstile.reset(turnstileWidgetId);
      turnstileToken = "";
      turnstileReady = false;
      turnstileInteractive = false;
    }
  }

  async function loadTurnstileWidget(container: HTMLDivElement, gen: number): Promise<void> {
    try {
      await ensureTurnstileScript();
    } catch {
      if (gen === turnstileGeneration) {
        turnstileError = true;
      }
      return;
    }
    if (gen === turnstileGeneration && container.isConnected) {
      renderTurnstile(container);
    }
  }

  async function afterTick(run: () => void): Promise<void> {
    await tick();
    run();
  }

  $effect(() => {
    if (visible && turnstileContainer) {
      const container = turnstileContainer;
      const gen = ++turnstileGeneration;
      void loadTurnstileWidget(container, gen);
    }
    if (!open) {
      removeTurnstileWidget();
    }

    return () => {
      removeTurnstileWidget();
    };
  });

  let focusGeneration = 0;
  let shakeTimer: ReturnType<typeof setTimeout> | undefined;

  let returningFromPicker = false;

  function manageFocus(element: HTMLElement): () => void {
    const generation = ++focusGeneration;
    opener ??= document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const returning = returningFromPicker;
    returningFromPicker = false;
    if (!returning) {
      void afterTick(() => {
        if (generation === focusGeneration && visible) element.focus();
      });
    }
    return () => {
      const closingGeneration = ++focusGeneration;
      // Read live props after the outgoing block's snapshot has been released.
      void afterTick(() => {
        if (closingGeneration !== focusGeneration || open) return;
        messageTouched = false;
        emailTouched = false;
        submitShake = false;
        clearTimeout(shakeTimer);
        const focusTarget = opener;
        opener = null;
        if (restoreFocus && focusTarget?.isConnected) focusTarget.focus();
      });
    };
  }

  onDestroy(() => {
    ++focusGeneration;
    ++submitGeneration;
    activeController?.abort();
    clearTimeout(submitTimeout);
    clearTimeout(shakeTimer);
    feedbackContext.reset();
  });

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      toast("Message copied to clipboard");
    } catch {
      toast.error(
        "We couldn’t copy that for you. You’ll have to select the text and copy it yourself, sorry!",
      );
    }
  }

  async function handleSubmit() {
    if (!message.trim() || submitting) return;

    submitting = true;
    submitError = "";
    const generation = ++submitGeneration;

    activeController?.abort();
    clearTimeout(submitTimeout);
    const controller = new AbortController();
    activeController = controller;
    const timeout = setTimeout(() => {
      controller.abort();
    }, CLIENT_TIMEOUT_MS);
    submitTimeout = timeout;

    try {
      const saveData = includeSaveData ? currentProgressAttachment() : undefined;

      const response = await fetch("/api/feedback", {
        body: JSON.stringify({
          appVersion: version,
          email: wantsReply ? email.trim() || undefined : undefined,
          gameDataVersion: trackerData.version,
          message: message.trim(),
          saveData,
          selectedElement,
          syncLog,
          turnstileToken,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });

      if (generation !== submitGeneration) return;

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as null | { message?: string };
        if (generation !== submitGeneration) return;
        submitError =
          data?.message ??
          "There was a technical error on our end while recording your feedback. Please try again.";
        resetTurnstileWidget();
        return;
      }

      const data = (await response.json()) as
        | { dryRun: true }
        | { dryRun?: undefined; emailSaved?: boolean; issueUrl: string };
      if (generation !== submitGeneration) return;

      message = "";
      email = "";
      wantsReply = false;
      messageTouched = false;
      emailTouched = false;
      includeSaveData = false;
      includeSyncLog = false;
      previewOpen = false;
      extrasCardOpen = false;
      selectedElement = undefined;
      onClose();

      if (data.dryRun) {
        toast("Preview build: Your feedback passed every check, but nothing was filed.", {
          duration: 8000,
        });
      } else if (data.emailSaved === false) {
        toast.warning(
          "Your feedback went through, but we couldn’t save your email, so I won’t be able to reply. If you still want a private reply, submit feedback again, and I’ll get it sorted out.",
          {
            action: {
              label: "View issue",
              onClick: () => window.open(data.issueUrl, "_blank", "noopener"),
            },
            duration: 12_000,
          },
        );
      } else {
        toast("Thanks for your feedback!", {
          action: {
            label: "View issue",
            onClick: () => window.open(data.issueUrl, "_blank", "noopener"),
          },
          duration: 8000,
        });
      }
    } catch (error) {
      if (generation !== submitGeneration) return;
      submitError =
        error instanceof Error && error.name === /* @wc-ignore */ "AbortError"
          ? "There was a technical error on our end while recording your feedback. Please try again."
          : "We couldn’t send your feedback. Check that you’re online, then please try again.";
      resetTurnstileWidget();
    } finally {
      clearTimeout(timeout);
      if (generation === submitGeneration) {
        submitting = false;
        activeController = null;
      }
    }
  }

  function handleSubmitClick() {
    if (canSubmit) {
      void handleSubmit();
      return;
    }
    messageTouched = true;
    if (wantsReply && !emailTouched) {
      emailTouched = true;
    }
    void afterTick(() => {
      if (messageInvalid) {
        messageInput?.focus();
      } else if (emailInvalid) {
        document.getElementById("feedback-email")?.focus();
      }
    });
    submitShake = true;
    clearTimeout(shakeTimer);
    shakeTimer = setTimeout(() => {
      submitShake = false;
    }, 500);
  }

  function startPicking(): void {
    returningFromPicker = true;
    pickerActive = true;
    feedbackContext.startPicking(
      (element) => {
        selectedElement = element;
      },
      () => {
        pickerActive = false;
        void afterTick(() => pickerButton?.focus());
      },
    );
  }
  const emailPlaceholder = /* @wc-include */ "you@example.com";
</script>

<FeedbackPicker active={pickerActive} {feedbackContext} />

{#if visible}
  <PanelOverlay
    focus={manageFocus}
    closeLabel="Close feedback"
    label="Send feedback"
    {onClose}
    scrim
    style={accentColor === undefined
      ? undefined
      : `--primary: ${accentColor}; --ring: ${accentColor};`}
  >
    <FoldoutPanel id="feedback-panel" title="Send feedback" isModal={false} {onClose}>
      <div class="feedback-form">
        <div>
          <textarea
            bind:this={messageInput}
            id="feedback-message"
            aria-label="Message"
            aria-required="true"
            aria-invalid={messageInvalid}
            aria-describedby={messageInvalid ? "feedback-message-error" : undefined}
            class="feedback-form__message {messageInvalid
              ? 'border-destructive ring-destructive/30'
              : 'border-input'} {submitShake && messageInvalid ? 'motion-safe:animate-shake' : ''}"
            placeholder="What’s up? Bugs, ideas, questions, kind words…"
            bind:value={message}
            maxlength={5000}></textarea>
          {#if messageInvalid}
            <p id="feedback-message-error" class="mt-1 text-2xs text-destructive" role="alert">
              What did you wanna say?
            </p>
          {/if}
          <p class="feedback-form__privacy">
            <IconUserShield class="size-4 shrink-0" aria-hidden="true" />This goes up as a public
            GitHub issue, so leave out anything personal.
          </p>
        </div>

        <div class="feedback-form__extras">
          <div class="feedback-form__extras-heading">
            <span>Optional extras</span>
            <button
              class="feedback-form__extras-info"
              type="button"
              aria-haspopup="dialog"
              aria-label="What the extras send"
              onclick={() => (extrasCardOpen = true)}
              ><IconInfoCircle class="size-3.5" aria-hidden="true" /></button
            >
          </div>
          <div class="feedback-form__rows">
            <ExtraRow
              id="include-save-data"
              checked={includeSaveData}
              description="What you’ve checked off & your skill levels, so we can see what you’re seeing."
              label="Attach progress"
              onCheckedChange={(checked) => (includeSaveData = checked)}
              peek={{
                label: "Peek at my progress",
                onclick: () => openPreview("progress"),
              }}
              visibility="public"
            />
            {#if allowSyncLog}
              <ExtraRow
                id="include-sync-log"
                checked={includeSyncLog}
                description="Your recent save file syncs from this tab, for when syncing acts up. Names & sync links come out first."
                label="Attach sync log"
                onCheckedChange={(checked) => (includeSyncLog = checked)}
                peek={{
                  label: "Peek at my sync log",
                  onclick: () => openPreview("syncLog"),
                }}
                visibility="public"
              />
            {/if}
            <ExtraRow
              id="wants-reply"
              checked={wantsReply}
              description="We’ll ask for your email so Michael can write back. Nobody else sees it, and it never goes on the issue."
              label="Email me back"
              onCheckedChange={(checked) => {
                wantsReply = checked;
                if (!checked) emailTouched = false;
              }}
              visibility="private"
            >
              <input
                id="feedback-email"
                aria-label="Your email"
                aria-invalid={emailInvalid}
                aria-describedby={emailInvalid ? "feedback-email-error" : "feedback-email-note"}
                autocomplete="email"
                class={[
                  "feedback-form__email",
                  emailInvalid && "feedback-form__email--invalid",
                  submitShake && emailInvalid && "motion-safe:animate-shake",
                ]}
                type="email"
                name="email"
                placeholder={emailPlaceholder}
                bind:value={email}
                onblur={() => {
                  emailTouched = true;
                }}
                onkeydown={(e: KeyboardEvent) => {
                  if (e.key === /* @wc-ignore */ "Enter") {
                    e.preventDefault();
                    handleSubmitClick();
                  }
                }}
              />
              {#if emailInvalid}
                <p
                  id="feedback-email-error"
                  class="feedback-form__email-note feedback-form__email-note--error"
                  role="alert"
                >
                  {emailMissing
                    ? "Oops, forgot to put in your email!"
                    : "Hmmmmmmmmmmmmmm, this doesn’t look like an email…"}
                </p>
              {:else}
                <p id="feedback-email-note" class="feedback-form__email-note">
                  Only Michael sees this. It never goes on the issue.
                </p>
              {/if}
            </ExtraRow>
          </div>
        </div>

        {#if submitError}
          <div
            class="flex items-start gap-2 rounded-md bg-destructive/10 p-2.5 text-xs text-destructive"
            role="alert"
          >
            <p class="flex-1">{submitError}</p>
            <button
              class="flex min-h-11 shrink-0 items-center gap-1 rounded px-2 text-2xs hover:bg-destructive/20"
              type="button"
              onclick={copyMessage}
            >
              <IconCopy class="size-3" />
              Copy
            </button>
          </div>
        {/if}

        <div
          bind:this={turnstileContainer}
          class="flex justify-center {turnstileInteractive || turnstileError
            ? ''
            : 'h-0 overflow-hidden'}"
        ></div>

        {#if turnstileError}
          <p class="text-2xs text-muted-foreground">
            Our bot check isn’t loading right now. You can still
            <a
              class="underline hover:text-foreground"
              href="https://github.com/mrh-is/mistria-fyi/issues/new"
              rel="noopener noreferrer"
              target="_blank"
            >
              submit feedback on GitHub</a
            >
            directly.
          </p>
        {/if}

        <div class="feedback-form__actions">
          {#if selectedElement}
            <div class="feedback-form__selection">
              <IconPointer class="size-3.5 shrink-0" />
              <span class="min-w-0 flex-1 truncate">{selectedElement.displayName}</span>

              <button bind:this={pickerButton} type="button" onclick={startPicking}>Change</button>

              <button
                class="feedback-form__clear"
                type="button"
                aria-label="Clear selected item"
                onclick={() => (selectedElement = undefined)}><IconX class="size-3" /></button
              >
            </div>
          {:else if pickerAvailable}
            <button
              bind:this={pickerButton}
              class="feedback-form__pick"
              type="button"
              onclick={startPicking}
            >
              <IconPointer class="size-3.5" />Point at something
            </button>
          {/if}
          <button
            class="feedback-form__send {canSubmit ? 'feedback-form__send--ready' : ''}"
            type="button"
            disabled={submitting}
            onclick={handleSubmitClick}
          >
            {submitting ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </FoldoutPanel>
  </PanelOverlay>

  <ExtrasCard {allowSyncLog} bind:open={extrasCardOpen} onPeek={openPreview} />
  <PreviewSheet
    bind:open={previewOpen}
    {preview}
    attached={preview === "progress" ? includeSaveData : includeSyncLog}
    data={preview === "progress" ? progressPreview : syncLogSnapshot}
    onAttachedChange={(attached) => setAttached(preview, attached)}
  />
{/if}

<style>
  .feedback-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
  }

  .feedback-form__message {
    min-height: 120px;
    width: 100%;
    resize: vertical;
    border-width: 1px;
    background: var(--color-paper-sunken);
    padding: 12px 14px;
    font-family: var(--font-body);
    font-size: var(--text-base);
  }

  .feedback-form__message:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .feedback-form__privacy {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
  }

  /*
   * The ⓘ hangs 4px below its heading, & the first row’s tap area reaches 5px above the row, so a
   * 9px gap lets the two meet without overlapping.
   */
  .feedback-form__extras {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  /* Styled like a shelf heading's label & ⓘ, so the extras read as a quiet second tier. */
  .feedback-form__extras-heading {
    display: flex;
    min-height: 28px;
    align-items: center;
    gap: 2px;
    color: var(--color-ink-muted);
    font-family: var(--font-controls);
    font-size: var(--text-2xs);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .feedback-form__extras-info {
    display: grid;
    width: 36px;
    height: 36px;
    margin-block: -4px;
    place-items: center;
    color: var(--color-ink-muted);
  }

  .feedback-form__extras-info:is(:hover, :focus-visible) {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
  }

  /* Rows share these columns, so every row's tag lines up on the right edge. */
  .feedback-form__rows {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto max-content;
    gap: 8px 10px;
  }

  .feedback-form__email {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    padding: 7px 10px;
    background: var(--color-paper-raised);
    font-family: var(--font-data);
  }

  .feedback-form__email::placeholder {
    color: var(--color-ink-muted);
  }

  .feedback-form__email:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 1px;
  }

  .feedback-form__email--invalid {
    border-color: var(--destructive);
    outline: 1px solid var(--destructive);
  }

  .feedback-form__email-note {
    margin-top: 5px;
    color: var(--color-ink-muted);
    font-family: var(--font-data);
    font-size: var(--text-2xs);
    line-height: 1.45;
  }

  .feedback-form__email-note--error {
    color: var(--destructive);
  }

  .feedback-form__actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(112px, 0.5fr);
    gap: 8px;
  }

  .feedback-form__actions > button,
  .feedback-form__selection {
    display: flex;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 48%, transparent);
    padding: 6px 13px;
    font-family: var(--font-controls);
    font-size: var(--text-3xs);
  }

  .feedback-form__actions > button:not(.feedback-form__send):is(:hover, :focus-visible) {
    background: var(--accent);
    outline: 2px solid var(--primary);
    outline-offset: -4px;
  }

  .feedback-form__selection {
    min-width: 0;
    justify-content: flex-start;
    color: var(--color-ink-muted);
  }

  .feedback-form__selection button {
    min-height: 44px;
    padding-inline: 5px;
  }

  .feedback-form__clear {
    display: grid;
    width: 44px;
    place-items: center;
  }

  @media (hover: hover) and (pointer: fine) {
    .feedback-form__selection button {
      min-height: 32px;
    }

    .feedback-form__clear {
      width: 32px;
    }
  }

  .feedback-form__send {
    color: var(--color-ink);
    background: color-mix(in srgb, var(--primary) 48%, var(--color-paper-sunken));
  }

  .feedback-form__send:only-child {
    grid-column: 1 / -1;
  }

  .feedback-form__send:is(:hover, :focus-visible) {
    background: color-mix(in srgb, var(--primary) 64%, var(--color-paper-sunken));
    outline: 2px solid var(--primary);
    outline-offset: -4px;
  }

  .feedback-form__send--ready {
    color: var(--primary-foreground);
    background: var(--primary);
  }

  .feedback-form__send--ready:is(:hover, :focus-visible) {
    background: color-mix(in srgb, var(--primary) 88%, var(--color-ink));
  }

  @media (max-width: 380px) {
    .feedback-form__actions {
      grid-template-columns: 1fr;
    }

    .feedback-form__pick,
    .feedback-form__selection {
      grid-column: auto;
    }
  }
</style>
