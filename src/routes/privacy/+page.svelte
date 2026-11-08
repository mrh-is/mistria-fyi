<script lang="ts">
  import PageHeader from "#lib/components/page-header.svelte";
  import * as m from "#lib/paraglide/messages.js";
  import { messageParts } from "#lib/utils/message-parts.js";
  import { afterNavigate, goto } from "$app/navigation";
  import { page } from "$app/state";

  afterNavigate(({ type, from, shallow }) => {
    if (shallow || type !== "link") return;
    const source = from?.route.id;
    if (source !== "/about" && source !== "/data") return;

    // Keep the source with this entry so browser Forward restores the same back behavior.
    void goto(page.url.href, {
      replace: true,
      shallow: true,
      state: { ...page.state, privacyFrom: source === "/data" ? "data" : "about" },
    });
  });

  const source = $derived(page.state.privacyFrom);

  /** Bump this whenever the policy's meaning changes. */
  const LAST_UPDATED = Date.UTC(2026, 10, 5);

  const lastUpdated = $derived(
    new Intl.DateTimeFormat(page.data.locale, { dateStyle: "long", timeZone: "UTC" }).format(
      LAST_UPDATED,
    ),
  );
</script>

{#snippet sectionHeading(text: string)}
  <h3 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
    {text}
  </h3>
{/snippet}

<PageHeader
  title={m.privacy_title()}
  backHref={source ?? "about"}
  backLabel={source === undefined ? m.privacy_back_to_about() : m.common_go_back()}
  historyBack={source !== undefined}
  replaceBackEntry={source === undefined}
/>

<div class="flex flex-col gap-6 p-4 text-sm">
  <p class="text-muted-foreground">{m.privacy_last_updated({ date: lastUpdated })}</p>

  <h2 class="text-lg font-semibold">{m.privacy_without_sync_heading()}</h2>

  <section class="flex flex-col gap-2">
    {@render sectionHeading(m.privacy_short_heading())}
    <p>
      {m.privacy_short_body()}
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    {@render sectionHeading(m.privacy_device_heading())}
    <p>
      {m.privacy_device_body()}
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    {@render sectionHeading(m.privacy_feedback_heading())}
    <p>
      {m.privacy_feedback_intro()}
    </p>
    <ul class="ml-4 list-disc space-y-1">
      <li>{m.privacy_feedback_item_message()}</li>
      <li>{m.privacy_feedback_item_versions()}</li>
      <li>{m.privacy_feedback_item_selection()}</li>
      <li>
        {m.privacy_feedback_item_progress()}
      </li>
      <li>{m.privacy_feedback_item_sync_log()}</li>
      <li>{m.privacy_feedback_item_email()}</li>
    </ul>
    <p>
      {m.privacy_feedback_public_before_bold()} <strong>{m.privacy_feedback_public_bold()}</strong>
      {m.privacy_feedback_public_middle_sync_log()}
      <strong>{m.privacy_feedback_public_bold2()}</strong>.
    </p>
    <p>
      {m.privacy_feedback_email_storage()}
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    {@render sectionHeading(m.privacy_abuse_heading())}
    <p>
      {m.privacy_abuse_body()}
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    {@render sectionHeading(m.privacy_third_party_heading())}
    <p>
      {m.privacy_third_party_body()}
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    {@render sectionHeading(m.privacy_ai_heading())}
    <p>
      {m.privacy_ai_body()}
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <h2 class="text-lg font-semibold">{m.privacy_with_sync_heading()}</h2>
  <p>{m.privacy_sync_intro()}</p>

  <section class="flex flex-col gap-2">
    {@render sectionHeading(m.privacy_sync_what_heading())}
    <p>{m.privacy_sync_what_body()}</p>
    <p>{m.privacy_sync_what_feedback_log()}</p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    {@render sectionHeading(m.privacy_sync_storage_heading())}
    <p>{m.privacy_sync_storage_body()}</p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    {@render sectionHeading(m.privacy_sync_code_heading())}
    <p>{m.privacy_sync_code_body()}</p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    {@render sectionHeading(m.privacy_sync_ip_heading())}
    <p>{m.privacy_sync_ip_body()}</p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    {@render sectionHeading(m.privacy_sync_account_heading())}
    <p>{m.privacy_sync_account_body()}</p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    {@render sectionHeading(m.privacy_sync_turnstile_heading())}
    <p>
      {#each messageParts( (slot) => m.privacy_sync_turnstile_body( { addendum: slot("addendum") } ) ) as part, index (index)}
        {#if typeof part === "string"}{part}{:else}<a
            class="underline"
            href="https://www.cloudflare.com/turnstile-privacy-policy/"
            >{m.privacy_sync_turnstile_link()}</a
          >{/if}
      {/each}
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    {@render sectionHeading(m.privacy_sync_trust_heading())}
    <p>{m.privacy_sync_trust_body()}</p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    <h2 class="text-lg font-semibold">{m.privacy_changes_heading()}</h2>
    <p>{m.privacy_changes_body()}</p>
  </section>
</div>
