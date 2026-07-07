import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import {
  listReels,
  changeReelState,
  deleteReel,
  fetchAllJobs,
  aggregateReelUsage,
  sumReelUsage,
  isConsuming,
  jobSides,
  type ReelResponse,
  type ReelState,
  type ReelMaterial,
  type ReelUsage,
  type JobResponse,
} from '../../lib/api'
import Modal from '../../components/Modal'
import ReelFormModal from '../../components/ReelFormModal'
import './StringsPage.css'

const FETCH_SIZE = 200
const DASH = '—'

/** Meters can be fractional (a Hybrid side draws half a stringing); trim to ≤1 decimal. */
function fmtMeters(n: number): string {
  return (Math.round(n * 10) / 10).toString()
}

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
  const navigate = useNavigate()

  const [reels, setReels] = useState<ReelResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Jobs feed the derived usage/earnings; fetched independently so a jobs
  // failure never blocks the reel grid (metrics just fall back to "—").
  const [jobs, setJobs] = useState<JobResponse[]>([])
  const [jobsLoading, setJobsLoading] = useState(true)
  const [jobsError, setJobsError] = useState(false)

  const [filter, setFilter] = useState<Filter>('IN_USE')
  const [busyStateId, setBusyStateId] = useState<string | null>(null)

  const [formModal, setFormModal] = useState<{ mode: 'create' } | { mode: 'edit'; reel: ReelResponse } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ReelResponse | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setLoading(true)
    setFetchError(null)
    listReels({ page: 0, size: FETCH_SIZE })
      .then((data) => setReels(data.content))
      .catch(() => setFetchError('Failed to load reels.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    setJobsLoading(true)
    setJobsError(false)
    fetchAllJobs()
      .then(setJobs)
      .catch(() => setJobsError(true))
      .finally(() => setJobsLoading(false))
  }, [])

  const counts = {
    ALL: reels.length,
    NEW: reels.filter((r) => r.state === 'NEW').length,
    IN_USE: reels.filter((r) => r.state === 'IN_USE').length,
    USED_UP: reels.filter((r) => r.state === 'USED_UP').length,
  }

  const totalInvested = reels.reduce((sum, r) => sum + r.cost, 0)

  // Per-Reel usage derived from Jobs. Available only once Jobs load cleanly.
  const metricsReady = !jobsLoading && !jobsError
  const usageByReel = useMemo(() => {
    const map = new Map<string, ReelUsage>()
    for (const reel of reels) map.set(reel.id, aggregateReelUsage(reel, jobs))
    return map
  }, [reels, jobs])
  const totals = useMemo(() => sumReelUsage(usageByReel.values()), [usageByReel])
  const netReturnTotal = totals.earned - totalInvested
  // Distinct rackets strung from inventory. A Hybrid Job can draw from two
  // Reels — it counts once here, not once per Reel (which `totals.jobCount` does).
  const stringingsDone = useMemo(() => {
    const reelIds = new Set(reels.map((r) => r.id))
    let n = 0
    for (const job of jobs) {
      if (!isConsuming(job)) continue
      if (jobSides(job).some((s) => s.type === 'REEL' && s.reelId !== undefined && reelIds.has(s.reelId))) n += 1
    }
    return n
  }, [reels, jobs])

  const visibleReels = filter === 'ALL' ? reels : reels.filter((r) => r.state === filter)

  async function handleChangeState(reel: ReelResponse, next: ReelState) {
    if (reel.state === next) return
    setBusyStateId(reel.id)
    // Optimistic update; revert on failure.
    setReels((rs) => rs.map((r) => (r.id === reel.id ? { ...r, state: next } : r)))
    try {
      const updated = await changeReelState(reel.id, next)
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
      await deleteReel(deleteTarget.id)
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
        <div className="summary-cards">
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
            <div className="summary-card-value">{metricsReady ? fmtEur(totals.earned) : DASH}</div>
            <div className="summary-card-sub">
              {jobsError
                ? 'Could not load jobs'
                : metricsReady
                  ? `from ${stringingsDone} stringing${stringingsDone !== 1 ? 's' : ''}`
                  : 'Tracked once jobs are recorded'}
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-card-label">Net return</div>
            <div className="summary-card-value">{metricsReady ? fmtEur(netReturnTotal) : DASH}</div>
            <div className="summary-card-sub">
              {jobsError
                ? 'Could not load jobs'
                : metricsReady
                  ? 'fees earned − total invested'
                  : 'Tracked once jobs are recorded'}
            </div>
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
                usage={metricsReady ? usageByReel.get(reel.id) : undefined}
                busy={busyStateId === reel.id}
                onOpen={() => navigate(`/strings/${reel.id}`)}
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
  /** Job-derived usage; undefined while jobs are loading or failed to load. */
  usage: ReelUsage | undefined
  busy: boolean
  onOpen: () => void
  onChangeState: (reel: ReelResponse, next: ReelState) => void
  onEdit: () => void
  onDelete: () => void
}

function ReelCard({ reel, usage, busy, onOpen, onChangeState, onEdit, onDelete }: ReelCardProps) {
  const meta = STATE_META[reel.state]
  // Knowable without jobs: yield the reel can theoretically deliver.
  const predictedJobs = reel.metersPerJob > 0 ? Math.floor(reel.reelLengthMeters / reel.metersPerJob) : 0
  const potentialIncome = predictedJobs * reel.stringFee

  // Job-derived metrics. Same unit as "predicted yield": whole-stringing equivalents.
  const hasUsage = usage !== undefined
  const metersConsumed = usage?.metersConsumed ?? 0
  const earned = usage?.earned ?? 0
  const usedStringings = reel.metersPerJob > 0 ? metersConsumed / reel.metersPerJob : 0
  const usagePct = reel.reelLengthMeters > 0 ? (metersConsumed / reel.reelLengthMeters) * 100 : 0
  const fillPct = Math.min(usagePct, 100)
  const over = usagePct > 100
  const meterKnown = hasUsage && reel.reelLengthMeters > 0
  const netReturn = earned - reel.cost

  return (
    <div
      className={`roll-card clickable${reel.state === 'USED_UP' ? ' inactive' : ''}`}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
    >
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
                onClick={(e) => {
                  e.stopPropagation()
                  onChangeState(reel, s)
                }}
              >
                {STATE_META[s].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="roll-meter">
        <div className="roll-meter-bar-wrap">
          <div
            className={`roll-meter-fill${!meterKnown || metersConsumed === 0 ? ' empty' : ''}${over ? ' over' : ''}`}
            style={{ width: meterKnown ? `${fillPct}%` : '0%' }}
          />
        </div>
        <div className="roll-meter-labels">
          <span>
            {meterKnown ? (
              <>
                {fmtMeters(metersConsumed)} / {reel.reelLengthMeters} m
                {over && <span className="roll-meter-over"> · over</span>}
              </>
            ) : (
              <>Usage {DASH}</>
            )}
          </span>
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
            <div className="eff-col-jobs muted">{hasUsage ? usedStringings.toFixed(1) : DASH} jobs</div>
            <div className="eff-col-income">{hasUsage ? `${fmtEur(earned)} earned` : `${DASH} earned`}</div>
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
          <span className="roll-fin-val muted">{hasUsage ? fmtEur(earned) : DASH}</span>
        </div>
        <div className="roll-fin-divider" />
        <div className={`roll-fin-net${hasUsage ? ' has-data' : ''}`}>
          <span>Net return</span>
          <div style={{ textAlign: 'right' }}>
            <span className={`roll-fin-net-num${hasUsage ? (netReturn >= 0 ? ' pos' : ' neg') : ''}`}>
              {hasUsage ? fmtEur(netReturn) : DASH}
            </span>
            <div className="roll-fin-net-sub">
              {hasUsage
                ? `${usage.jobCount} job${usage.jobCount !== 1 ? 's' : ''} · ${fmtEur(earned)} earned`
                : 'Tracked once jobs are recorded'}
            </div>
          </div>
        </div>
      </div>

      <div className="roll-footer">
        <span className="roll-purchase-date">Purchased {fmtDate(reel.purchaseDate)}</span>
        <div className="roll-footer-actions">
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
          >
            Edit
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
