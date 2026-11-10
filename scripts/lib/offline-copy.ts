/** English copy for the static page that the service worker can render without the app. */
export function offlineSourceCopy(): Record<string, string> {
  return {
    action_retry: "Try again",
    offline_body:
      "The Mistria Field Guide needs an internet connection to load for the first time. Your progress is safe on this device, and it’ll be right here when you’re back online.",
    offline_eyebrow: "Field note · No signal",
    offline_heading: "You’re offline",
    offline_page_title: "Mistria Field Guide · Offline",
  };
}
