export async function openThenScroll(
  open: () => void,
  scroll: () => void,
  settle: () => Promise<void>,
): Promise<void> {
  open();
  await settle();
  scroll();
}
