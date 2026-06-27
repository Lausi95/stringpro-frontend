import { createContext, useContext, type ReactNode } from 'react'
import keycloak from './keycloak'

interface KeycloakContextValue {
  token: string
}

const KeycloakContext = createContext<KeycloakContextValue>({ token: keycloak.token! })

export function KeycloakProvider({ children }: { children: ReactNode }) {
  return (
    <KeycloakContext.Provider value={{ token: keycloak.token! }}>
      {children}
    </KeycloakContext.Provider>
  )
}

export function useKeycloakToken(): string {
  return useContext(KeycloakContext).token
}
