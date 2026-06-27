import { useEffect, useState } from 'react'
import { useKeycloakToken } from '../lib/KeycloakContext'

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

export default function HomePage() {
  const token = useKeycloakToken()
  const [data, setData] = useState<Record<string, string> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/hello`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        return res.json() as Promise<Record<string, string>>
      })
      .then(setData)
      .catch((err: Error) => setError(err.message))
  }, [token])

  return (
    <main style={{ padding: '2rem' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', marginBottom: '1rem' }}>StringPro</h1>
      {error && (
        <div className="card" style={{ color: 'var(--fg-muted)' }}>
          Error: {error}
        </div>
      )}
      {data && (
        <div className="card">
          <pre style={{ fontFamily: 'var(--font-mono)', margin: 0 }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
      {!data && !error && (
        <div className="card" style={{ color: 'var(--fg-muted)' }}>Loading…</div>
      )}
    </main>
  )
}
