<script lang="ts">
  import { ArrowLeft } from "@lucide/svelte";

  import { resolve } from "$app/paths";
</script>

<div
  class="sticky top-0 z-10 flex items-center gap-2 border-b border-border/50 bg-background px-4 pt-safe-or-4 pb-3"
>
  <a
    class="-ml-3 flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-foreground"
    href={resolve("/settings")}
    aria-label="Back to settings"
  >
    <ArrowLeft class="size-5" />
  </a>
  <h1 class="flex-1 text-xl font-semibold">Privacy Policy</h1>
</div>

<div class="flex flex-col gap-6 p-4 text-sm">
  <section class="flex flex-col gap-2">
    <h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
      The short version
    </h2>
    <p>
      Harvest Helper stores your data on your device only. Nothing is ever sent to a server,
      shared with anyone, or tracked in any way.
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    <h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
      What we collect
    </h2>
    <p>
      Nothing. There are no accounts, no analytics, and no servers that hold your information.
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    <h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
      What is stored on your device
    </h2>
    <p>
      To remember your progress, Harvest Helper saves your game data (completed items, settings,
      and world state) in your browser's local storage. This data never leaves your device — it
      is never uploaded, synced, or shared with anyone by us.
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    <h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
      Third-party services
    </h2>
    <p>
      Harvest Helper does not use any analytics, advertising, or tracking services.
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    <h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
      Changes
    </h2>
    <p>
      If this policy ever changes, we will update this page.
    </p>
  </section>
</div>
