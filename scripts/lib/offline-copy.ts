/** English copy for the static page that the service worker can render without the app. */
export function offlineSourceCopy(): Record<string, string> {
  return {
    body: "The Mistria Field Guide needs an internet connection to load for the first time. Your progress is safe on this device, and it’ll be right here when you’re back online.",
    eyebrow: "Field note · No signal",
    heading: "You’re offline",
    retry: "Try again",
    title: "Mistria Field Guide · Offline",
  };
}
