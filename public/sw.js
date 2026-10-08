// Minimal service worker: makes the site installable on phones ("Add to Home screen").
// It deliberately does NOT cache pages or API data, so money information is never shown stale or offline.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});