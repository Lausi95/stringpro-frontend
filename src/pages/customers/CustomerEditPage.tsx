import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useKeycloakToken } from '../../lib/KeycloakContext'
import { getCustomer, updateCustomer, type CustomerResponse, type CustomerFormData } from '../../lib/api'

export default function CustomerEditPage() {
  const { id } = useParams<{ id: string }>()
  const token = useKeycloakToken()
  const navigate = useNavigate()

  const [customer, setCustomer] = useState<CustomerResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<CustomerFormData>({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    notes: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    getCustomer(token, id)
      .then((c) => {
        setCustomer(c)
        setForm({
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          phoneNumber: c.phoneNumber,
          notes: c.notes ?? '',
        })
      })
      .catch(() => setError('Failed to load customer.'))
      .finally(() => setLoading(false))
  }, [token, id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return
    setSaving(true)
    setError(null)
    try {
      await updateCustomer(token, id, form)
      navigate(`/customers/${id}`)
    } catch (err: unknown) {
      const status = (err as { status?: number }).status
      setError(status === 409 ? 'Email is already in use.' : 'Failed to save changes. Please try again.')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 'var(--sp-8)', color: 'var(--fg-muted)', fontFamily: 'var(--font-body)' }}>
        Loading…
      </div>
    )
  }

  if (!customer) {
    return (
      <div style={{ padding: 'var(--sp-8)', color: 'var(--status-overdue-fg)', fontFamily: 'var(--font-body)' }}>
        {error ?? 'Customer not found.'}
      </div>
    )
  }

  const fullName = `${customer.firstName} ${customer.lastName}`

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="breadcrumb">
            <Link to="/customers">Customers</Link>
            <ChevronRight size={12} />
            <Link to={`/customers/${id}`}>{fullName}</Link>
            <ChevronRight size={12} />
            <span>Edit</span>
          </div>
          <h1 className="page-title">Edit Customer</h1>
        </div>
      </div>

      <div className="page-body">
        <div className="card" style={{ maxWidth: '560px' }}>
          <form onSubmit={handleSubmit}>
            <div className="form-grid" style={{ gap: 'var(--sp-4)' }}>
              <div className="form-grid form-grid-2">
                <div className="field">
                  <label htmlFor="edit-firstname">First name</label>
                  <input
                    id="edit-firstname"
                    type="text"
                    className="input"
                    required
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-lastname">Last name</label>
                  <input
                    id="edit-lastname"
                    type="text"
                    className="input"
                    required
                    value={form.lastName}
                    onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="edit-email">Email</label>
                <input
                  id="edit-email"
                  type="email"
                  className="input"
                  required
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="edit-phone">Phone</label>
                <input
                  id="edit-phone"
                  type="tel"
                  className="input"
                  required
                  value={form.phoneNumber}
                  onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="edit-notes">Notes</label>
                <textarea
                  id="edit-notes"
                  className="textarea"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              {error && (
                <p style={{ color: 'var(--status-overdue-fg)', fontSize: 'var(--text-sm)', margin: 0 }}>
                  {error}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 'var(--sp-3)', marginTop: 'var(--sp-6)', justifyContent: 'flex-end' }}>
              <Link to={`/customers/${id}`} className="btn btn-ghost">Cancel</Link>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
