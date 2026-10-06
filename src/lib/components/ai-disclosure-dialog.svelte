<script lang="ts">
  import DialogCloseButton from "#lib/components/dialog-close-button.svelte";
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import * as m from "#lib/paraglide/messages.js";

  let { open = $bindable(false) }: { open?: boolean } = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-w-md" showCloseButton={false}>
    <Dialog.Header>
      <Dialog.Title>{m.ai_disclosure_title()}</Dialog.Title>
    </Dialog.Header>
    <div class="flex flex-col gap-3 text-sm text-muted-foreground">
      <p>
        {m.ai_disclosure_intro()}
      </p>
      <p>
        {m.ai_disclosure_no_data_sent()}
        {m.ai_disclosure_feedback_exception()}
        <strong class="text-foreground">{m.ai_disclosure_email_safe()}</strong>
      </p>
      <p>
        {m.ai_disclosure_link_intro()}
        <a
          href="https://github.com/mrh-is/mistria-fyi"
          target="_blank"
          rel="noopener noreferrer"
          class="underline hover:text-foreground">{m.ai_disclosure_github_link()}</a
        >, {m.ai_disclosure_link_or()}
        <a href="mailto:michael@mistria.fyi" class="underline hover:text-foreground"
          >{m.ai_disclosure_email_link()}</a
        >.
      </p>
    </div>
    <DialogCloseButton />
  </Dialog.Content>
</Dialog.Root>
