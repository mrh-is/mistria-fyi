<script lang="ts">
  import { ChevronDown, Copy, MessageCircleWarning, SquareMousePointer, X } from "@lucide/svelte";
  import { tick } from "svelte";
  import { toast } from "svelte-sonner";
  import { fly, slide } from "svelte/transition";

  import { version } from "$app/environment";
  import FeedbackPicker from "$lib/components/feedback-picker.svelte";
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
    feedbackContext = new FeedbackContext(),
    onclose,
    open,
    pickerEnabled = false,
    resetKey,
  }: {
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
      void tick().then(() => messageInput?.focus());
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

      const data = (await response.json()) as { issueUrl: string };

      message = "";
      email = "";
      wantsReply = false;
      messageTouched = false;
      emailTouched = false;
      includeSaveData = false;
      showSaveDataPreview = false;
      selectedElement = undefined;
      onclose();

      toast("Thanks for your feedback!", {
        action: {
          label: "View issue",
          onClick: () => window.open(data.issueUrl, "_blank"),
        },
        duration: 8000,
      });
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
    class="fixed right-0 bottom-safe-offset-14 left-0 z-30 mx-auto max-w-lg px-3"
    role="dialog"
    aria-label="Send feedback"
    aria-modal="true"
    tabindex="-1"
    in:fly={{ duration: 150, y: 8 }}
  >
    <div
      class="max-h-[80dvh] overflow-y-auto rounded-xl border border-border bg-background shadow-lg"
    >
      <div class="flex flex-col gap-2.5 p-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <MessageCircleWarning class="size-4 text-muted-foreground" />
            <h2 class="text-sm font-semibold">Send feedback</h2>
          </div>
          <button
            class="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            type="button"
            aria-label="Close"
            onclick={onclose}
          >
            <X class="size-4" />
          </button>
        </div>

        <p class="text-xs leading-relaxed text-muted-foreground">
          Comments, questions, suggestions, praise? Send me a note!
        </p>
        <p class="text-xs leading-relaxed text-muted-foreground">
          The info you provide below will be visible by me &amp; anyone else who helps build this
          tracker, so <strong class="text-primary">don&rsquo;t include personal details</strong>.
        </p>
        <p class="text-xs leading-relaxed text-muted-foreground">
          But your email (if you provide it) will be stored separately, where only I can see it. Is
          it ok to reach out if I need more deets?
        </p>

        <div>
          <textarea
            bind:this={messageInput}
            aria-label="Message"
            class="min-h-20 w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {messageInvalid
              ? 'border-destructive ring-destructive/30'
              : 'border-input'} {submitShake && messageInvalid ? 'animate-shake' : ''}"
            placeholder="Describe a problem, suggest an improvement, or report a data error."
            bind:value={message}
            maxlength={5000}></textarea>
          {#if messageInvalid}
            <p class="mt-1 text-[11px] text-destructive">Please enter a message.</p>
          {/if}
        </div>

        {#if selectedElement}
          <div
            class="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5"
          >
            <SquareMousePointer class="size-3.5 shrink-0 text-muted-foreground" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-xs font-medium">{selectedElement.displayName}</p>
              <p class="text-[11px] text-muted-foreground">{selectedElement.category}</p>
            </div>
            <button
              bind:this={pickerButton}
              class="min-h-11 rounded px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              type="button"
              onclick={startPicking}
            >
              Change
            </button>
            <button
              class="flex size-11 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              type="button"
              aria-label="Clear selected item"
              onclick={() => (selectedElement = undefined)}
            >
              <X class="size-3" />
            </button>
          </div>
        {:else if pickerAvailable}
          <button
            bind:this={pickerButton}
            class="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-input px-3 text-xs font-medium hover:bg-accent"
            type="button"
            onclick={startPicking}
          >
            <SquareMousePointer class="size-3.5" />
            Pick an item
          </button>
        {/if}

        <div class="flex items-center gap-2">
          <Checkbox id="wants-reply" bind:checked={wantsReply} />
          <label for="wants-reply" class="text-xs select-none">
            Is it ok to reach out if I need more deets?
            <span class="text-muted-foreground">(totally optional)</span>
          </label>
        </div>

        {#if wantsReply}
          <div transition:slide={{ duration: 120 }}>
            <input
              aria-label="Your email"
              class="w-full rounded-md border bg-transparent px-3 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {emailInvalid
                ? 'border-destructive ring-destructive/30'
                : 'border-input'} {submitShake && emailInvalid ? 'animate-shake' : ''}"
              type="email"
              placeholder="your@email.com"
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
              <p class="mt-1 text-[11px] text-destructive">
                {emailMissing
                  ? "Oops, forgot to put in your email!"
                  : "Hmmmmmmmmmmmmmm, this doesn't look like an email…"}
              </p>
            {/if}
          </div>
        {/if}

        <div class="flex items-center gap-2">
          <Checkbox id="include-save-data" bind:checked={includeSaveData} />
          <label for="include-save-data" class="flex-1 text-xs select-none">
            Include my progress data
            <span class="text-muted-foreground">(helps reproduce issues)</span>
          </label>
        </div>

        {#if includeSaveData}
          <div class="space-y-1" transition:slide={{ duration: 120 }}>
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
              <ChevronDown
                class="size-3 transition-transform {showSaveDataPreview ? 'rotate-180' : ''}"
              />
              {showSaveDataPreview ? "Hide" : "Show"} my progress data
            </button>
            {#if showSaveDataPreview}
              <pre
                class="max-h-40 overflow-auto rounded border border-border bg-muted/40 p-2 text-[11px] leading-tight"
                transition:slide={{ duration: 120 }}>{saveDataPreview}</pre>
            {/if}
          </div>
        {/if}

        <p class="text-[11px] text-muted-foreground">
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
              <Copy class="size-3" />
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

        <button
          class="flex min-h-11 w-full items-center justify-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-colors {canSubmit
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'cursor-default bg-primary/50 text-primary-foreground/60'}"
          type="button"
          aria-disabled={!canSubmit}
          onclick={handleSubmitClick}
        >
          {#if submitting}
            Sending…
          {:else}
            Send feedback
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
