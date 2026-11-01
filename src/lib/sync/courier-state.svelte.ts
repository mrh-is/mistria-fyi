/**
 * The page's one courier, & what its status means for the status button & the notes. See
 * `docs/sync.md` § The courier.
 */
import { pruneSavArchive } from "#lib/engine/parse-sav.js";

import { createCourier, IDLE_COURIER } from "./courier.js";
import { syncReceiver } from "./receiver-state.svelte.js";
import { fileOf } from "./save-source.js";

import type { CourierStatus } from "./courier.js";
import type { SaveSource } from "./save-source.js";

let status = $state.raw<CourierStatus>(IDLE_COURIER);

const courier = createCourier({
  applyLocal: (file) => syncReceiver.applyLocalSave(file),
  onstatus: (next) => {
    status = next;
  },
});

function resume(): void {
  if (document.visibilityState === "visible") courier.retry();
}

function retry(): void {
  courier.retry();
}

export const syncCourier = {
  /** Starts the courier & keeps it fresh as the page comes & goes. Returns what stops it. */
  start(): () => void {
    courier.start();
    // A held lock would keep the page out of the back/forward cache & other windows out of the lead.
    const leave = (): void => {
      courier.stop();
    };
    const returned = (event: PageTransitionEvent): void => {
      if (event.persisted) courier.start();
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
      courier.stop();
    };
  },
  check(): Promise<void> {
    return courier.check();
  },
  /**
   * Takes a save file the player dropped in. Rejects one that isn't a save at all, so a wrong file
   * says so right there & changes nothing; a save this build can't read gets the courier's notice.
   */
  async offer(source: SaveSource): Promise<void> {
    await pruneSavArchive(await fileOf(source));
    await courier.take(source);
  },
  reallow(): Promise<void> {
    return courier.reallow();
  },
  retry,
  /** Whether the status button should speak up. Another window has it covered, so that one doesn't. */
  get speaksUp(): boolean {
    return (
      (status.trouble !== undefined && status.trouble !== "other-window") ||
      status.upload !== "idle"
    );
  },
  get status(): CourierStatus {
    return status;
  },
  take(source: SaveSource): Promise<void> {
    return courier.take(source);
  },
  update(): void {
    courier.update();
  },
};
