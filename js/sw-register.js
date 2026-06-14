"use strict";
/* Registers the service worker for offline + installable PWA use.
   Kept in its own file (not inline) so the Content-Security-Policy can
   forbid inline scripts — a key XSS defence. */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("sw.js").catch(() => {})
  );
}
