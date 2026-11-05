<script lang="ts" generics="Id extends AnyId">
  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import ShelfRows from "#lib/components/shelf-rows.svelte";
  import SpoilerSection from "#lib/components/spoiler-section.svelte";
  import TrackerRow from "#lib/components/tracker-row.svelte";
  import { getSectionGroupItem } from "#lib/controllers/section-grouping.svelte.js";
  import { trackerData } from "#lib/data/index.js";
  import { animalNameId, getName, nameCollator } from "#lib/data/names.js";
  import { celebrate, celebrateCategory } from "#lib/effects/celebrate.js";
  import { showUndoToast } from "#lib/effects/undo-toast.js";
  import { factKey } from "#lib/engine/provenance.js";
  import { addProgress, rowShelf } from "#lib/engine/shelves.js";
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

  let progress = $derived(addProgress(animals.map((a) => props.sectionConfig(a.id).progress)));
</script>

{#if animals.some((a) => props.hasDisplayableItem(a.id))}
  <ExpandableSection
    locale={props.locale}
    forceOpen={!!toolbarState.searchQuery}
    name={props.name}
    {progress}
    reportCategory={props.reportCategory}
  >
    {#each animals as animal (animal.id)}
      {@const {
        displayableItemCount,
        isVisible,
        progress: animalProgress,
        visibleItems,
      } = props.sectionConfig(animal.id)}
      {#if displayableItemCount > 0 && (!toolbarState.searchQuery || visibleItems.length > 0)}
        <SpoilerSection name={animal.name} spoilered={!isVisible}>
          {#if visibleItems.length > 0}
            <ExpandableSection
              locale={props.locale}
              depth={1}
              forceOpen={!!toolbarState.searchQuery}
              name={animal.name}
              progress={animalProgress}
              reportCategory={props.reportCategory}
              reportEntityId={animal.id}
            >
              <ShelfRows
                forceOpen={!!toolbarState.searchQuery}
                getKey={(itemRow) => itemRow.id}
                getShelf={rowShelf}
                items={visibleItems}
              >
                {#snippet row(itemRow)}
                  <TrackerRow
                    fact={factKey(props.factField, animal.id, itemRow.id)}
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
              </ShelfRows>
            </ExpandableSection>
          {/if}
        </SpoilerSection>
      {/if}
    {/each}
  </ExpandableSection>
{/if}
