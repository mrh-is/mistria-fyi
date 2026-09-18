<script lang="ts">
  import SkillsContent from "$lib/components/skills-content.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<SkillsContent locale={data.locale} />
