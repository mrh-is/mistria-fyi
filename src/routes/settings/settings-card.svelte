<script lang="ts">
  import { Icon } from "$lib/components/icon/index.js";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";

  import type { Snippet } from "svelte";

  let {
    children,
    open = $bindable(false),
    summary,
    title,
    variant = "default",
  }: {
    children: Snippet;
    open?: boolean;
    summary: string;
    title: string;
    variant?: "danger" | "default";
  } = $props();
</script>

<Collapsible.Root bind:open>
  <div class:settings-card--danger={variant === "danger"} class="settings-card">
    <div>
      <Collapsible.Trigger class="settings-card__trigger">
        <span class="flex min-w-0 flex-1 flex-col gap-0">
          <span
            class="leading-none font-semibold {variant === 'danger'
              ? 'text-red-700 dark:text-red-400'
              : ''}"
          >
            {title}
          </span>
          <span
            aria-hidden={open}
            class="overflow-hidden text-xs text-muted-foreground transition-[max-height,margin-top,opacity] duration-150 ease-out motion-reduce:transition-none {open
              ? 'mt-0 max-h-0 opacity-0'
              : 'mt-1.5 max-h-4 opacity-100'}"
          >
            {summary}
          </span>
        </span>
        <Icon.UI
          type="disclosure"
          class="mt-0.5 size-5 shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none {open
            ? 'rotate-90'
            : ''}"
        />
      </Collapsible.Trigger>
    </div>
    <Collapsible.Content
      forceMount
      aria-hidden={!open}
      inert={!open}
      class="grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none {open
        ? 'grid-rows-[1fr] opacity-100'
        : 'grid-rows-[0fr] opacity-0'}"
    >
      <div class="min-h-0 overflow-hidden">
        <div class="settings-card__content">
          {@render children()}
        </div>
      </div>
    </Collapsible.Content>
  </div>
</Collapsible.Root>

<style>
  .settings-card {
    border: 1px solid color-mix(in srgb, var(--hairline) 34%, transparent);
    border-left: 3px solid var(--home-accent);
    background: var(--paper-raised);
    box-shadow: var(--shadow-small);
  }

  .settings-card--danger {
    border-color: color-mix(in srgb, var(--destructive) 35%, transparent);
    border-left-color: var(--destructive);
  }

  :global(.settings-card__trigger) {
    display: flex;
    width: 100%;
    align-items: flex-start;
    gap: 12px;
    padding: 13px 14px;
    text-align: left;
  }

  :global(.settings-card__trigger:focus-visible) {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .settings-card__content {
    padding: 8px 14px 16px;
    border-top: 1px dashed color-mix(in srgb, var(--hairline) 34%, transparent);
  }
</style>
