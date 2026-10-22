/** Wait before a completed row starts fading out. */
export const ROW_LEAVE_DELAY_MS = 800;
/** Length of the fade-out itself. */
export const ROW_LEAVE_FADE_MS = 200;
/** How long a completed row must stay mounted: delay + fade + a small buffer. */
export const ROW_LEAVE_MS = ROW_LEAVE_DELAY_MS + ROW_LEAVE_FADE_MS + 50;
/** How long an uncompleted row's full-color sprite preview stays up. */
export const SPRITE_PREVIEW_HOLD_MS = 2000;
/** Length of the sprite preview's fade in & out. */
export const SPRITE_PREVIEW_FADE_MS = 200;
