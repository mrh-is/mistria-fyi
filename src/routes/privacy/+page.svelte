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
      Harvest Helper stores your data on your device only. Nothing is ever sent to a server, shared
      with anyone, or tracked in any way.
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    <h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
      What we collect
    </h2>
    <p>Nothing. There are no accounts, no analytics, and no servers that hold your information.</p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    <h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
      What is stored on your device
    </h2>
    <p>
      To remember your progress, Harvest Helper saves your game data (completed items, settings, and
      world state) in your browser's local storage. This data never leaves your device — it is never
      uploaded, synced, or shared with anyone by us.
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    <h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
      Third-party services
    </h2>
    <p>Harvest Helper does not use any analytics, advertising, or tracking services.</p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    <h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Changes</h2>
    <p>If this policy ever changes, we will update this page.</p>
  </section>
</div>
