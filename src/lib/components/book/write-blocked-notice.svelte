<!--
  The book's notice for storage states that block every edit: data a newer build wrote, storage the
  browser won't read, & data that fails to read. Each holds until it's fixed, so it sits at the top of
  the page with its one way out, instead of a toast you could dismiss & forget. A save that merely
  failed doesn't block edits; `persistence-warning.svelte` raises that one as a toast.
-->
<script lang="ts">
  import * as m from "#lib/paraglide/messages.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { localizedHref } from "#lib/utils/localized-href.js";

  import type { PersistenceFailureKind } from "#lib/stores/user-state.svelte.js";

  type BlockedKind = Exclude<PersistenceFailureKind, "unavailable">;

  interface Notice {
    action: { href: string; label: string } | { label: string; reload: true };
    description?: string;
    title: string;
  }

  const reload = (): Notice["action"] => ({ label: m.book_notice_reload(), reload: true });

  const NOTICES: Record<BlockedKind, () => Notice> = {
    "load-blocked": () => ({
      action: reload(),
      description: m.persistence_warning_load(),
      title: m.persistence_warning_load_title(),
    }),
    "newer-data": () => ({ action: reload(), title: m.persistence_warning_newer_data() }),
    unreadable: () => ({
      action: { href: localizedHref("data"), label: m.data_title() },
      title: m.persistence_warning_unreadable(),
    }),
  };

  let kind = $derived(userState.persistenceFailureKind);
  let notice = $derived(
    userState.persistenceFailed && kind !== "unavailable" ? NOTICES[kind]() : undefined,
  );
</script>

{#if notice}
  <div class="write-blocked" role="alert">
    <div class="write-blocked__text">
      <p class="write-blocked__title">{notice.title}</p>
      {#if notice.description}
        <p class="write-blocked__description">{notice.description}</p>
      {/if}
    </div>
    {#if "href" in notice.action}
      <a class="write-blocked__action" href={notice.action.href}>{notice.action.label}</a>
    {:else}
      <button
        class="write-blocked__action"
        type="button"
        onclick={() => {
          globalThis.location.reload();
        }}>{notice.action.label}</button
      >
    {/if}
  </div>
{/if}

<style>
  /* A slip pinned across the top of the page, in the warning's ink, since edits are on hold. */
  .write-blocked {
    position: sticky;
    z-index: var(--z-home-header);
    top: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    padding: 0.625rem 1rem;
    border-bottom: 2px solid var(--color-status-warning);
    background: color-mix(in srgb, var(--color-status-warning) 12%, var(--color-paper-raised));
    color: var(--color-ink);
  }

  .write-blocked__text {
    min-width: min(100%, 16rem);
    flex: 1;
  }

  .write-blocked__title {
    margin: 0;
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .write-blocked__description {
    margin: 0.125rem 0 0;
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
  }

  .write-blocked__action {
    display: inline-flex;
    min-height: 2.75rem;
    align-items: center;
    padding: 0 0.875rem;
    border: 1px solid var(--color-status-warning);
    background: var(--color-paper-raised);
    color: var(--color-ink);
    font-family: var(--font-controls);
    font-size: var(--text-xs);
    text-decoration: none;
  }

  .write-blocked__action:hover {
    background: color-mix(in srgb, var(--color-status-warning) 18%, var(--color-paper-raised));
  }
</style>
