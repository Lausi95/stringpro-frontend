import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Plus, ChevronRight } from 'lucide-react'
import {
  getCustomer,
  deleteCustomer,
  listRackets,
  type CustomerResponse,
  type RacketResponse,
} from '../../lib/api'
import CustomerFormModal from '../../components/CustomerFormModal'
import RacketFormModal from '../../components/RacketFormModal'

function formatSince(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

/** Modal target: create a new racket, or edit an existing one. */
type RacketModalState = { mode: 'create' } | { mode: 'edit'; racket: RacketResponse }

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [customer, setCustomer] = useState<CustomerResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [showEditCustomer, setShowEditCustomer] = useState(false)

  const [rackets, setRackets] = useState<RacketResponse[]>([])
  const [racketsLoading, setRacketsLoading] = useState(true)
  const [racketsError, setRacketsError] = useState<string | null>(null)
  const [racketModal, setRacketModal] = useState<RacketModalState | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    getCustomer(id)
      .then(setCustomer)
      .catch(() => setError('Customer not found.'))
      .finally(() => setLoading(false))
  }, [id])

  const loadRackets = useCallback(() => {
    if (!id) return
    setRacketsLoading(true)
    setRacketsError(null)
    listRackets(id)
      .then(setRackets)
      .catch(() => setRacketsError('Failed to load rackets.'))
      .finally(() => setRacketsLoading(false))
  }, [id])

  useEffect(() => {
    loadRackets()
  }, [loadRackets])

  async function handleDelete() {
    if (!id) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteCustomer(id)
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
          <Link to={`/jobs/new?customerId=${id}`} className="btn btn-primary">
            <Plus size={16} />
            New Job
          </Link>
          <button className="btn btn-ghost" onClick={() => setShowEditCustomer(true)}>
            Edit
          </button>
          <button className="btn btn-danger" onClick={() => setShowDeleteDialog(true)}>
            Delete
          </button>
        </div>
      </div>

      <div className="page-body">
        <div className="customer-overview">
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
          {racketsLoading ? (
            <div style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>Loading…</div>
          ) : racketsError ? (
            <div className="card" style={{ color: 'var(--status-overdue-fg)', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-3)' }}>
              {racketsError}
              <button className="btn btn-sm btn-ghost" onClick={loadRackets}>Try again</button>
            </div>
          ) : (
            <div className="racket-grid">
              {rackets.map((r) => (
                <div key={r.id} className="racket-card" style={{ cursor: 'default' }}>
                  <div className="cell-primary" style={{ marginBottom: 'var(--sp-1)' }}>
                    {r.brand} {r.model}
                  </div>
                  <div className="cell-secondary">
                    Head: {r.headSize} cm² · {r.stringMains}×{r.stringCrosses}
                  </div>
                  {r.notes && <div className="racket-card-note">{r.notes}</div>}
                  <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-3)' }}>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => setRacketModal({ mode: 'edit', racket: r })}
                    >
                      Edit
                    </button>
                    <Link className="btn btn-sm btn-secondary" to={`/jobs/new?customerId=${id}&racketId=${r.id}`}>
                      String this
                    </Link>
                  </div>
                </div>
              ))}
              <button className="add-racket-card" onClick={() => setRacketModal({ mode: 'create' })}>
                <Plus size={20} />
                Add racket
              </button>
            </div>
          )}
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

      {showEditCustomer && (
        <CustomerFormModal
          mode="edit"
          initial={customer}
          onClose={() => setShowEditCustomer(false)}
          onSaved={(updated) => {
            setCustomer(updated)
            setShowEditCustomer(false)
          }}
        />
      )}

      {racketModal && id && (
        <RacketFormModal
          mode={racketModal.mode}
          customerId={id}
          initial={racketModal.mode === 'edit' ? racketModal.racket : undefined}
          onClose={() => setRacketModal(null)}
          onSaved={() => {
            setRacketModal(null)
            loadRackets()
          }}
          onDeleted={() => {
            setRacketModal(null)
            loadRackets()
          }}
        />
      )}
    </>
  )
}
