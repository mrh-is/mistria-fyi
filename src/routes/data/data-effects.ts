export interface ClosableScanner {
  destroy: () => void;
  stop: () => void;
}

export function closeScanner(scanner: ClosableScanner | null): null {
  scanner?.stop();
  scanner?.destroy();
  return null;
}

export async function openThenScroll(
  open: () => void,
  scroll: () => void,
  settle: () => Promise<void>,
): Promise<void> {
  open();
  await settle();
  scroll();
}
