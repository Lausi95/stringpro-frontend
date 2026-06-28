import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AppShell from './components/AppShell'
import HomePage from './pages/HomePage'
import JobFormPage from './pages/jobs/JobFormPage'
import JobDetailPage from './pages/jobs/JobDetailPage'
import CustomersPage from './pages/customers/CustomersPage'
import CustomerDetailPage from './pages/customers/CustomerDetailPage'
import StringsPage from './pages/strings/StringsPage'
import ReelDetailPage from './pages/strings/ReelDetailPage'
import SettingsPage from './pages/settings/SettingsPage'

function NotImplemented({ name }: { name: string }) {
  return (
    <div style={{ padding: '2rem', fontFamily: 'var(--font-body)' }}>
      <p style={{ color: 'var(--fg-muted)' }}>{name} — not yet implemented</p>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/jobs/new" element={<JobFormPage />} />
          <Route path="/jobs/:id/edit" element={<JobFormPage />} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/customers/:id" element={<CustomerDetailPage />} />
          <Route path="/strings" element={<StringsPage />} />
          <Route path="/strings/:id" element={<ReelDetailPage />} />
          <Route path="/payments" element={<NotImplemented name="Payments" />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
