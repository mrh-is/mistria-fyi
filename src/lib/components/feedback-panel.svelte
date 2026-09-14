<script lang="ts">
  import {
    IconChevronDown,
    IconCopy,
    IconPointer,
    IconShield,
    IconX,
  } from "@tabler/icons-svelte-runes";
  import { tick } from "svelte";
  import { toast } from "svelte-sonner";
  import { prefersReducedMotion } from "svelte/motion";
  import { fly, slide } from "svelte/transition";

  import { version } from "$app/environment";
  import FeedbackPicker from "$lib/components/feedback-picker.svelte";
  import FoldoutPanel from "$lib/components/foldout-panel.svelte";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { trackerData } from "$lib/data/index.js";
  import { FeedbackContext } from "$lib/feedback/context.svelte.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import type { ReportableElement } from "$lib/feedback/types.js";

  const TURNSTILE_SITE_KEY = "0x4AAAAAAEjKeNTnEDdgRcXX";

  const FOCUSABLE_SELECTOR =
    'button:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]), input:not([disabled])';

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  let {
    accent,
    feedbackContext = new FeedbackContext(),
    onclose,
    open,
    pickerEnabled = false,
    resetKey,
  }: {
    accent?: string;
    feedbackContext?: FeedbackContext;
    onclose: () => void;
    open: boolean;
    pickerEnabled?: boolean;
    resetKey: string;
  } = $props();

  const CLIENT_TIMEOUT_MS = 15_000;

  let message = $state("");
  let email = $state("");
  let wantsReply = $state(false);
  let includeSaveData = $state(false);
  let showSaveDataPreview = $state(false);
  let submitting = $state(false);
  let submitError = $state("");
  let dialogElement = $state<HTMLElement | null>(null);
  let messageInput = $state<HTMLTextAreaElement | null>(null);
  let pickerButton = $state<HTMLButtonElement | null>(null);
  let selectedElement = $state<ReportableElement | undefined>();
  let previousResetKey = $state("");
  let hasResetKey = false;
  let opener: HTMLElement | null = null;
  let wasOpen = false;
  let pickerActive = $state(false);
  let submitGeneration = 0;
  let activeController: AbortController | null = null;
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

  $effect(() => {
    if (!wantsReply) {
      emailTouched = false;
    }
  });

  $effect(() => {
    if (!includeSaveData) {
      showSaveDataPreview = false;
    }
  });

  let saveDataPreview = $derived.by(() => {
    if (!includeSaveData) return "";
    try {
      const exported = JSON.parse(userState.exportState()) as {
        completed: Record<string, unknown>;
      };
      return JSON.stringify(exported.completed, null, 2);
    } catch {
      return "(could not load progress data)";
    }
  });

  $effect(() => {
    if (!hasResetKey) {
      previousResetKey = resetKey;
      hasResetKey = true;
      return;
    }
    if (resetKey !== previousResetKey) {
      message = "";
      email = "";
      wantsReply = false;
      messageTouched = false;
      emailTouched = false;
      includeSaveData = false;
      showSaveDataPreview = false;
      selectedElement = undefined;
      pickerActive = false;
      feedbackContext.reset();
      submitError = "";
      submitShake = false;
      turnstileToken = "";
      turnstileError = false;
      turnstileInteractive = false;
      previousResetKey = resetKey;
    }
  });

  const TURNSTILE_SCRIPT_TIMEOUT_MS = 10_000;

  function ensureTurnstileScript(): Promise<void> {
    if (window.turnstile) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Turnstile script load timeout"));
      }, TURNSTILE_SCRIPT_TIMEOUT_MS);

      function waitForGlobal() {
        if (window.turnstile) {
          clearTimeout(timer);
          resolve();
        } else {
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
      script.onload = waitForGlobal;
      script.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Turnstile script failed to load"));
      };
      document.head.appendChild(script);
    });
  }

  function renderTurnstile(container: HTMLDivElement): void {
    if (!window.turnstile || !container.isConnected) return;
    if (turnstileWidgetId !== undefined) {
      window.turnstile.remove(turnstileWidgetId);
    }
    turnstileToken = "";
    turnstileReady = false;
    turnstileError = false;
    turnstileInteractive = false;
    turnstileWidgetId = window.turnstile.render(container, {
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
    if (turnstileWidgetId !== undefined && window.turnstile) {
      window.turnstile.reset(turnstileWidgetId);
      turnstileToken = "";
      turnstileReady = false;
      turnstileInteractive = false;
    }
  }

  function removeTurnstileWidget(): void {
    if (turnstileWidgetId !== undefined && window.turnstile) {
      window.turnstile.remove(turnstileWidgetId);
    }
    turnstileWidgetId = undefined;
    turnstileToken = "";
    turnstileReady = false;
    turnstileError = false;
    turnstileInteractive = false;
  }

  $effect(() => {
    if (visible && turnstileContainer) {
      const container = turnstileContainer;
      const gen = ++turnstileGeneration;
      void ensureTurnstileScript().then(
        () => {
          if (gen === turnstileGeneration && container.isConnected) {
            renderTurnstile(container);
          }
        },
        () => {
          if (gen === turnstileGeneration) {
            turnstileError = true;
          }
        },
      );
    }
    if (!open) {
      removeTurnstileWidget();
    }

    return () => {
      removeTurnstileWidget();
    };
  });

  $effect(() => {
    if (visible && !wasOpen) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      wasOpen = true;
      void tick().then(() => dialogElement?.focus());
    } else if (!open && wasOpen) {
      messageTouched = false;
      emailTouched = false;
      submitShake = false;
      const focusTarget = opener;
      opener = null;
      wasOpen = false;
      void tick().then(() => {
        if (focusTarget?.isConnected) {
          focusTarget.focus();
        }
      });
    }
  });

  function handleSubmitClick() {
    if (canSubmit) {
      void handleSubmit();
      return;
    }
    messageTouched = true;
    if (wantsReply && !emailTouched) {
      emailTouched = true;
    }
    void tick().then(() => {
      if (messageInvalid) {
        messageInput?.focus();
      } else if (emailInvalid) {
        document.getElementById("feedback-email")?.focus();
      }
    });
    submitShake = true;
    setTimeout(() => {
      submitShake = false;
    }, 500);
  }

  async function handleSubmit() {
    if (!message.trim() || submitting) return;

    submitting = true;
    submitError = "";
    const generation = ++submitGeneration;

    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    const timeout = setTimeout(() => {
      controller.abort();
    }, CLIENT_TIMEOUT_MS);

    try {
      let saveData: Record<string, unknown> | undefined;
      if (includeSaveData) {
        try {
          const exported = JSON.parse(userState.exportState()) as {
            completed: Record<string, unknown>;
          };
          saveData = exported.completed;
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
        submitError =
          data?.message ?? "Something went wrong. Please try again or copy your message.";
        resetTurnstileWidget();
        return;
      }

      const data = (await response.json()) as {
        emailSaved?: boolean;
        issueUrl: string;
      };

      message = "";
      email = "";
      wantsReply = false;
      messageTouched = false;
      emailTouched = false;
      includeSaveData = false;
      showSaveDataPreview = false;
      selectedElement = undefined;
      onclose();

      if (data.emailSaved === false) {
        toast.warning(
          "Your feedback was submitted, but your contact email could not be saved. " +
            "Sending it again would create a duplicate public issue. " +
            "Please submit a new report later if you still need a private reply.",
          {
            action: {
              label: "View issue",
              onClick: () => window.open(data.issueUrl, "_blank"),
            },
            duration: 12000,
          },
        );
      } else {
        toast("Thanks for your feedback!", {
          action: {
            label: "View issue",
            onClick: () => window.open(data.issueUrl, "_blank"),
          },
          duration: 8000,
        });
      }
    } catch (err) {
      if (generation !== submitGeneration) return;
      if (err instanceof Error && err.name === "AbortError") {
        submitError = "Request timed out. Please try again or copy your message.";
      } else {
        submitError = "Could not connect. Please try again or copy your message.";
      }
      resetTurnstileWidget();
    } finally {
      clearTimeout(timeout);
      if (generation === submitGeneration) {
        submitting = false;
        activeController = null;
      }
    }
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      toast("Message copied to clipboard");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  function startPicking(): void {
    pickerActive = true;
    feedbackContext.startPicking(
      (element) => {
        selectedElement = element;
      },
      () => {
        pickerActive = false;
        void tick().then(() => pickerButton?.focus());
      },
    );
  }

  function handleKeydown(event: KeyboardEvent) {
    if (visible && event.key === "Escape") {
      onclose();
      return;
    }
    if (!visible || event.key !== "Tab") return;

    const focusable = [...(dialogElement?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])];
    const first = focusable.at(0);
    const last = focusable.at(-1);
    if (!first || !last) {
      event.preventDefault();
      return;
    }

    const activeElement = document.activeElement;
    if (event.shiftKey && (activeElement === first || !dialogElement?.contains(activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (activeElement === last || !dialogElement?.contains(activeElement))
    ) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<FeedbackPicker active={pickerActive} {feedbackContext} />

{#if visible}
  <button
    class="fixed inset-x-0 top-[-100dvh] bottom-[-100dvh] z-0"
    type="button"
    aria-hidden="true"
    aria-label="Close feedback"
    tabindex="-1"
    onclick={onclose}
  ></button>

  <div
    bind:this={dialogElement}
    class="fixed right-0 bottom-safe-offset-16 left-0 z-30 mx-auto max-w-lg px-3 outline-none"
    role="dialog"
    aria-label="Send feedback"
    aria-modal="true"
    tabindex="-1"
    style={accent === undefined ? undefined : `--primary: ${accent}; --ring: ${accent};`}
    in:fly={{ duration: prefersReducedMotion.current ? 0 : 150, y: 8 }}
  >
    <FoldoutPanel id="feedback-panel" title="Send feedback" {onclose}>
      <div class="feedback-form">
        <div>
          <textarea
            bind:this={messageInput}
            id="feedback-message"
            aria-label="Message"
            aria-invalid={messageInvalid}
            aria-describedby={messageInvalid ? "feedback-message-error" : undefined}
            class="feedback-form__message {messageInvalid
              ? 'border-destructive ring-destructive/30'
              : 'border-input'} {submitShake && messageInvalid ? 'motion-safe:animate-shake' : ''}"
            placeholder="Comments, questions, suggestions, praise?"
            bind:value={message}
            maxlength={5000}></textarea>
          {#if messageInvalid}
            <p id="feedback-message-error" class="mt-1 text-[11px] text-destructive" role="alert">
              Please enter a message.
            </p>
          {/if}
        </div>

        <p class="feedback-form__privacy">
          <IconShield class="size-4 shrink-0" />Please don&rsquo;t include personal data in your
          message.
        </p>

        <p class="feedback-form__optional">Optional</p>
        <div class="feedback-form__options">
          <div class="flex items-center gap-2">
            <Checkbox class="rounded-sm" id="include-save-data" bind:checked={includeSaveData} />
            <label for="include-save-data" class="flex-1 text-xs select-none">
              Attach my tracker progress <span class="text-muted-foreground"
                >(helps with debugging)</span
              >
            </label>
          </div>

          <div class="flex items-center gap-2">
            <Checkbox class="rounded-sm" id="wants-reply" bind:checked={wantsReply} />
            <label for="wants-reply" class="text-xs select-none">I&rsquo;d like a reply</label>
          </div>

          {#if wantsReply}
            <div
              class="feedback-form__email"
              transition:slide={{ duration: prefersReducedMotion.current ? 0 : 120 }}
            >
              <input
                id="feedback-email"
                aria-label="Your email"
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
                placeholder="you@example.com"
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
                <p id="feedback-email-error" class="mt-1 text-[11px] text-destructive" role="alert">
                  {emailMissing
                    ? "Oops, forgot to put in your email!"
                    : "Hmmmmmmmmmmmmmm, this doesn't look like an email…"}
                </p>
              {:else}
                <p id="feedback-email-note" class="mt-2 text-[11px] text-muted-foreground">
                  Your email is stored separately and never added to the public issue.
                </p>
              {/if}
            </div>
          {/if}
        </div>

        {#if includeSaveData}
          <div
            class="space-y-1"
            transition:slide={{ duration: prefersReducedMotion.current ? 0 : 120 }}
          >
            <p class="text-[11px] leading-relaxed text-muted-foreground">
              Sends your tracked completion state (items checked off, skill levels, etc.). No
              personal information. <strong>This data will be publicly visible.</strong>
            </p>
            <button
              class="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
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
              {showSaveDataPreview ? "Hide" : "Show"} my progress data
            </button>
            {#if showSaveDataPreview}
              <!-- prettier-ignore -->
              <pre
                class="max-h-40 overflow-auto rounded border border-border bg-muted/40 p-2 text-[11px] leading-tight"
                transition:slide={{ duration: prefersReducedMotion.current ? 0 : 120 }}
              >{saveDataPreview}</pre>
            {/if}
          </div>
        {/if}

        <p class="feedback-form__version">
          App v{version} · Game data v{trackerData.version}
        </p>

        {#if submitError}
          <div
            class="flex items-start gap-2 rounded-md bg-destructive/10 p-2.5 text-xs text-destructive"
            role="alert"
          >
            <p class="flex-1">{submitError}</p>
            <button
              class="flex min-h-11 shrink-0 items-center gap-1 rounded px-2 text-[11px] hover:bg-destructive/20"
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
          <p class="text-[11px] text-muted-foreground">
            Verification unavailable. You can still
            <button
              class="underline hover:text-foreground"
              type="button"
              onclick={() =>
                window.open("https://github.com/mrh-is/mistria-fyi/issues/new", "_blank")}
            >
              submit feedback on GitHub</button
            > directly.
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
                onclick={() => (selectedElement = undefined)}
              >
                <IconX class="size-3" />
              </button>
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
  </div>
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
    background: var(--paper-deep);
    padding: 12px 14px;
    font-family: var(--font-body);
    font-size: 15px;
  }

  .feedback-form__message:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .feedback-form__privacy {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--ink-muted);
    font-family: var(--font-annotation);
    font-size: 12px;
  }

  .feedback-form__optional,
  .feedback-form__version {
    color: var(--ink-muted);
    font-family: var(--font-controls);
    font-size: 9px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .feedback-form__options {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 13px;
    border: 1px solid color-mix(in srgb, var(--hairline) 42%, transparent);
    background: var(--paper-deep);
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
    border: 1px solid color-mix(in srgb, var(--hairline) 48%, transparent);
    padding: 6px 13px;
    font-family: var(--font-controls);
    font-size: 10px;
  }

  .feedback-form__actions > button:is(:hover, :focus-visible) {
    background: var(--accent);
    outline: 2px solid var(--primary);
    outline-offset: -4px;
  }

  .feedback-form__selection {
    min-width: 0;
    justify-content: flex-start;
    color: var(--ink-muted);
  }

  .feedback-form__selection button {
    min-height: 32px;
    padding-inline: 5px;
  }

  .feedback-form__clear {
    display: grid;
    width: 32px;
    place-items: center;
  }

  .feedback-form__send {
    color: var(--ink-muted);
    background: var(--paper-deep);
  }

  .feedback-form__send--ready {
    color: var(--primary-foreground);
    background: var(--primary);
  }

  .feedback-form__send--ready:is(:hover, :focus-visible) {
    color: var(--primary-foreground);
    background: color-mix(in srgb, var(--primary) 88%, var(--ink));
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
