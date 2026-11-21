import { getContext, setContext } from "svelte";

import type { SourceFilterId } from "#lib/data/source-filters.js";

/** What the page's index offers the sections inside it. */
export interface LedgerIndexContext {
  /** The jump list's popover id, while the index rail is hidden; otherwise `undefined`. */
  readonly jumpList: string | undefined;
}

const key = Symbol("ledger-index");

export function setLedgerIndexContext(context: LedgerIndexContext): void {
  setContext(key, context);
}

export function getLedgerIndexContext(): LedgerIndexContext | undefined {
  return getContext<LedgerIndexContext | undefined>(key);
}

const sectionKey = Symbol("ledger-section");

/** What a section tells its rows: the source family its place already names, if any. */
export interface LedgerSectionContext {
  readonly contextualFamily: SourceFilterId | undefined;
}

export function setLedgerSectionContext(context: LedgerSectionContext): void {
  setContext(sectionKey, context);
}

export function getLedgerSectionContext(): LedgerSectionContext | undefined {
  return getContext<LedgerSectionContext | undefined>(sectionKey);
}

/**
 * Asks a ledger section to mount the window around the row whose key is the event's `detail`, as
 * Back & search clear do before restoring the reading position on that row.
 */
export const LEDGER_MOUNT_EVENT = "ledgermount";
