<script lang="ts">
  import { onMount } from "svelte";

  import { formatImportAge } from "#lib/presentation/import-age.js";

  import type { LocaleCode } from "#lib/types/locale.js";
  import type { SaveImportMetadata } from "#lib/types/save-identity.js";

  let { locale, metadata }: { locale: LocaleCode; metadata: SaveImportMetadata } = $props();
  let now = $state(Date.now());
  let age = $derived(formatImportAge(metadata.importedAt, now, locale));
  let version = $derived(metadata.identity.creationVersion);
  const unknownVersion = /* @wc-include */ "unknown version";
  const unknownNumber = /* @wc-include */ "unknown";
  let versionDisplay = $derived(
    version
      ? `${version.major}.${version.minor}.${version.patch}${version.pre ? `-${version.pre}` : ""}`
      : unknownVersion,
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
    <time
      datetime={new Date(metadata.importedAt).toISOString()}
      title={new Date(metadata.importedAt).toLocaleString(locale)}
    >
      {`Last imported ${age}`}
    </time>
  </p>
  <details class="text-xs text-muted-foreground">
    <summary class="cursor-pointer">Save details</summary>
    <p class="mt-1">
      {`Save #${metadata.identity.saveNumber ?? unknownNumber} · Created in ${versionDisplay}`}
    </p>
  </details>
</div>
