import keycloak from './keycloak'

// Persist the Keycloak offline token so the installed PWA survives an app-kill.
// keycloak-js keeps tokens in memory only; on a cold relaunch that memory is
// gone, so without this the app bounces to the Keycloak login page. We instead
// stash the offline (long-lived) refresh token in localStorage and, on launch,
// mint a fresh access token via a direct token-endpoint call — no SSO cookie,
// no hidden iframe, no top-level redirect (the path that fails in an iOS
// standalone PWA). See docs/adr/0015-persist-offline-token-localstorage.md.

const STORAGE_KEY = 'stringpro.kc'

// The offline_access scope turns the refresh token into a long-lived offline
// token that survives SSO-session expiry (Keycloak realm Offline Session Idle,
// default ~30 days). openid is added automatically by the adapter.
const OFFLINE_SCOPE = 'offline_access'

interface StoredTokens {
  token?: string
  refreshToken?: string
  idToken?: string
}

function loadTokens(): StoredTokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredTokens) : null
  } catch {
    return null
  }
}

function saveTokens(): void {
  try {
    const data: StoredTokens = {
      token: keycloak.token,
      refreshToken: keycloak.refreshToken,
      idToken: keycloak.idToken,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Storage full or unavailable (private mode) — the session still works for
    // this launch; it just won't survive an app-kill. Nothing to recover.
  }
}

function clearTokens(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

/**
 * Interactive login that requests an offline token. Redirects away, so callers
 * should treat the returned promise as never resolving.
 */
export function loginWithOffline(): Promise<void> {
  return keycloak.login({ scope: OFFLINE_SCOPE })
}

/**
 * Log out. Must clear the stored offline token *first*: an offline token
 * outlives the Keycloak SSO session (end-session kills the online session, not
 * the offline one), so leaving it in localStorage would let the next launch
 * silently re-authenticate — i.e. logout wouldn't log you out. The redirect
 * adapter's `logout()` never clears our key on its own.
 */
export function logout(): Promise<void> {
  clearTokens()
  return keycloak.logout()
}

/**
 * Initialise auth for app boot. Returns true when a valid session is in hand
 * (safe to render React); when it returns false or does not resolve, an
 * interactive login redirect is under way and nothing should render.
 */
export async function initAuth(): Promise<boolean> {
  // Re-persist on every rotation; clear when the session ends so a logged-out
  // user is never silently re-authenticated from a stale stored token.
  keycloak.onAuthSuccess = saveTokens
  keycloak.onAuthRefreshSuccess = saveTokens
  keycloak.onAuthLogout = clearTokens
  keycloak.onAuthRefreshError = clearTokens

  const stored = loadTokens()

  // No onLoad → init never redirects on its own. It still processes an incoming
  // login callback (?code=) if we are returning from an interactive login, and
  // adopts any stored tokens we seed here. A malformed stored entry can make
  // init throw — self-heal by dropping it and sending the user to log in,
  // rather than dead-ending on main.tsx's "init failed" screen.
  let authenticated: boolean
  try {
    authenticated = await keycloak.init({
      token: stored?.token,
      refreshToken: stored?.refreshToken,
      idToken: stored?.idToken,
      pkceMethod: 'S256',
    })
  } catch {
    clearTokens()
    await loginWithOffline()
    return false
  }

  // Returning from an interactive login redirect (no seeded token, but init
  // consumed the code) → we already hold fresh tokens, render straight away.
  if (authenticated && !stored?.refreshToken) return true

  if (stored?.refreshToken) {
    try {
      // Force a refresh: exchanges the stored offline token for a fresh access
      // token via a direct POST to the token endpoint. Succeeds silently while
      // the offline token is valid; throws once it has expired or been revoked.
      await keycloak.updateToken(-1)
      return true
    } catch {
      clearTokens()
    }
  }

  // Fresh device, or the offline token lapsed → interactive login (redirects).
  await loginWithOffline()
  return false
}
