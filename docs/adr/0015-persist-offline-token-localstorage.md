# Persist a Keycloak offline token in localStorage for PWA session continuity

The installed PWA "forgets" the login every time it is closed. keycloak-js keeps
tokens in memory only, so an app-kill (routine on iOS, which evicts backgrounded
standalone PWAs) wipes them. On the next cold launch the app has nothing to
present and falls back to an interactive Keycloak login — which is exactly the
cross-origin redirect ADR 0012 flags as fragile in a standalone iOS web view.
The stringer experiences this as being logged out constantly.

Decision: request a **Keycloak offline token** (`scope=offline_access`) and
**persist `{ token, refreshToken, idToken }` in `localStorage`** (key
`stringpro.kc`). On boot, `initAuth()` (`src/lib/auth.ts`) seeds keycloak-js from
the stored tokens with `keycloak.init({ token, refreshToken, idToken })` — **no
`onLoad`, so init never redirects on its own** — then forces
`keycloak.updateToken(-1)`. That exchange is a **direct POST to the token
endpoint** using the offline token: no SSO cookie, no hidden iframe, no top-level
redirect, so it survives the iOS standalone environment where those mechanisms
break. While the offline token is valid the relaunch is silent; once it has
expired or been revoked (or on a fresh device) the `catch` falls back to an
interactive `keycloak.login({ scope: 'offline_access' })`.

This replaces the previous `keycloak.init({ onLoad: 'login-required' })` gate and
supersedes the "nothing is persisted" posture of ADR 0011 (which scoped the PWA
to installability with no client-side persistence). We now persist one thing: an
auth credential. It does **not** reopen offline *operation* — API calls and the
token-endpoint refresh still require the network; an offline launch still fails,
as ADR 0011 intends.

Token lifetime is governed server-side by the realm's **Offline Session Idle**
(default ~30 days). Not opening the app for that long lets the offline session
lapse and forces a fresh login — the intended "weeks, not forever" behaviour.

Refresh is **on-demand only** — there is no background refresh loop. The central
`apiFetch` wrapper in `src/lib/api.ts` calls `keycloak.updateToken(30)` before
every request, so an idle app simply refreshes on its next call. Keeping a token
"warm" while nothing happens buys nothing and fits the online-only stance. This
change also removes the `KeycloakContext`/`useKeycloakToken` layer: the context
only ever carried a **static** token snapshot that never refreshed (a latent bug
that broke sessions after the ~5-minute access-token lifespan even on desktop).
`api.ts` now reads the keycloak singleton directly, matching how `AppShell`
already uses it for identity and logout.

Reason: a long-lived credential minted via a direct token-endpoint call is the
one refresh path that reliably survives an iOS standalone app-kill, and it is
what makes the installed app feel native — the whole point of installing it.

Consequence / tradeoff: a ~30-day bearer token now sits in `localStorage`, so an
XSS bug or unlocked-device storage access yields a token good for up to the
offline-session lifetime. Accepted for a **single-operator** app with no
user-generated/untrusted-HTML surface. The defense-in-depth mitigation, if ever
wanted, is a strict Content-Security-Policy — **not** moving the token to
IndexedDB (same JS-readable exposure). `keycloak.logout()` clears the stored
tokens via the `onAuthLogout` handler, so logout on a device is effective even
though the offline session may still exist server-side.

Server prerequisites (Keycloak `stringpro` client/realm): `offline_access`
assigned as a client scope; Offline Session Idle set to the desired window; the
PWA origin `https://stringpro.lausi95.net` present in Valid Redirect URIs and Web
Origins.
