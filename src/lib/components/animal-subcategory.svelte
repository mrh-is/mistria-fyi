<script lang="ts" generics="Id extends AnyId">
  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import SpoilerSection from "#lib/components/spoiler-section.svelte";
  import TrackerEmptyState from "#lib/components/tracker-empty-state.svelte";
  import TrackerRowList from "#lib/components/tracker-row-list.svelte";
  import TrackerRow from "#lib/components/tracker-row.svelte";
  import { getSectionGroupItem } from "#lib/controllers/section-grouping.svelte.js";
  import { trackerData } from "#lib/data/index.js";
  import { animalNameId, getName, nameCollator } from "#lib/data/names.js";
  import { celebrate, celebrateCategory } from "#lib/effects/celebrate.js";
  import { showUndoToast } from "#lib/effects/undo-toast.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { trackerRowDisplay } from "#lib/utils/row-display.js";

  import type { AnimalSubcategoryProps } from "#lib/components/animal-subcategory.types.js";
  import type { AnimalId, AnyId } from "#lib/types/tracker-data.js";

  let props: AnimalSubcategoryProps<Id> = $props();

  const sectionGroupItem = getSectionGroupItem();

  let animals = $derived(
    Object.entries(trackerData.animals)
      .map(([id]) => ({
        id: id as AnimalId,
        name: getName("animals", animalNameId(id as AnimalId, "core"), props.locale),
      }))
      .toSorted((a, b) => nameCollator(props.locale).compare(a.name, b.name)),
  );

  let { completedCount, totalCount } = $derived.by(() => {
    let completed = 0;
    let total = 0;
    for (const a of animals) {
      const { displayableCompletedItemCount, displayableItemCount } = props.sectionConfig(a.id);
      completed += displayableCompletedItemCount;
      total += displayableItemCount;
    }
    return { completedCount: completed, totalCount: total };
  });
</script>

{#if animals.some((a) => props.hasDisplayableItem(a.id))}
  <ExpandableSection
    locale={props.locale}
    count={completedCount}
    name={props.name}
    reportCategory={props.reportCategory}
    total={totalCount}
  >
    {#each animals as animal (animal.id)}
      {@const { displayableCompletedItemCount, displayableItemCount, isVisible, visibleItems } =
        props.sectionConfig(animal.id)}
      {#if displayableItemCount > 0}
        <SpoilerSection name={animal.name} spoilered={!isVisible}>
          {#if visibleItems.length > 0}
            <ExpandableSection
              locale={props.locale}
              depth={1}
              count={displayableCompletedItemCount}
              name={animal.name}
              reportCategory={props.reportCategory}
              reportEntityId={animal.id}
              total={displayableItemCount}
            >
              <TrackerRowList getKey={(itemRow) => itemRow.id} items={visibleItems}>
                {#snippet row(itemRow)}
                  <TrackerRow
                    display={trackerRowDisplay({
                      completed: itemRow.completed,
                      // Unlike other categories, a completed animal row is never spoilered.
                      spoilered: !itemRow.completed && itemRow.spoilered,
                    })}
                    segmentLookups={props.lookups
                      ? { ...props.lookups, entityVisibility: undefined }
                      : undefined}
                    name={itemRow.name}
                    reportCategory={props.reportCategory}
                    reportEntityId={`${animal.id}:${itemRow.id}`}
                    subtitle={itemRow.subtitle}
                    onToggle={() => {
                      sectionGroupItem?.hold();
                      props.toggleCompletion(animal.id, itemRow.id);
                      const completed = props.completionCheck(animal.id, itemRow.id);
                      showUndoToast(itemRow.name, completed, () => {
                        props.toggleCompletion(animal.id, itemRow.id);
                      });
                      if (completed) {
                        if (props.areAllAnimalsComplete()) {
                          celebrateCategory();
                        } else if (props.isAnimalComplete(animal.id)) {
                          celebrate();
                        }
                      }
                    }}
                    sources={itemRow.sources}
                  />
                {/snippet}
              </TrackerRowList>
            </ExpandableSection>
          {/if}
        </SpoilerSection>
      {/if}
    {/each}
  </ExpandableSection>
{:else if toolbarState.isSourceFilterNarrowing}
  <TrackerEmptyState />
{/if}
