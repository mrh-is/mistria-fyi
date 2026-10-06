/** Wait before a completed row starts fading out. */
export const ROW_LEAVE_DELAY_MS = 800;
/** Length of the fade-out itself. */
export const ROW_LEAVE_FADE_MS = 200;
/** How long a completed row must stay mounted: delay + fade + a small buffer. */
export const ROW_LEAVE_MS = ROW_LEAVE_DELAY_MS + ROW_LEAVE_FADE_MS + 50;
