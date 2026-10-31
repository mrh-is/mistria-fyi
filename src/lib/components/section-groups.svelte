<script lang="ts" generics="Item, Key">
  import CompletedHeading from "#lib/components/completed-heading.svelte";
  import SectionGroupItem from "#lib/components/section-group-item.svelte";
  import { getCompletionScope } from "#lib/controllers/completion-scope.svelte.js";

  import type { Snippet } from "svelte";

  import type { SectionGrouping } from "#lib/controllers/section-grouping.svelte.js";

  let {
    getKey,
    grouping,
    items,
    section,
  }: {
    getKey: (item: Item) => Key;
    grouping: SectionGrouping<Key>;
    items: readonly Item[];
    section: Snippet<[Item]>;
  } = $props();

  type Entry = { item: Item; key: Key; kind: "section" } | { key: symbol; kind: "heading" };

  const headingEntry: Entry = { key: Symbol("completed-heading"), kind: "heading" };
  const completionScope = getCompletionScope();

  // One keyed list, not two, so a section changing groups is moved rather than remounted and keeps
  // its expansion & rendered rows.
  let entries = $derived.by((): Entry[] => {
    // A lone section has nothing to be grouped apart from.
    if (items.length < 2) {
      return items.map((item) => ({ item, key: getKey(item), kind: "section" }));
    }
    const active: Entry[] = [];
    const completed: Entry[] = [];
    for (const item of items) {
      const key = getKey(item);
      (grouping.isGroupedComplete(key) ? completed : active).push({ item, key, kind: "section" });
    }
    return completed.length === 0 ? active : [...active, headingEntry, ...completed];
  });

  // Moving a node blurs whatever it contains, so focus inside a moved section is put back.
  let focusBeforeMove: Element | null = null;

  $effect.pre(() => {
    void entries;
    focusBeforeMove = document.activeElement;
  });

  $effect(() => {
    void entries;
    const target = focusBeforeMove;
    focusBeforeMove = null;
    if (
      target instanceof HTMLElement &&
      target.isConnected &&
      (document.activeElement === null || document.activeElement === document.body)
    ) {
      target.focus({ preventScroll: true });
    }
  });
</script>

{#each entries as entry (entry.key)}
  {#if entry.kind === "heading"}
    {#if !completionScope}<CompletedHeading class="px-2 pt-2" />{/if}
  {:else}
    <SectionGroupItem {grouping} key={entry.key}>
      {@render section(entry.item)}
    </SectionGroupItem>
  {/if}
{/each}
