<script lang="ts">
  import { FileUp, Upload } from "@lucide/svelte";

  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  function handleExport() {
    const json = userState.exportState();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `harvest-helper-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportBackup() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      userState.importState(text);
    };
    input.click();
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>Backup & Restore</Card.Title>
    <Card.Description>Export or import your full tracker progress.</Card.Description>
  </Card.Header>
  <Card.Content class="flex flex-col gap-2">
    <Button variant="outline" onclick={handleExport}>
      <FileUp />
      Export backup
    </Button>
    <Button variant="outline" onclick={handleImportBackup}>
      <Upload />
      Restore from backup
    </Button>
  </Card.Content>
</Card.Root>
