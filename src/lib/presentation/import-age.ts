/** Relative import time, refreshed by the UI. Future device-clock timestamps display as now. */
export function formatImportAge(importedAt: number, now: number, locale: string): string {
  const seconds = Math.max(0, Math.floor((now - importedAt) / 1000));
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (seconds < 60) return formatter.format(0, "second");
  if (seconds < 3600) return formatter.format(-Math.floor(seconds / 60), "minute");
  if (seconds < 86_400) return formatter.format(-Math.floor(seconds / 3600), "hour");
  return formatter.format(-Math.floor(seconds / 86_400), "day");
}
