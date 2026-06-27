import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { useKeycloakToken } from '../../lib/KeycloakContext'
import {
  listReels,
  changeReelState,
  deleteReel,
  type ReelResponse,
  type ReelState,
  type ReelMaterial,
} from '../../lib/api'
import Modal from '../../components/Modal'
import ReelFormModal from '../../components/ReelFormModal'
import './StringsPage.css'

const FETCH_SIZE = 200
const DASH = '—'

const MATERIAL_LABEL: Record<ReelMaterial, string> = {
  POLYESTER: 'Polyester',
  NATURAL_GUT: 'Natural gut',
  MULTIFILAMENT: 'Multifilament',
  SYNTHETIC_GUT: 'Synthetic gut',
}

const STATE_META: Record<ReelState, { label: string; cls: string }> = {
  NEW: { label: 'New', cls: 'new' },
  IN_USE: { label: 'In Use', cls: 'active' },
  USED_UP: { label: 'Used up', cls: 'used_up' },
}

const STATE_ORDER: ReelState[] = ['NEW', 'IN_USE', 'USED_UP']

type Filter = 'ALL' | ReelState

const FILTER_TABS: { key: Filter; label: string }[] = [
  { key: 'IN_USE', label: 'Active' },
  { key: 'NEW', label: 'New' },
  { key: 'USED_UP', label: 'Used up' },
  { key: 'ALL', label: 'All' },
]

function fmtEur(n: number): string {
  return '€ ' + n.toFixed(2)
}

function fmtDate(iso: string): string {
  if (!iso) return DASH
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function StringsPage() {
  const token = useKeycloakToken()

  const [reels, setReels] = useState<ReelResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [filter, setFilter] = useState<Filter>('ALL')
  const [busyStateId, setBusyStateId] = useState<string | null>(null)

  const [formModal, setFormModal] = useState<{ mode: 'create' } | { mode: 'edit'; reel: ReelResponse } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ReelResponse | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setLoading(true)
    setFetchError(null)
    listReels(token, { page: 0, size: FETCH_SIZE })
      .then((data) => setReels(data.content))
      .catch(() => setFetchError('Failed to load reels.'))
      .finally(() => setLoading(false))
  }, [token])

  const counts = {
    ALL: reels.length,
    NEW: reels.filter((r) => r.state === 'NEW').length,
    IN_USE: reels.filter((r) => r.state === 'IN_USE').length,
    USED_UP: reels.filter((r) => r.state === 'USED_UP').length,
  }

  const totalInvested = reels.reduce((sum, r) => sum + r.cost, 0)

  const visibleReels = filter === 'ALL' ? reels : reels.filter((r) => r.state === filter)

  async function handleChangeState(reel: ReelResponse, next: ReelState) {
    if (reel.state === next) return
    setBusyStateId(reel.id)
    // Optimistic update; revert on failure.
    setReels((rs) => rs.map((r) => (r.id === reel.id ? { ...r, state: next } : r)))
    try {
      const updated = await changeReelState(token, reel.id, next)
      setReels((rs) => rs.map((r) => (r.id === reel.id ? updated : r)))
    } catch {
      setReels((rs) => rs.map((r) => (r.id === reel.id ? reel : r)))
      setFetchError('Failed to change reel state.')
    } finally {
      setBusyStateId(null)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteReel(token, deleteTarget.id)
      setReels((rs) => rs.filter((r) => r.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch {
      setFetchError('Failed to delete reel.')
    } finally {
      setDeleting(false)
    }
  }

  function handleSaved(reel: ReelResponse) {
    setReels((rs) => {
      const exists = rs.some((r) => r.id === reel.id)
      return exists ? rs.map((r) => (r.id === reel.id ? reel : r)) : [reel, ...rs]
    })
    setFormModal(null)
  }

  const eyebrow =
    reels.length === 0
      ? 'No reels yet'
      : STATE_ORDER.filter((s) => counts[s] > 0)
          .map((s) => `${counts[s]} ${STATE_META[s].label.toLowerCase()}`)
          .join(' · ')

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <span className="page-eyebrow">{eyebrow}</span>
          <h1 className="page-title">String Inventory</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setFormModal({ mode: 'create' })}>
          <Plus size={16} />
          Add Reel
        </button>
      </div>

      <div className="page-body">
        <div className="summary-cards" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="summary-card">
            <div className="summary-card-label">Reels</div>
            <div className="summary-card-value">{reels.length}</div>
            <div className="summary-card-sub">{reels.length ? eyebrow : 'Add your first reel'}</div>
          </div>
          <div className="summary-card">
            <div className="summary-card-label">Total invested</div>
            <div className="summary-card-value">{fmtEur(totalInvested)}</div>
            <div className="summary-card-sub">
              across {reels.length} reel{reels.length !== 1 ? 's' : ''}
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-card-label">String fees collected</div>
            <div className="summary-card-value">{DASH}</div>
            <div className="summary-card-sub">Tracked once jobs are recorded</div>
          </div>
          <div className="summary-card">
            <div className="summary-card-label">Avg string efficiency</div>
            <div className="summary-card-value">{DASH}</div>
            <div className="summary-card-sub">Tracked once jobs are recorded</div>
          </div>
        </div>

        <div className="filter-tabs">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              className={`filter-tab${filter === tab.key ? ' active' : ''}`}
              onClick={() => setFilter(tab.key)}
            >
              {tab.label} <span className="tab-count">{counts[tab.key]}</span>
            </button>
          ))}
        </div>

        {fetchError && (
          <p style={{ color: 'var(--status-overdue-fg)', fontFamily: 'var(--font-body)', padding: 'var(--sp-4) 0' }}>
            {fetchError}
          </p>
        )}

        {loading ? (
          <p style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-sm)', padding: 'var(--sp-12) 0', textAlign: 'center' }}>
            Loading…
          </p>
        ) : reels.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--sp-12) 0', color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>
            No reels yet.{' '}
            <button className="btn btn-sm btn-primary" onClick={() => setFormModal({ mode: 'create' })} style={{ marginLeft: 'var(--sp-3)' }}>
              Add Reel
            </button>
          </div>
        ) : visibleReels.length === 0 ? (
          <p style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-sm)', padding: 'var(--sp-12) 0', textAlign: 'center' }}>
            No reels in this state.
          </p>
        ) : (
          <div className="roll-grid">
            {visibleReels.map((reel) => (
              <ReelCard
                key={reel.id}
                reel={reel}
                busy={busyStateId === reel.id}
                onChangeState={handleChangeState}
                onEdit={() => setFormModal({ mode: 'edit', reel })}
                onDelete={() => setDeleteTarget(reel)}
              />
            ))}
          </div>
        )}
      </div>

      {formModal && (
        <ReelFormModal
          mode={formModal.mode}
          initial={formModal.mode === 'edit' ? formModal.reel : undefined}
          onClose={() => setFormModal(null)}
          onSaved={handleSaved}
        />
      )}

      {deleteTarget && (
        <Modal title="Delete Reel" onClose={() => (deleting ? undefined : setDeleteTarget(null))}>
          <div style={{ padding: 'var(--sp-2) 0 var(--sp-4)', fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
            Delete <strong>{deleteTarget.brand} · {deleteTarget.model}</strong>? This cannot be undone.
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete Reel'}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}

interface ReelCardProps {
  reel: ReelResponse
  busy: boolean
  onChangeState: (reel: ReelResponse, next: ReelState) => void
  onEdit: () => void
  onDelete: () => void
}

function ReelCard({ reel, busy, onChangeState, onEdit, onDelete }: ReelCardProps) {
  const meta = STATE_META[reel.state]
  // Knowable without jobs: yield the reel can theoretically deliver.
  const predictedJobs = reel.metersPerJob > 0 ? Math.floor(reel.reelLengthMeters / reel.metersPerJob) : 0
  const potentialIncome = predictedJobs * reel.stringFee

  return (
    <div className={`roll-card${reel.state === 'USED_UP' ? ' inactive' : ''}`}>
      <div className="roll-header">
        <div>
          <div className="roll-name">{reel.brand} · {reel.model}</div>
          <div className="roll-pills">
            <span className="roll-pill">{MATERIAL_LABEL[reel.material]}</span>
            <span className="roll-pill">{reel.gauge} mm</span>
            <span className="roll-pill">{reel.reelLengthMeters} m reel</span>
            <span className="roll-pill price">{fmtEur(reel.stringFee)}/job</span>
          </div>
        </div>
        <div className="roll-header-right">
          <span className={`reel-state-badge ${meta.cls}`}>{meta.label}</span>
          <div className="reel-state-segment" role="group" aria-label="Reel state">
            {STATE_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                className={reel.state === s ? 'active' : ''}
                disabled={busy}
                onClick={() => onChangeState(reel, s)}
              >
                {STATE_META[s].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="roll-meter">
        <div className="roll-meter-bar-wrap">
          <div className="roll-meter-fill empty" style={{ width: '0%' }} />
        </div>
        <div className="roll-meter-labels">
          <span>Usage {DASH}</span>
          <span className="roll-meter-remaining">~{predictedJobs} jobs predicted</span>
        </div>
      </div>

      <div className="roll-efficiency">
        <div className="eff-header">Predicted yield</div>
        <div className="eff-cols">
          <div>
            <div className="eff-col-label">Full reel</div>
            <div className="eff-col-jobs">{predictedJobs} jobs</div>
            <div className="eff-col-income">{fmtEur(potentialIncome)} potential</div>
          </div>
          <div>
            <div className="eff-col-label">Used so far</div>
            <div className="eff-col-jobs muted">{DASH} jobs</div>
            <div className="eff-col-income">{DASH} earned</div>
          </div>
        </div>
      </div>

      <div className="roll-financials">
        <div className="roll-fin-row">
          <span className="roll-fin-label">Reel cost</span>
          <span className="roll-fin-val">{fmtEur(reel.cost)}</span>
        </div>
        <div className="roll-fin-row">
          <span className="roll-fin-label">String fees earned</span>
          <span className="roll-fin-val muted">{DASH}</span>
        </div>
        <div className="roll-fin-divider" />
        <div className="roll-fin-net">
          <span>Net return</span>
          <div style={{ textAlign: 'right' }}>
            <span className="roll-fin-net-num">{DASH}</span>
            <div className="roll-fin-net-sub">Tracked once jobs are recorded</div>
          </div>
        </div>
      </div>

      <div className="roll-footer">
        <span className="roll-purchase-date">Purchased {fmtDate(reel.purchaseDate)}</span>
        <div className="roll-footer-actions">
          <button type="button" className="btn btn-sm btn-ghost" onClick={onEdit}>
            Edit
          </button>
          <button type="button" className="btn btn-sm btn-danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
