<script lang="ts">
  import PageHeader from "#lib/components/page-header.svelte";
  import * as m from "#lib/paraglide/messages.js";
</script>

<PageHeader title={m.privacy_title()} backHref="about" backLabel={m.privacy_back_to_about()} />

<div class="flex flex-col gap-6 p-4 text-sm">
  <section class="flex flex-col gap-2">
    <h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
      {m.privacy_short_heading()}
    </h2>
    <p>
      {m.privacy_short_body()}
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    <h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
      {m.privacy_device_heading()}
    </h2>
    <p>
      {m.privacy_device_body()}
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    <h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
      {m.privacy_feedback_heading()}
    </h2>
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
      <li>{m.privacy_feedback_item_email()}</li>
    </ul>
    <p>
      {m.privacy_feedback_public_before_bold()} <strong>{m.privacy_feedback_public_bold()}</strong>
      {m.privacy_feedback_public_middle()}
      <strong>{m.privacy_feedback_public_bold2()}</strong>.
    </p>
    <p>
      {m.privacy_feedback_email_storage()}
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    <h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
      {m.privacy_abuse_heading()}
    </h2>
    <p>
      {m.privacy_abuse_body()}
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    <h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
      {m.privacy_third_party_heading()}
    </h2>
    <p>
      {m.privacy_third_party_body()}
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    <h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
      {m.privacy_ai_heading()}
    </h2>
    <p>
      {m.privacy_ai_body()}
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    <h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
      {m.privacy_changes_heading()}
    </h2>
    <p>{m.privacy_changes_body()}</p>
  </section>
</div>
