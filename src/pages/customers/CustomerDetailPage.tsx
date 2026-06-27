import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Plus, ChevronRight } from 'lucide-react'
import { useKeycloakToken } from '../../lib/KeycloakContext'
import { getCustomer, deleteCustomer, type CustomerResponse } from '../../lib/api'

function formatSince(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const token = useKeycloakToken()
  const navigate = useNavigate()

  const [customer, setCustomer] = useState<CustomerResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    getCustomer(token, id)
      .then(setCustomer)
      .catch(() => setError('Customer not found.'))
      .finally(() => setLoading(false))
  }, [token, id])

  async function handleDelete() {
    if (!id) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteCustomer(token, id)
      navigate('/customers')
    } catch {
      setDeleting(false)
      setDeleteError('Failed to delete customer. Please try again.')
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 'var(--sp-8)', color: 'var(--fg-muted)', fontFamily: 'var(--font-body)' }}>
        Loading…
      </div>
    )
  }

  if (error || !customer) {
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
            <span>{fullName}</span>
          </div>
          <h1 className="page-title">{fullName}</h1>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
          <Link to="/jobs/new" className="btn btn-primary">
            <Plus size={16} />
            New Job
          </Link>
          <Link to={`/customers/${customer.id}/edit`} className="btn btn-ghost">
            Edit
          </Link>
          <button className="btn btn-danger" onClick={() => setShowDeleteDialog(true)}>
            Delete
          </button>
        </div>
      </div>

      <div className="page-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-5)', marginBottom: 'var(--sp-8)' }}>
          <div className="card">
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', marginBottom: 'var(--sp-4)' }}>
              Contact
            </div>
            <div className="detail-row" style={{ borderTop: 'none', paddingTop: 0 }}>
              <span className="detail-key">Email</span>
              <span className="detail-val" style={{ fontSize: 'var(--text-xs)' }}>{customer.email}</span>
            </div>
            <div className="detail-row">
              <span className="detail-key">Phone</span>
              <span className="detail-val mono">{customer.phoneNumber}</span>
            </div>
            <div className="detail-row">
              <span className="detail-key">Since</span>
              <span className="detail-val mono">{formatSince(customer.createdAt)}</span>
            </div>
            {customer.notes && (
              <div className="detail-row">
                <span className="detail-key">Notes</span>
                <span className="detail-val" style={{ maxWidth: '60%', textAlign: 'right' }}>{customer.notes}</span>
              </div>
            )}
          </div>

          <div className="summary-card">
            <div className="summary-card-label">Jobs total</div>
            <div className="summary-card-value" style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-sm)', fontStyle: 'italic' }}>
              Not integrated yet
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-card-label">Total spent</div>
            <div className="summary-card-value" style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-sm)', fontStyle: 'italic' }}>
              Not integrated yet
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 'var(--sp-8)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--sp-5)' }}>
            Rackets
          </h2>
          <div className="card" style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-sm)', fontStyle: 'italic' }}>
            Not integrated yet
          </div>
        </div>

        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--sp-5)' }}>
            Job History
          </h2>
          <div className="card" style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-sm)', fontStyle: 'italic' }}>
            Not integrated yet
          </div>
        </div>
      </div>

      {showDeleteDialog && (
        <div className="modal-overlay open">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Delete Customer</span>
            </div>
            <div style={{ padding: 'var(--sp-2) 0 var(--sp-4)', fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
              Are you sure you want to delete <strong>{fullName}</strong>? This cannot be undone.
            </div>
            {deleteError && (
              <p style={{ color: 'var(--status-overdue-fg)', fontSize: 'var(--text-sm)', margin: '0 0 var(--sp-3)' }}>
                {deleteError}
              </p>
            )}
            <div className="modal-footer">
              <button
                className="btn btn-ghost"
                onClick={() => setShowDeleteDialog(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete Customer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
