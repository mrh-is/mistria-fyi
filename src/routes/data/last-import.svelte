<script lang="ts">
  import { onMount } from "svelte";

  import * as m from "#lib/paraglide/messages.js";
  import { formatImportAge } from "#lib/presentation/import-age.js";

  import type { LocaleCode } from "#lib/types/locale.js";
  import type { SaveImportMetadata } from "#lib/types/save-identity.js";

  let { locale, metadata }: { locale: LocaleCode; metadata: SaveImportMetadata } = $props();
  let now = $state(Date.now());
  let age = $derived(formatImportAge(metadata.importedAt, now, locale));
  let version = $derived(metadata.identity.creationVersion);
  let versionDisplay = $derived(
    version
      ? `${version.major}.${version.minor}.${version.patch}${version.pre ? `-${version.pre}` : ""}`
      : m.import_unknown_version(),
  );
  let names = $derived([metadata.farmName, metadata.playerName].filter(Boolean).join(" · "));

  onMount(() => {
    now = Date.now();
    const timer = setInterval(() => {
      now = Date.now();
    }, 30_000);
    return () => clearInterval(timer);
  });
</script>

<div class="mb-4 space-y-1 text-sm break-words" data-testid="last-import">
  {#if names}<p class="font-medium">{names}</p>{/if}
  <p class="text-xs text-muted-foreground">
    {m.import_farm_identity({
      number: metadata.identity.saveNumber ?? m.import_unknown_number(),
      version: versionDisplay,
    })}
  </p>
  <p class="text-xs text-muted-foreground">
    <time
      datetime={new Date(metadata.importedAt).toISOString()}
      title={new Date(metadata.importedAt).toLocaleString(locale)}
    >
      {m.import_last_imported({ time: age })}
    </time>
  </p>
</div>
