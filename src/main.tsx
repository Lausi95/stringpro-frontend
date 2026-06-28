import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import keycloak from './lib/keycloak'
import { KeycloakProvider } from './lib/KeycloakContext'
import { ToastProvider } from './components/Toast'
import App from './App'
import './styles/shared.css'

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
