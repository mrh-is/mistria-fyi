/**
 * The page's one receiver, & what its status means for the status button, the notes, & the question
 * dialog. See `docs/sync-setup.md` § Living with it.
 */
import { abnormalGapDays } from "#lib/engine/sync-freshness.js";
import { userState } from "#lib/stores/user-state.svelte.js";

import { createReceiver } from "./receiver.js";

import type { SyncAnswer } from "#lib/engine/sync-apply.js";
import type { SyncApplyQuestion } from "#lib/stores/user-state.svelte.js";

import type { ReceiverStatus, SyncTell } from "./receiver.js";

/** The statuses that need the player, which get the dot & a note. */
const NEEDS_A_LOOK: ReadonlySet<ReceiverStatus["kind"]> = new Set<ReceiverStatus["kind"]>([
  "asking",
  "blocked",
  "retired",
  "switch-failed",
  "unreadable",
  "update-computer",
  "update-here",
  "write-failed",
]);

let status = $state.raw<ReceiverStatus>({ kind: "idle" });
/** The questions the player cancelled; they keep the dot, & any change asks again. */
let dismissed = $state<null | string>(null);
let now = $state(Date.now());
let tellListener: ((tell: SyncTell) => void) | undefined;
let heldTells: SyncTell[] = [];

/** Says what's been held for a tab the player can see. Every open tab holds a tell until then. */
function deliverTells(): void {
  if (!tellListener || heldTells.length === 0 || document.visibilityState !== "visible") return;
  const tells = heldTells;
  heldTells = [];
  for (const tell of tells) tellListener(tell);
  receiver.tellsShown();
}

function resume(): void {
  if (document.visibilityState !== "visible") return;
  deliverTells();
  retry();
}

function retry(): void {
  now = Date.now();
  receiver.refresh();
}

function questionsKey(next: ReceiverStatus): null | string {
  return next.kind === "asking" ? next.questions.map(({ id }) => id).join("\n") : null;
}

const receiver = createReceiver({
  onstatus: (next) => {
    status = next;
  },
  ontell: (tell) => {
    heldTells.push(tell);
    deliverTells();
  },
  ontellsshown: () => {
    heldTells = [];
  },
});

export const syncReceiver = {
  /** Starts the receiver & keeps it fresh as the page comes & goes. Returns what stops it. */
  start(ontell: (tell: SyncTell) => void): () => void {
    tellListener = ontell;
    receiver.start();
    // A held lock would keep the page out of the back/forward cache & other tabs out of the lead.
    const leave = (): void => {
      receiver.stop();
    };
    const returned = (event: PageTransitionEvent): void => {
      if (event.persisted) receiver.start();
    };
    document.addEventListener("visibilitychange", resume);
    globalThis.addEventListener("online", retry);
    globalThis.addEventListener("pagehide", leave);
    globalThis.addEventListener("pageshow", returned);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      globalThis.removeEventListener("online", retry);
      globalThis.removeEventListener("pagehide", leave);
      globalThis.removeEventListener("pageshow", returned);
      receiver.stop();
      tellListener = undefined;
    };
  },
  answer(id: string, answer: SyncAnswer): Promise<void> {
    return receiver.answer(id, answer);
  },
  applyLocalSave: receiver.applyLocalSave,
  /** Cancels the waiting question: it keeps the dot, & opens again with the next page load. */
  dismissQuestion(): void {
    dismissed = questionsKey(status);
  },
  /** How long it's been since a save, when that's abnormally long. Only followers wait on one. */
  get gapDays(): number | undefined {
    if (userState.syncLane?.kind !== "following" || NEEDS_A_LOOK.has(status.kind)) return undefined;
    return abnormalGapDays(userState.syncFreshness, now);
  },
  get needsALook(): boolean {
    return NEEDS_A_LOOK.has(status.kind);
  },
  /** The question to show now, or `undefined` when none waits or the player cancelled it. */
  get question(): SyncApplyQuestion | undefined {
    if (status.kind !== "asking" || dismissed === questionsKey(status)) return undefined;
    return status.questions[0];
  },
  refresh: retry,
  /** Brings a cancelled question back. */
  reopenQuestion(): void {
    dismissed = null;
  },
  get status(): ReceiverStatus {
    return status;
  },
  update(): void {
    receiver.update();
  },
};
