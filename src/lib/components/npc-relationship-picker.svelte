<script lang="ts">
  import { Baby, BanknoteCheck, Church, Gem, Heart, HeartHandshake } from "@lucide/svelte";

  import { getMarriedNpc } from "$lib/engine/relationships.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import type { Component } from "svelte";

  import type { NpcId, NpcRelationship } from "$lib/types/tracker-data.js";

  let { npcId }: { npcId: NpcId } = $props();

  let level = $derived(userState.state.completed.npcLevels[npcId] ?? 0);
  let relationship = $derived(userState.state.completed.npcRelationships[npcId] ?? "undecided");
  let childChoice = $derived(userState.state.completed.childChoice);
  let isMarried = $derived(relationship === "married");
  let marriedNpc = $derived(getMarriedNpc(userState.state.completed.npcRelationships));
  let anotherNpcIsMarried = $derived(marriedNpc !== null && marriedNpc !== npcId);
  let hasRelationship = $derived(relationship !== "undecided");
  let shouldShow = $derived((level >= 8 || hasRelationship) && !anotherNpcIsMarried);

  interface Option {
    activeClass: string;
    icon: Component<{ class?: string }>;
    label: string;
    value: NpcRelationship;
  }

  const pillBase =
    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-200";
  const pillInactive =
    "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground/70";

  const relationshipOptions: Option[] = [
    {
      activeClass:
        "border-sky-400 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-950 dark:text-sky-300",
      icon: HeartHandshake,
      label: "Best Friends",
      value: "platonic",
    },
    {
      activeClass:
        "border-pink-400 bg-pink-50 text-pink-700 dark:border-pink-500 dark:bg-pink-950 dark:text-pink-300",
      icon: Heart,
      label: "Dating",
      value: "romantic",
    },
  ];

  const engagedOption: Option = {
    activeClass:
      "border-violet-400 bg-violet-50 text-violet-700 dark:border-violet-500 dark:bg-violet-950 dark:text-violet-300",
    icon: Gem,
    label: "Engaged",
    value: "proposed",
  };

  const marriedActiveClass =
    "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-500 dark:bg-amber-950 dark:text-amber-300";

  let showEngaged = $derived(
    relationship === "proposed" ||
      relationship === "married" ||
      (level >= 10 && relationship === "romantic"),
  );

  let showMarried = $derived(relationship === "proposed" || relationship === "married");

  function selectRelationship(value: NpcRelationship) {
    if (value === relationship) {
      userState.setNpcRelationship(npcId, "undecided");
    } else {
      userState.setNpcRelationship(npcId, value);
    }
  }

  function selectChildChoice(choice: "no" | "yes") {
    if (childChoice === choice) {
      userState.setChildChoice("undeclared");
    } else {
      userState.setChildChoice(choice);
    }
  }
</script>

{#if shouldShow}
  <div class="flex flex-wrap items-center justify-center gap-1.5 pt-0.5">
    {#each relationshipOptions as opt (opt.value)}
      {@const active = relationship === opt.value}
      <button
        class="{pillBase} {active ? opt.activeClass : pillInactive}"
        type="button"
        aria-pressed={active}
        onclick={() => {
          selectRelationship(opt.value);
        }}
      >
        <opt.icon class="size-3" />
        {opt.label}
      </button>
    {/each}

    {#if showEngaged}
      {@const active = relationship === "proposed"}
      <button
        class="{pillBase} {active ? engagedOption.activeClass : pillInactive}"
        type="button"
        aria-pressed={active}
        onclick={() => {
          selectRelationship("proposed");
        }}
      >
        <Gem class="size-3" />
        Engaged
      </button>
    {/if}

    {#if showMarried}
      {#if isMarried}
        <div
          class="{pillBase} {marriedActiveClass} cursor-default pr-1"
          role="group"
          aria-label="Married"
        >
          <button
            class="inline-flex items-center gap-1"
            type="button"
            aria-label="Unset married"
            onclick={() => {
              selectRelationship("married");
            }}
          >
            <Church class="size-3" />
            Married
          </button>
          <span class="ml-0.5 flex items-center gap-1">
            <button
              class="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium transition-all duration-150 {childChoice ===
              'yes'
                ? 'border-amber-500 bg-amber-100 text-amber-800 dark:border-amber-400 dark:bg-amber-900 dark:text-amber-200'
                : 'border-amber-300/50 text-amber-600/70 hover:border-amber-400 hover:text-amber-700 dark:border-amber-600/50 dark:text-amber-400/70 dark:hover:border-amber-500'}"
              type="button"
              aria-pressed={childChoice === "yes"}
              onclick={() => {
                selectChildChoice("yes");
              }}
            >
              <Baby class="size-2.5" />
              Kids
            </button>
            <button
              class="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium transition-all duration-150 {childChoice ===
              'no'
                ? 'border-emerald-500 bg-emerald-100 text-emerald-800 dark:border-emerald-400 dark:bg-emerald-900 dark:text-emerald-200'
                : 'border-amber-300/50 text-amber-600/70 hover:border-emerald-400 hover:text-emerald-700 dark:border-amber-600/50 dark:text-amber-400/70 dark:hover:border-emerald-500'}"
              type="button"
              aria-pressed={childChoice === "no"}
              onclick={() => {
                selectChildChoice("no");
              }}
            >
              <BanknoteCheck class="size-2.5" />
              DINK
            </button>
          </span>
        </div>
      {:else}
        <button
          class="{pillBase} {pillInactive}"
          type="button"
          aria-pressed={false}
          onclick={() => {
            selectRelationship("married");
          }}
        >
          <Church class="size-3" />
          Married
        </button>
      {/if}
    {/if}
  </div>
{/if}
