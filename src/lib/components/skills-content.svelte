<script lang="ts">
  import SkillRecord from "#lib/components/skill-record.svelte";
  import { trackerData } from "#lib/data/index.js";
  import { getName, nameCollator } from "#lib/data/names.js";
  import { isSkillComplete } from "#lib/engine/projections/skills.js";
  import * as m from "#lib/paraglide/messages.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { recordKeys } from "#lib/utils/record.js";

  import type { LocaleCode } from "#lib/types/locale.js";

  let { compact = false, locale }: { compact?: boolean; locale: LocaleCode } = $props();

  let skills = $derived.by(() => {
    const collator = nameCollator(locale);
    return recordKeys(trackerData.skills)
      .map((id) => ({ id, name: getName("skills", id, locale) }))
      .toSorted((a, b) => collator.compare(a.name, b.name));
  });
</script>

<ul class="skill-ledger" aria-label={m.skills_ledger_aria()}>
  {#each skills as skill (skill.id)}
    {#if !isSkillComplete(skill.id, userState.state.progress) || userState.state.showCompleted}
      <SkillRecord {compact} id={skill.id} {locale} name={skill.name} />
    {/if}
  {/each}
</ul>

<style>
  .skill-ledger {
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
