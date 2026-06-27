import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'

function NotImplemented({ name }: { name: string }) {
  return (
    <main style={{ padding: '2rem', fontFamily: 'var(--font-body)' }}>
      <p style={{ color: 'var(--fg-muted)' }}>{name} — not yet implemented</p>
    </main>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/jobs/new" element={<NotImplemented name="New Job" />} />
        <Route path="/jobs/:id" element={<NotImplemented name="Job Detail" />} />
        <Route path="/customers" element={<NotImplemented name="Customers" />} />
        <Route path="/customers/:id" element={<NotImplemented name="Customer Detail" />} />
        <Route path="/strings" element={<NotImplemented name="Strings" />} />
        <Route path="/payments" element={<NotImplemented name="Payments" />} />
        <Route path="/settings" element={<NotImplemented name="Settings" />} />
      </Routes>
    </BrowserRouter>
  )
}
