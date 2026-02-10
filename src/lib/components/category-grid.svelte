<script lang="ts">
  import {
    BookCheck,
    BookOpenText,
    Crown,
    Heart,
    Landmark,
    PawPrint,
    Pickaxe,
    ScrollText,
    Shirt,
  } from "@lucide/svelte";

  import CategoryCard from "$lib/components/category-card.svelte";
  import { Progress } from "$lib/components/ui/progress/index.js";
  import { getAllProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  let progress = $derived(
    getAllProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );

  const categories = [
    { href: "/museum", icon: Landmark, key: "museum" as const, name: "Museum" },
    { href: "/almanac", icon: BookCheck, key: "almanac" as const, name: "Almanac" },
    { href: "/animals", icon: PawPrint, key: "animals" as const, name: "Animals" },
    { href: "/npcs", icon: Heart, key: "npcs" as const, name: "NPCs" },
    { href: "/cosmetics", icon: Shirt, key: "cosmetics" as const, name: "Cosmetics" },
    { href: "/skills", icon: BookOpenText, key: "skills" as const, name: "Skills" },
    { href: "/renown", icon: Crown, key: "renown" as const, name: "Renown" },
    { href: "/quests", icon: ScrollText, key: "quests" as const, name: "Quests" },
    { href: "/mines", icon: Pickaxe, key: "mines" as const, name: "Mines" },
  ] as const;

  let overall = $derived(() => {
    let completed = 0;
    let total = 0;
    for (const cat of categories) {
      const p = progress[cat.key];
      completed += p.completed;
      total += p.total;
    }
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, pct, total };
  });
</script>

<div class="flex flex-col gap-1.5">
  <div class="flex items-baseline justify-between px-1">
    <span class="text-muted-foreground text-xs font-medium">Overall</span>
    <span class="text-muted-foreground text-xs"
      >{overall().pct}% ({overall().completed}/{overall().total})</span
    >
  </div>
  <Progress class="h-1.5" value={overall().pct} />
</div>

<div class="grid grid-cols-2 gap-1.5">
  {#each categories as cat (cat.key)}
    <CategoryCard href={cat.href} icon={cat.icon} name={cat.name} progress={progress[cat.key]} />
  {/each}
</div>
