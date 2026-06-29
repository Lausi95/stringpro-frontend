# PWA is installable but online-only — no offline support

StringPro will be a Progressive Web App so the stringer can install it to the home screen and launch it in a standalone, app-like window (no browser chrome). We are deliberately scoping this to **installability only**: the app still requires a network connection to function. We are **not** building offline support — no cached API data, no read-while-offline, and no offline mutation queue.

Decision: add [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/) (1.3.0, supports Vite 8) to generate a web app manifest, inject the icon/theme tags, and emit a Workbox service worker that **precaches the built app shell only**. API calls (`/api/*`) and Keycloak (`auth.lausi95.net`) are always network — the service worker must never cache them, and `navigateFallback` must deny-list `/api`. The service worker uses `registerType: 'autoUpdate'`: a new deploy is fetched and applied silently, reloading on activation (accepted tradeoff: a reload can land mid-edit).

Reason: the value the user wants is a home-screen icon and a standalone window, not offline operation. Going offline-capable is a large, hard-to-reverse step — it would require a client-side cache/persistence layer, reworking the `keycloak.init({ onLoad: 'login-required' })` gate (which today hard-redirects to Keycloak before React mounts and cannot complete offline), and conflict handling for queued writes. None of that is justified by the current goal, so we draw the boundary explicitly.

Consequence: launching the installed app with no connection will fail at the Keycloak gate (a degraded error, not a branded offline screen) — acceptable while online-only. If true offline use is ever wanted, this ADR and the auth gate must be revisited together.
