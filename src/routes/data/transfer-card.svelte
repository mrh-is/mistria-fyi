<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import * as m from "#lib/paraglide/messages.js";
  import { localizedHref } from "#lib/utils/localized-href.js";

  import DataCard from "./data-card.svelte";

  let { onOpenBackup, open = $bindable(false) }: { onOpenBackup: () => void; open?: boolean } =
    $props();
</script>

<DataCard bind:open title={m.transfer_card_title()} summary={m.transfer_card_summary()}>
  <div class="flex flex-col gap-3">
    <p class="text-sm text-muted-foreground">{m.transfer_sync_guidance()}</p>
    <Button href={localizedHref("sync")}>{m.transfer_sync_action()}</Button>
    <p class="text-sm text-muted-foreground">{m.transfer_backup_guidance()}</p>
    <Button variant="outline" onclick={onOpenBackup}>{m.transfer_open_backup_action()}</Button>
  </div>
</DataCard>
