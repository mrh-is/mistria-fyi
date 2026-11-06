<script lang="ts">
  import { getAllProgress } from "#lib/engine/categories.js";
  import { userState } from "#lib/stores/user-state.svelte.js";

  import SourceContent from "./source-content.svelte";

  import type { LocaleCode } from "#lib/types/locale.js";

  /** The source view with the live progress the page would pass it. */
  let { anchor, locale }: { anchor: string; locale: LocaleCode } = $props();

  let progress = $derived(getAllProgress(userState.progressContext));
</script>

<SourceContent {anchor} {locale} {progress} />
