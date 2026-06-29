import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import keycloak from './lib/keycloak'
import { KeycloakProvider } from './lib/KeycloakContext'
import { ToastProvider } from './components/Toast'
import App from './App'
import './styles/shared.css'

// Register the service worker so the app is installable. `autoUpdate` (configured
// in vite.config.ts) silently fetches new deploys and reloads on activation.
registerSW({ immediate: true })

keycloak
  .init({ onLoad: 'login-required' })
  .then(authenticated => {
    if (!authenticated) return
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <KeycloakProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </KeycloakProvider>
      </StrictMode>,
    )
  })
  .catch((err: unknown) => {
    console.error('[keycloak] init failed', err)
    document.getElementById('root')!.textContent = `Keycloak init failed: ${String(err)}`
  })
