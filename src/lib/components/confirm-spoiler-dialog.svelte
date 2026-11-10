<script lang="ts">
  import * as AlertDialog from "#lib/components/ui/alert-dialog/index.js";
  import { buttonVariants } from "#lib/components/ui/button/button.svelte";
  import { canPlanConditionMutations } from "#lib/engine/visibility.js";

  import type { GuardSubject } from "#lib/controllers/spoiler-guard.svelte.js";
  import type { VisibilityCondition } from "#lib/types/visibility.js";

  let {
    condition,
    onCancel,
    onComplete,
    onCompleteAndUpdate,
    open = $bindable(false),
    subject,
  }: {
    condition: VisibilityCondition;
    onCancel: () => void;
    onComplete: () => void;
    onCompleteAndUpdate: () => void;
    open?: boolean;
    /** What the dialog asks about; absent for an item whose name is still covered. */
    subject?: GuardSubject;
  } = $props();

  const invertible = $derived(canPlanConditionMutations(condition));
  // Checking off an item whose name is still covered gets the playful wording; anything the player
  // can see gets the plain question. Without the update button, "just this" has nothing to
  // contrast with.
  const copy = $derived.by(() => {
    if (subject === undefined) {
      return {
        complete: invertible ? "YOLO (just this one thing)" : /* @wc-include */ "YOLO",
        completeAndUpdate: "YOLO, and prerequisites",
        description: "You haven’t even revealed its name!",
        title: "Check off this item?",
      };
    }
    const plain = {
      complete: invertible ? "Yes, just this one" : "Yes",
      completeAndUpdate: "Yes, and prerequisites too",
    };
    return "floor" in subject
      ? {
          ...plain,
          description:
            "Based on your tracked progress, you haven’t broken the seal on the way there yet. Are you sure?",
          title: `Head down to floor ${subject.floor}?`,
        }
      : {
          ...plain,
          description:
            "Based on your tracked progress, it doesn’t seem like you should be able to get this yet. Are you sure?",
          title: `Check off ${subject.name}?`,
        };
  });
</script>

<AlertDialog.Root bind:open>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{copy.title}</AlertDialog.Title>
      <AlertDialog.Description>
        {copy.description}
      </AlertDialog.Description>
    </AlertDialog.Header>
    <!-- The longer confirmations wrap inside a phone-width dialog instead of overflowing it. -->
    <AlertDialog.Footer
      class="flex-wrap [&>button]:h-auto [&>button]:min-h-11 [&>button]:py-2 [&>button]:text-balance [&>button]:whitespace-normal"
    >
      <AlertDialog.Cancel onclick={onCancel}
        ><!-- @wc-context: spoiler dialog cancel -->Never mind</AlertDialog.Cancel
      >
      <AlertDialog.Action
        class={`${buttonVariants({ variant: invertible ? "outline" : "default" })} ${invertible ? "text-foreground" : ""}`}
        onclick={onComplete}
      >
        {copy.complete}
      </AlertDialog.Action>
      {#if invertible}
        <AlertDialog.Action onclick={onCompleteAndUpdate}>
          {copy.completeAndUpdate}
        </AlertDialog.Action>
      {/if}
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
