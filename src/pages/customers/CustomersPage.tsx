import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, X, Search } from 'lucide-react'
import { useKeycloakToken } from '../../lib/KeycloakContext'
import { listCustomers, createCustomer, type CustomerResponse, type CustomerFormData } from '../../lib/api'

const PAGE_SIZE = 20

const emptyForm: CustomerFormData = {
  firstName: '',
  lastName: '',
  email: '',
  phoneNumber: '',
  notes: '',
}

export default function CustomersPage() {
  const token = useKeycloakToken()
  const navigate = useNavigate()

  const [customers, setCustomers] = useState<CustomerResponse[]>([])
  const [totalElements, setTotalElements] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [showAddModal, setShowAddModal] = useState(false)
  const [form, setForm] = useState<CustomerFormData>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    setLoading(true)
    setFetchError(null)
    listCustomers(token, { page, size: PAGE_SIZE, name: debouncedSearch || undefined })
      .then((data) => {
        setCustomers(data.content)
        setTotalElements(data.totalElements)
        setTotalPages(data.totalPages)
      })
      .catch(() => setFetchError('Failed to load customers.'))
      .finally(() => setLoading(false))
  }, [token, page, debouncedSearch])

  function openAddModal() {
    setForm(emptyForm)
    setFormError(null)
    setShowAddModal(true)
  }

  function closeAddModal() {
    setShowAddModal(false)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      const customer = await createCustomer(token, form)
      navigate(`/customers/${customer.id}`)
    } catch (err: unknown) {
      const status = (err as { status?: number }).status
      setFormError(status === 409 ? 'Email is already in use.' : 'Failed to save customer. Please try again.')
      setSaving(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <span className="page-eyebrow">{totalElements} customers</span>
          <h1 className="page-title">Customers</h1>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          <Plus size={16} />
          Add Customer
        </button>
      </div>

      <div className="page-body">
        <div className="toolbar">
          <div className="search-wrap">
            <Search size={15} />
            <input
              className="search-input"
              type="search"
              placeholder="Search customers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {fetchError && (
          <p style={{ color: 'var(--status-overdue-fg)', fontFamily: 'var(--font-body)', padding: 'var(--sp-4) 0' }}>
            {fetchError}
          </p>
        )}

        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th className="num-col">Rackets</th>
                <th className="num-col">Active Jobs</th>
                <th>Last Job</th>
                <th className="num-col">Total Spent</th>
                <th className="actions-col"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 'var(--sp-12)', color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>
                    Loading…
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 'var(--sp-12)', color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>
                    {debouncedSearch ? 'No customers match your search.' : 'No customers yet.'}{' '}
                    {!debouncedSearch && (
                      <button className="btn btn-sm btn-primary" onClick={openAddModal} style={{ marginLeft: 'var(--sp-3)' }}>
                        Add Customer
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr
                    key={c.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/customers/${c.id}`)}
                  >
                    <td><div className="cell-primary">{c.firstName} {c.lastName}</div></td>
                    <td><span className="cell-mono">{c.email}</span></td>
                    <td className="num-col"><span style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>—</span></td>
                    <td className="num-col"><span style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>—</span></td>
                    <td><span style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>—</span></td>
                    <td className="num-col"><span style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>—</span></td>
                    <td className="actions-col" onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-sm btn-ghost" onClick={() => navigate(`/customers/${c.id}`)}>
                        View →
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginTop: 'var(--sp-5)', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-sm btn-ghost"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              ← Previous
            </button>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>
              {page + 1} / {totalPages}
            </span>
            <button
              className="btn btn-sm btn-ghost"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {showAddModal && (
        <div
          className="modal-overlay open"
          onClick={(e) => { if (e.target === e.currentTarget) closeAddModal() }}
        >
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Add Customer</span>
              <button className="modal-close" onClick={closeAddModal} type="button">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="form-grid" style={{ gap: 'var(--sp-4)' }}>
                <div className="form-grid form-grid-2">
                  <div className="field">
                    <label htmlFor="new-firstname">First name</label>
                    <input
                      id="new-firstname"
                      type="text"
                      className="input"
                      placeholder="Marc"
                      required
                      value={form.firstName}
                      onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="new-lastname">Last name</label>
                    <input
                      id="new-lastname"
                      type="text"
                      className="input"
                      placeholder="Dubois"
                      required
                      value={form.lastName}
                      onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="new-email">Email</label>
                  <input
                    id="new-email"
                    type="email"
                    className="input"
                    placeholder="marc@example.com"
                    required
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="new-phone">Phone</label>
                  <input
                    id="new-phone"
                    type="tel"
                    className="input"
                    placeholder="+41 78 123 45 67"
                    required
                    value={form.phoneNumber}
                    onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="new-notes">Notes</label>
                  <textarea
                    id="new-notes"
                    className="textarea"
                    placeholder="Anything useful to remember about this customer…"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>
                {formError && (
                  <p style={{ color: 'var(--status-overdue-fg)', fontSize: 'var(--text-sm)', margin: 0 }}>
                    {formError}
                  </p>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={closeAddModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
