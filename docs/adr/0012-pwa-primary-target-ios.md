# iOS is the primary PWA install target

The PWA's primary install target is an iPhone/iPad home-screen install (standalone display). This constraint is not visible in the code but drives several setup choices, because iOS treats PWAs differently from Android/desktop Chrome.

Decisions driven by this target:

- **No install prompt → in-app hint.** iOS Safari fires no `beforeinstallprompt`. Provide a small dismissible "Add to Home Screen" hint, shown only on iOS Safari when not already running standalone.
- **Safe areas.** `index.html` must use `viewport-fit=cover`; the fixed bottom `.mobile-nav` and notch areas need `env(safe-area-inset-*)` padding, or content sits under the home indicator in standalone.
- **iOS meta + icon.** Emit `mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, and an `apple-touch-icon` (the assets generator produces it) — iOS does not fully honor the manifest.
- **Splash.** Rely on manifest name + `background_color` + icon (modern iOS auto-generates a splash); do **not** ship the 20+ per-device `apple-touch-startup-image` files.
- **Auth redirect is a verify-on-device gate, not a speculative workaround.** `keycloak.init({ onLoad: 'login-required' })` does a full-page redirect to `auth.lausi95.net` (a different origin). The historical iOS failure — the redirect escaping the standalone window into Safari and losing PKCE/state — was largely a pre-iOS-16.4 problem; modern iOS keeps top-level cross-origin navigations inside the standalone web view, and keycloak-js persists PKCE/state/nonce in localStorage+cookie (not sessionStorage), so the round-trip survives. We ship the **standard redirect flow** and make "log in successfully in standalone mode on a real iPhone" the done-gate. We build keycloak storage/flow workarounds **only if a real device actually loops**.

Reason: targeting iOS specifically (vs Android/desktop, where the redirect flow just works) is what forces the safe-area work, the manual install hint, and the on-device login verification. Recording it stops a future reader from "simplifying away" these iOS-only accommodations.
