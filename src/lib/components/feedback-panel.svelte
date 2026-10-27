<script lang="ts">
  import IconChevronDown from "@tabler/icons-svelte-runes/icons/chevron-down";
  import IconCopy from "@tabler/icons-svelte-runes/icons/copy";
  import IconPointer from "@tabler/icons-svelte-runes/icons/pointer";
  import IconShield from "@tabler/icons-svelte-runes/icons/shield";
  import IconX from "@tabler/icons-svelte-runes/icons/x";
  import { onDestroy, tick } from "svelte";
  import { toast } from "svelte-sonner";
  import { prefersReducedMotion } from "svelte/motion";
  import { slide } from "svelte/transition";

  import FeedbackPicker from "#lib/components/feedback-picker.svelte";
  import FoldoutPanel from "#lib/components/foldout-panel.svelte";
  import PanelOverlay from "#lib/components/panel-overlay.svelte";
  import { Checkbox } from "#lib/components/ui/checkbox/index.js";
  import { trackerData } from "#lib/data/index.js";
  import { getFeedbackContext } from "#lib/feedback/context.svelte.js";
  import * as m from "#lib/paraglide/messages.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { version } from "$app/env";

  import type { ReportTarget } from "#lib/feedback/types.js";
  import type { SerializedState } from "#lib/stores/progress-storage.js";

  const TURNSTILE_SITE_KEY = "0x4AAAAAAEjKeNTnEDdgRcXX";

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  const feedbackContext = getFeedbackContext();

  let {
    accentColor,
    onClose,
    open,
    pickerEnabled = false,
    restoreFocus = true,
  }: {
    accentColor?: string;
    onClose: () => void;
    open: boolean;
    pickerEnabled?: boolean;
    restoreFocus?: boolean;
  } = $props();

  const CLIENT_TIMEOUT_MS = 15_000;

  let message = $state("");
  let email = $state("");
  let wantsReply = $state(false);
  let includeSaveData = $state(false);
  let showProgressInfo = $state(false);
  let showSaveDataPreview = $state(false);
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

  let saveDataPreview = $derived.by(() => {
    if (!includeSaveData) return "";
    try {
      const exported = JSON.parse(userState.exportBackup()) as SerializedState;
      return JSON.stringify(exported.progress, null, 2);
    } catch {
      return "(could not load progress data)";
    }
  });

  const TURNSTILE_SCRIPT_TIMEOUT_MS = 10_000;

  function ensureTurnstileScript(): Promise<void> {
    if (globalThis.turnstile) return Promise.resolve();

    return new Promise((resolve, reject) => {
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        reject(new Error("Turnstile script load timeout"));
      }, TURNSTILE_SCRIPT_TIMEOUT_MS);

      function waitForGlobal() {
        if (globalThis.turnstile) {
          clearTimeout(timer);
          resolve();
        } else if (!timedOut) {
          setTimeout(waitForGlobal, 50);
        }
      }

      const existing = document.querySelector('script[src*="turnstile"]');
      if (existing) {
        waitForGlobal();
        return;
      }

      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.addEventListener("load", waitForGlobal);
      script.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("Turnstile script failed to load"));
      });
      document.head.append(script);
    });
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
      toast(m.feedback_toast_copied());
    } catch {
      toast.error(m.feedback_toast_copy_failed());
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
      let saveData: Record<string, unknown> | undefined;
      if (includeSaveData) {
        try {
          const exported = JSON.parse(userState.exportBackup()) as SerializedState;
          saveData = exported.progress;
        } catch {
          // Serialization failed; submit without save data
        }
      }

      const response = await fetch("/api/feedback", {
        body: JSON.stringify({
          appVersion: version,
          email: wantsReply ? email.trim() || undefined : undefined,
          gameDataVersion: trackerData.version,
          message: message.trim(),
          saveData,
          selectedElement,
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
        submitError = data?.message ?? m.feedback_error_generic();
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
      showProgressInfo = false;
      showSaveDataPreview = false;
      selectedElement = undefined;
      onClose();

      if (data.dryRun) {
        toast(m.feedback_toast_dry_run(), { duration: 8000 });
      } else if (data.emailSaved === false) {
        toast.warning(m.feedback_toast_email_not_saved(), {
          action: {
            label: m.feedback_action_view_issue(),
            onClick: () => window.open(data.issueUrl, "_blank", "noopener"),
          },
          duration: 12_000,
        });
      } else {
        toast(m.feedback_toast_thanks(), {
          action: {
            label: m.feedback_action_view_issue(),
            onClick: () => window.open(data.issueUrl, "_blank", "noopener"),
          },
          duration: 8000,
        });
      }
    } catch (error) {
      if (generation !== submitGeneration) return;
      submitError =
        error instanceof Error && error.name === "AbortError"
          ? m.feedback_error_timeout()
          : m.feedback_error_offline();
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
</script>

<FeedbackPicker active={pickerActive} {feedbackContext} />

{#if visible}
  <PanelOverlay
    focus={manageFocus}
    closeLabel={m.feedback_close_aria()}
    label={m.toolbar_send_feedback()}
    {onClose}
    style={accentColor === undefined
      ? undefined
      : `--primary: ${accentColor}; --ring: ${accentColor};`}
  >
    <FoldoutPanel id="feedback-panel" title={m.toolbar_send_feedback()} isModal={false} {onClose}>
      <div class="feedback-form">
        <div>
          <textarea
            bind:this={messageInput}
            id="feedback-message"
            aria-label={m.feedback_message_label()}
            aria-invalid={messageInvalid}
            aria-describedby={messageInvalid ? "feedback-message-error" : undefined}
            class="feedback-form__message {messageInvalid
              ? 'border-destructive ring-destructive/30'
              : 'border-input'} {submitShake && messageInvalid ? 'motion-safe:animate-shake' : ''}"
            placeholder={m.feedback_message_placeholder()}
            bind:value={message}
            maxlength={5000}></textarea>
          {#if messageInvalid}
            <p id="feedback-message-error" class="mt-1 text-2xs text-destructive" role="alert">
              {m.feedback_message_required()}
            </p>
          {/if}
        </div>

        <p class="feedback-form__privacy">
          <IconShield class="size-4 shrink-0" />{m.feedback_privacy_notice()}
        </p>

        <p class="feedback-form__optional">{m.feedback_optional_label()}</p>
        <div class="feedback-form__options">
          <div class="flex items-center gap-2">
            <Checkbox
              class="rounded-sm"
              id="include-save-data"
              checked={includeSaveData}
              onCheckedChange={(checked) => {
                includeSaveData = checked;
                if (!checked) showSaveDataPreview = false;
              }}
            />
            <label for="include-save-data" class="flex-1 text-xs select-none">
              {m.feedback_attach_progress_label()}
            </label>
            <button
              class="flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground"
              type="button"
              onclick={() => {
                showProgressInfo = !showProgressInfo;
              }}
            >
              <IconChevronDown
                class="size-3 transition-transform motion-reduce:transition-none {showProgressInfo
                  ? 'rotate-180'
                  : ''}"
              />
              {showProgressInfo ? m.feedback_toggle_less() : m.feedback_toggle_read_more()}
            </button>
          </div>

          {#if showProgressInfo}
            <div
              class="space-y-1 pl-7"
              transition:slide={{ duration: prefersReducedMotion.current ? 0 : 120 }}
            >
              <p class="text-2xs leading-relaxed text-muted-foreground">
                {m.feedback_save_data_description()}
                <strong>{m.feedback_save_data_public_warning()}</strong>
              </p>
              <button
                class="flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground"
                type="button"
                onclick={() => {
                  showSaveDataPreview = !showSaveDataPreview;
                }}
              >
                <IconChevronDown
                  class="size-3 transition-transform motion-reduce:transition-none {showSaveDataPreview
                    ? 'rotate-180'
                    : ''}"
                />
                {showSaveDataPreview
                  ? m.feedback_hide_progress_data()
                  : m.feedback_show_progress_data()}
              </button>
              {#if showSaveDataPreview}
                <!-- prettier-ignore -->
                <pre
                  class="max-h-40 overflow-auto rounded border border-border bg-muted/40 p-2 text-2xs leading-tight"
                  transition:slide={{ duration: prefersReducedMotion.current ? 0 : 120 }}
                >{saveDataPreview}</pre>
              {/if}
            </div>
          {/if}

          <div class="flex items-center gap-2">
            <Checkbox
              class="rounded-sm"
              id="wants-reply"
              checked={wantsReply}
              onCheckedChange={(checked) => {
                wantsReply = checked;
                if (!checked) emailTouched = false;
              }}
            />
            <label for="wants-reply" class="text-xs select-none"
              >{m.feedback_wants_reply_label()}</label
            >
          </div>

          {#if wantsReply}
            <div
              class="feedback-form__email"
              transition:slide={{ duration: prefersReducedMotion.current ? 0 : 120 }}
            >
              <input
                id="feedback-email"
                aria-label={m.feedback_email_aria()}
                aria-invalid={emailInvalid}
                aria-describedby={emailInvalid ? "feedback-email-error" : "feedback-email-note"}
                autocomplete="email"
                class="w-full border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {emailInvalid
                  ? 'border-destructive ring-destructive/30'
                  : 'border-input'} {submitShake && emailInvalid
                  ? 'motion-safe:animate-shake'
                  : ''}"
                type="email"
                name="email"
                placeholder={m.feedback_email_placeholder()}
                bind:value={email}
                onblur={() => {
                  emailTouched = true;
                }}
                onkeydown={(e: KeyboardEvent) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSubmitClick();
                  }
                }}
              />
              {#if emailInvalid}
                <p id="feedback-email-error" class="mt-1 text-2xs text-destructive" role="alert">
                  {emailMissing ? m.feedback_email_missing() : m.feedback_email_invalid()}
                </p>
              {:else}
                <p id="feedback-email-note" class="mt-2 text-2xs text-muted-foreground">
                  {m.feedback_email_note()}
                </p>
              {/if}
            </div>
          {/if}
        </div>

        <p class="feedback-form__version">
          {m.feedback_version_info({ appVersion: version, gameVersion: trackerData.version })}
        </p>

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
              {m.feedback_copy_action()}
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
            {m.feedback_turnstile_unavailable_intro()}
            <a
              class="underline hover:text-foreground"
              href="https://github.com/mrh-is/mistria-fyi/issues/new"
              rel="noopener noreferrer"
              target="_blank"
            >
              {m.feedback_turnstile_github_action()}</a
            >
            {m.feedback_turnstile_unavailable_suffix()}
          </p>
        {/if}

        <div class="feedback-form__actions">
          {#if selectedElement}
            <div class="feedback-form__selection">
              <IconPointer class="size-3.5 shrink-0" />
              <span class="min-w-0 flex-1 truncate">{selectedElement.displayName}</span>

              <button bind:this={pickerButton} type="button" onclick={startPicking}
                >{m.feedback_change_selection()}</button
              >

              <button
                class="feedback-form__clear"
                type="button"
                aria-label={m.feedback_clear_selection_aria()}
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
              <IconPointer class="size-3.5" />{m.feedback_pick_action()}
            </button>
          {/if}
          <button
            class="feedback-form__send {canSubmit ? 'feedback-form__send--ready' : ''}"
            type="button"
            disabled={submitting}
            onclick={handleSubmitClick}
          >
            {submitting ? m.feedback_sending_action() : m.feedback_send_action()}
          </button>
        </div>
      </div>
    </FoldoutPanel>
  </PanelOverlay>
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
    gap: 8px;
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
  }

  .feedback-form__optional,
  .feedback-form__version {
    color: var(--color-ink-muted);
    font-family: var(--font-controls);
    font-size: var(--text-3xs);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .feedback-form__options {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 13px;
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 42%, transparent);
    background: var(--color-paper-sunken);
  }

  .feedback-form__email {
    padding-left: 28px;
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
