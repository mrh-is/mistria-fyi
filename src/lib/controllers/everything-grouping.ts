import { userState } from "#lib/stores/user-state.svelte.js";
import { building } from "$app/env";
import { goto } from "$app/navigation";
import { page } from "$app/state";

export type EverythingGrouping = "category" | "source";

export function readEverythingGrouping(): EverythingGrouping {
  const requested = building ? null : page.url.searchParams.get("group");
  if (requested === "source" || requested === "category") return requested;
  return userState.state.everythingGrouping;
}

export function selectEverythingGrouping(group: EverythingGrouping): void {
  userState.setEverythingGrouping(group);
  const url = new URL(page.url.href);
  url.searchParams.set("group", group);
  url.hash = "";
  void goto(url, { reset: false });
}
