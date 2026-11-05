<script lang="ts" generics="Key">
  import { setSectionGroupItem } from "#lib/controllers/section-grouping.svelte.js";

  import type { Snippet } from "svelte";

  import type { SectionGrouping } from "#lib/controllers/section-grouping.svelte.js";

  let {
    children,
    closed = false,
    grouping,
    key,
  }: {
    children: Snippet;
    /** Inside a closed fold. The section stays mounted, so it can still report its shelf. */
    closed?: boolean;
    grouping: SectionGrouping<Key>;
    key: Key;
  } = $props();

  setSectionGroupItem({
    hold: () => {
      grouping.hold(key);
    },
    report: (shelf) => {
      grouping.report(key, shelf);
    },
  });
</script>

<!-- `hidden`, so focus repair can tell a closed fold's sections aren't on the page. -->
<div hidden={closed} style:display={closed ? undefined : "contents"}>
  {@render children()}
</div>
