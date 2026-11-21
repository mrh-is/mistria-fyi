export interface RowWindow {
  end: number;
  start: number;
}

const OVERSCAN = 0.5;
const STEP = 12;
// An explicit reveal or restore has a screenful ready before the viewport observer runs.
export const REVEAL_ROWS = 24;

export function windowAround(index: number, count: number): RowWindow {
  return {
    start: Math.max(0, index - STEP),
    end: Math.min(count, index + REVEAL_ROWS),
  };
}

/** Map the viewport onto the shelf, using measured space where rows are mounted. */
export function viewportWindow(
  count: number,
  current: RowWindow,
  top: number,
  renderedTop: number,
  renderedBottom: number,
  rowHeight: number,
  viewportHeight: number,
): RowWindow | undefined {
  const pad = viewportHeight * OVERSCAN;
  const bottom = renderedBottom + (count - current.end) * rowHeight;
  if (bottom <= -pad || top >= viewportHeight + pad) return undefined;

  const indexAt = (y: number): number => {
    if (y < renderedTop) return (y - top) / rowHeight;
    if (y > renderedBottom) return current.end + (y - renderedBottom) / rowHeight;
    const height = Math.max(rowHeight, renderedBottom - renderedTop);
    return current.start + ((y - renderedTop) / height) * (current.end - current.start);
  };
  return {
    start: Math.max(0, Math.floor(indexAt(-pad) / STEP) * STEP),
    end: Math.min(count, Math.ceil(indexAt(viewportHeight + pad) / STEP) * STEP),
  };
}
