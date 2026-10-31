<script lang="ts">
  import * as m from "#lib/paraglide/messages.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { syncReceiver } from "#lib/sync/receiver-state.svelte.js";
  import { BACKUP_FILE_PREFIX, downloadJson } from "#lib/utils/download.js";
  import { page } from "$app/state";

  import { factsQuestionBody } from "./sync-question-copy.js";
  import SyncTagDialog from "./sync-tag-dialog.svelte";

  import type { SyncAnswer } from "#lib/engine/sync-apply.js";
  import type { SyncApplyQuestion } from "#lib/stores/user-state.svelte.js";

  import type { SyncDialogAction } from "./sync-tag-dialog.svelte";

  let { question }: { question: SyncApplyQuestion } = $props();

  let open = $state(true);

  function answer(value: SyncAnswer): void {
    void syncReceiver.answer(question.id, value);
  }

  function later(): void {
    syncReceiver.dismissQuestion();
  }

  function saveOldBackup(): void {
    const kept = userState.farmSwitchBackup;
    if (kept) downloadJson(JSON.stringify(kept.backup), BACKUP_FILE_PREFIX);
  }

  /** Closing the dialog any other way is the same as “Not now”. */
  function changed(next: boolean): void {
    if (!next) later();
  }

  const copy = $derived.by((): { actions: SyncDialogAction[]; body: string; title: string } => {
    const notNow: SyncDialogAction = { label: m.sync_question_later(), onclick: later };
    switch (question.kind) {
      case "farm":
        return {
          actions: [
            notNow,
            {
              label: m.sync_farm_question_new(),
              onclick: () => {
                answer("new-farm");
              },
            },
            {
              label: m.sync_farm_question_same(),
              onclick: () => {
                answer("same-farm");
              },
              primary: true,
            },
          ],
          body: question.farmName
            ? m.sync_farm_question_body({ farm: question.farmName })
            : m.sync_farm_question_body_unnamed(),
          title: m.sync_farm_question_title(),
        };
      case "older-save":
        return {
          actions: [
            notNow,
            {
              label: m.sync_older_keep(),
              onclick: () => {
                answer("keep");
              },
            },
            {
              label: m.sync_older_accept(),
              onclick: () => {
                answer("accept");
              },
              primary: true,
            },
          ],
          body: m.sync_older_body(),
          title: m.sync_older_title(),
        };
      case "facts":
        return {
          actions: [
            notNow,
            {
              label: m.sync_facts_keep(),
              onclick: () => {
                answer("keep");
              },
            },
            {
              label: m.sync_facts_accept(),
              onclick: () => {
                answer("accept");
              },
              primary: true,
            },
          ],
          body: factsQuestionBody(question, page.data.locale),
          title: m.sync_facts_title(),
        };
      case "replace-backup": {
        const date = new Intl.DateTimeFormat(page.data.locale, { dateStyle: "medium" }).format(
          question.savedAt,
        );
        return {
          actions: [
            notNow,
            { label: m.sync_replace_save(), onclick: saveOldBackup },
            {
              label: m.sync_replace_confirm(),
              onclick: () => {
                answer("accept");
              },
              primary: true,
            },
          ],
          body: question.farmName
            ? m.sync_replace_body({ date, farm: question.farmName })
            : m.sync_replace_body_unnamed({ date }),
          title: m.sync_replace_title(),
        };
      }
    }
  });
</script>

<SyncTagDialog
  bind:open
  actions={copy.actions}
  body={copy.body}
  onOpenChange={changed}
  title={copy.title}
/>
