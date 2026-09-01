<script lang="ts">
  import PageHeader from "$lib/components/page-header.svelte";
</script>

<svelte:head>
  <title>Privacy policy — Harvest Helper</title>
</svelte:head>

<PageHeader title="Privacy Policy" backHref="/settings" backLabel="Back to settings" />

<div class="flex flex-col gap-6 p-4 text-sm">
  <section class="flex flex-col gap-2">
    <h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
      The short version
    </h2>
    <p>
      Harvest Helper stores your data on your device only. Nothing is collected automatically or
      shared without your action. If you choose to send feedback, see below for what that includes.
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    <h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
      What is stored on your device
    </h2>
    <p>
      To remember your progress, Harvest Helper saves your game data (completed items, settings, and
      world state) in your browser's local storage. This data never leaves your device unless you
      explicitly choose to send it.
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    <h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
      Feedback submissions
    </h2>
    <p>
      Harvest Helper includes an optional feedback feature. When you submit feedback, the following
      is sent to our server:
    </p>
    <ul class="ml-4 list-disc space-y-1">
      <li>Your message text.</li>
      <li>The app version and game data version (for debugging context).</li>
      <li>If you pick a specific item, its name, category, and page (no personal information).</li>
      <li>
        Your tracked progress data (items checked off, skill levels, etc.), only if you opt in.
      </li>
      <li>Your email address, if you choose to provide one.</li>
    </ul>
    <p>
      Your feedback (minus your email) is used to create a <strong>public issue</strong> on our
      GitHub issue tracker so we can find and fix problems. This includes your message, the item you
      picked (if any), and your progress data (if you opted in). Avoid including personal
      information in your message, as these fields will be <strong>publicly visible</strong>.
    </p>
    <p>
      If you provide an email address, it is stored privately in a separate system and never appears
      in the public issue. It is used only to follow up on your feedback if needed.
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    <h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
      Abuse prevention
    </h2>
    <p>
      The feedback endpoint may use Cloudflare's built-in rate limiting or other abuse-prevention
      measures, which process IP addresses transiently at the network edge. IP addresses are not
      read, logged, or stored by the application.
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    <h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
      Third-party services
    </h2>
    <p>
      Harvest Helper does not use any analytics, advertising, or tracking services. The feedback
      feature uses GitHub (for public issue tracking) and Cloudflare (for hosting and rate
      limiting).
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    <h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Changes</h2>
    <p>If this policy ever changes, we will update this page.</p>
  </section>
</div>
