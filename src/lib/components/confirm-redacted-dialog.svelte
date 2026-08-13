<script lang="ts">
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import { isConditionInvertible } from "$lib/engine/visibility.js";

  import type { VisibilityCondition } from "$lib/types/visibility.js";

  let {
    condition,
    onCancel,
    onComplete,
    onCompleteAndUpdate,
    open = $bindable(false),
  }: {
    condition: VisibilityCondition;
    onCancel: () => void;
    onComplete: () => void;
    onCompleteAndUpdate: () => void;
    open?: boolean;
  } = $props();

  const invertible = $derived(isConditionInvertible(condition));
</script>

<AlertDialog.Root bind:open>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Complete redacted item?</AlertDialog.Title>
      <AlertDialog.Description>
        This item is still hidden based on your tracked progression. Are you sure you want to mark
        it as completed?
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel onclick={onCancel}>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action onclick={onComplete}>Yes, just this item</AlertDialog.Action>
      {#if invertible}
        <AlertDialog.Action onclick={onCompleteAndUpdate}>
          Yes, and update my progress
        </AlertDialog.Action>
      {/if}
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
