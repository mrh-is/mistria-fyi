<script lang="ts" generics="Key">
  import { setSectionGroupItem } from "#lib/controllers/section-grouping.svelte.js";

  import type { Snippet } from "svelte";

  import type { SectionGrouping } from "#lib/controllers/section-grouping.svelte.js";

  let {
    children,
    grouping,
    key,
  }: {
    children: Snippet;
    grouping: SectionGrouping<Key>;
    key: Key;
  } = $props();

  setSectionGroupItem({
    hold: () => {
      grouping.hold(key);
    },
    report: (complete) => {
      grouping.report(key, complete);
    },
  });
</script>

{@render children()}
