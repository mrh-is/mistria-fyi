<script lang="ts">
  import { createLedgerSnapshot } from "#lib/controllers/ledger-snapshot.svelte.js";

  import type { LocaleCode } from "#lib/types/locale.js";

  let { build, locale }: { build: (locale: LocaleCode) => string[]; locale: LocaleCode } = $props();
  const snapshot = createLedgerSnapshot(
    () => locale,
    () => build(locale),
  );
</script>

<output data-testid="snapshot">{snapshot.value.join(", ")}</output>
<output data-testid="needs-refresh">{String(snapshot.needsRefresh)}</output>
