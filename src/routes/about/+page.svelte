<script lang="ts">
  import { untrack } from "svelte";

  import AiDisclosureDialog from "#lib/components/ai-disclosure-dialog.svelte";
  import PageHeader from "#lib/components/page-header.svelte";
  import { trackerData } from "#lib/data/index.js";
  import { provideAboutCatalog } from "#lib/i18n/about-ui.js";

  import AboutCopy from "./about-copy.svelte";

  import type { PageData } from "./$types";

  const game = /* @wc-ignore */ "Fields of Mistria";
  const maintainer = /* @wc-ignore */ "Michael Helmbrecht";
  const studio = /* @wc-ignore */ "NPC Studio";

  let { data }: { data: Pick<PageData, "aboutCatalog" | "locale" | "metadata"> } = $props();
  // The root layout remounts this page when the active locale changes.
  untrack(() => provideAboutCatalog(data.aboutCatalog, data.locale));
  let aiDisclosureOpen = $state(false);
</script>

<PageHeader title={data.metadata.title} />

<AboutCopy
  {game}
  {maintainer}
  onDisclosure={() => (aiDisclosureOpen = true)}
  {studio}
  version={trackerData.version}
/>
<AiDisclosureDialog bind:open={aiDisclosureOpen} />
