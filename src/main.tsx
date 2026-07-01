import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { initAuth } from './lib/auth'
import { ToastProvider } from './components/Toast'
import App from './App'
import './styles/shared.css'

// Register the service worker so the app is installable. `autoUpdate` (configured
// in vite.config.ts) silently fetches new deploys and reloads on activation.
registerSW({ immediate: true })

// initAuth() resolves true only with a valid session in hand; otherwise an
// interactive login redirect is under way and there is nothing to render.
initAuth()
  .then(authenticated => {
    if (!authenticated) return
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <ToastProvider>
          <App />
        </ToastProvider>
      </StrictMode>,
    )
  })
  .catch((err: unknown) => {
    console.error('[keycloak] init failed', err)
    document.getElementById('root')!.textContent = `Keycloak init failed: ${String(err)}`
  })
