<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";

  let { open = $bindable(false) }: { open?: boolean } = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Built with AI assistance</Dialog.Title>
    </Dialog.Header>
    <div class="flex flex-col gap-3 text-sm text-muted-foreground">
      <p>
        The Mistria Field Guide is developed with the help of AI coding tools. AI agents write code,
        review pull requests, & help maintain the project, under the supervision of humans (well,
        just one human).
      </p>
      <p>
        Using the app will never cause your data to be sent to an AI service. The one exception is
        that if you choose to submit feedback, your message & game progress (if you choose to
        include it) will probably be seen by an AI, but <strong class="text-foreground"
          >your email will never be</strong
        >.
      </p>
      <p>
        If this changes how you feel about this app, I respect that, & I want you to be able to make
        that choice with full information. To see the full details of how AI works in this project,
        you can check out
        <a
          href="https://github.com/mrh-is/mistria-fyi"
          target="_blank"
          rel="noopener noreferrer"
          class="underline hover:text-foreground">the GitHub repo</a
        >, or
        <a href="mailto:michael@mistria.fyi" class="underline hover:text-foreground"
          >drop me a line</a
        >.
      </p>
    </div>
  </Dialog.Content>
</Dialog.Root>
