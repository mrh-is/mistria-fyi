<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import { localizedHref } from "#lib/utils/localized-href.js";

  import DataCard from "./data-card.svelte";

  let { onOpenBackup, open = $bindable(false) }: { onOpenBackup: () => void; open?: boolean } =
    $props();
</script>

<DataCard
  bind:open
  title="Transfer to another device"
  summary="Take your progress to another device."
>
  <div class="flex flex-col gap-3">
    <p class="text-sm text-muted-foreground">
      With sync, your other device gets your gaming computer’s save file.
    </p>
    <Button href={localizedHref("sync")}>Set up sync</Button>
    <p class="text-sm text-muted-foreground">
      To move anything you check off by hand, export a backup here, send the file to your other
      device, and restore it there. Restoring replaces that device’s tracker progress.
    </p>
    <Button variant="outline" onclick={onOpenBackup}>Go to Backup & restore</Button>
  </div>
</DataCard>
