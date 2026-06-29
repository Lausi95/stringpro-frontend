import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useKeycloakToken } from '../../lib/KeycloakContext'
import {
  getReel,
  deleteReel,
  changeReelState,
  fetchAllJobs,
  getCustomer,
  getRacket,
  aggregateReelUsage,
  reelSideUsage,
  isConsuming,
  JOB_STAGE_LABELS,
  JOB_STAGE_BADGE_CLASS,
  type ReelResponse,
  type ReelState,
  type ReelMaterial,
  type JobResponse,
} from '../../lib/api'
import ReelFormModal from '../../components/ReelFormModal'
import Modal from '../../components/Modal'
import './StringsPage.css'

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

function fmtEur(n: number): string {
  return '€ ' + n.toFixed(2)
}

function fmtMeters(n: number): string {
  return (Math.round(n * 10) / 10).toString()
}

function fmtDate(iso: string): string {
  if (!iso) return DASH
  // Job createdAt is a date-time; reel purchaseDate is a bare date.
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Which side(s) of a Job drew from this Reel, in domain terms. */
function sideLabel(job: JobResponse, reel: ReelResponse): string {
  if (!job.hybrid) return 'Mono'
  const u = reelSideUsage(job, reel)
  if (!u) return DASH
  if (u.mains && u.crosses) return 'Both'
  return u.mains ? 'Mains' : 'Crosses'
}

export default function ReelDetailPage() {
  const { id } = useParams<{ id: string }>()
  const token = useKeycloakToken()
  const navigate = useNavigate()

  const [reel, setReel] = useState<ReelResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [jobs, setJobs] = useState<JobResponse[]>([])
  const [jobsLoading, setJobsLoading] = useState(true)
  const [jobsError, setJobsError] = useState<string | null>(null)
  const [customers, setCustomers] = useState<Map<string, string>>(new Map())
  const [rackets, setRackets] = useState<Map<string, string>>(new Map())

  const [busyState, setBusyState] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    getReel(token, id)
      .then(setReel)
      .catch(() => setError('Reel not found.'))
      .finally(() => setLoading(false))
  }, [token, id])

  const loadJobs = useCallback(() => {
    if (!id) return
    setJobsLoading(true)
    setJobsError(null)
    fetchAllJobs(token, { reelId: id })
      .then(async (js) => {
        // Newest first by intake date.
        const sorted = [...js].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        setJobs(sorted)
        const custIds = [...new Set(sorted.map((j) => j.customerId))]
        const rackIds = [...new Set(sorted.map((j) => j.racketId))]
        const [cs, rs] = await Promise.all([
          Promise.all(
            custIds.map((cid) =>
              getCustomer(token, cid)
                .then((c) => [cid, `${c.firstName} ${c.lastName}`] as const)
                .catch(() => [cid, 'Unknown'] as const),
            ),
          ),
          Promise.all(
            rackIds.map((rid) =>
              getRacket(token, rid)
                .then((r) => [rid, `${r.brand} ${r.model}`] as const)
                .catch(() => [rid, 'Unknown'] as const),
            ),
          ),
        ])
        setCustomers(new Map(cs))
        setRackets(new Map(rs))
      })
      .catch(() => setJobsError('Failed to load jobs for this reel.'))
      .finally(() => setJobsLoading(false))
  }, [token, id])

  useEffect(() => {
    loadJobs()
  }, [loadJobs])

  async function handleChangeState(next: ReelState) {
    if (!reel || reel.state === next) return
    setBusyState(true)
    const prev = reel
    setReel({ ...reel, state: next }) // optimistic
    try {
      const updated = await changeReelState(token, reel.id, next)
      setReel(updated)
    } catch {
      setReel(prev)
    } finally {
      setBusyState(false)
    }
  }

  async function handleDelete() {
    if (!id) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteReel(token, id)
      navigate('/strings')
    } catch {
      setDeleting(false)
      setDeleteError('Failed to delete reel. Please try again.')
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 'var(--sp-8)', color: 'var(--fg-muted)', fontFamily: 'var(--font-body)' }}>
        Loading…
      </div>
    )
  }

  if (error || !reel) {
    return (
      <div style={{ padding: 'var(--sp-8)', color: 'var(--status-overdue-fg)', fontFamily: 'var(--font-body)' }}>
        {error ?? 'Reel not found.'}
      </div>
    )
  }

  const title = `${reel.brand} · ${reel.model}`
  const meta = STATE_META[reel.state]

  // Derived metrics (consuming jobs only). Held back until jobs load cleanly.
  const metricsReady = !jobsLoading && !jobsError
  const usage = aggregateReelUsage(reel, jobs)
  const predictedJobs = reel.metersPerJob > 0 ? Math.floor(reel.reelLengthMeters / reel.metersPerJob) : 0
  const usedStringings = reel.metersPerJob > 0 ? usage.metersConsumed / reel.metersPerJob : 0
  const usagePct = reel.reelLengthMeters > 0 ? (usage.metersConsumed / reel.reelLengthMeters) * 100 : 0
  const fillPct = Math.min(usagePct, 100)
  const over = usagePct > 100
  const meterKnown = metricsReady && reel.reelLengthMeters > 0
  const netReturn = usage.earned - reel.cost

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="breadcrumb">
            <Link to="/strings">String Inventory</Link>
            <ChevronRight size={12} />
            <span>{title}</span>
          </div>
          <h1 className="page-title">{title}</h1>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
          <button className="btn btn-ghost" onClick={() => setShowEdit(true)}>
            Edit
          </button>
          <button className="btn btn-danger" onClick={() => setShowDelete(true)}>
            Delete
          </button>
        </div>
      </div>

      <div className="page-body">
        <div className="summary-cards" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="summary-card">
            <div className="summary-card-label">Predicted yield</div>
            <div className="summary-card-value">{fmtEur(predictedJobs * reel.stringFee)}</div>
            <div className="summary-card-sub">{predictedJobs} jobs potential</div>
          </div>
          <div className="summary-card">
            <div className="summary-card-label">Used so far</div>
            <div className="summary-card-value">{metricsReady ? `${fmtMeters(usage.metersConsumed)} m` : DASH}</div>
            <div className="summary-card-sub">
              {metricsReady
                ? `${usedStringings.toFixed(1)} jobs · ${usage.jobCount} stringing${usage.jobCount !== 1 ? 's' : ''}`
                : 'of predicted yield'}
            </div>
          </div>
          <div className="summary-card">
            <div className="summary-card-label">Fees earned</div>
            <div className="summary-card-value">{metricsReady ? fmtEur(usage.earned) : DASH}</div>
            <div className="summary-card-sub">String fees billed</div>
          </div>
          <div className="summary-card">
            <div className="summary-card-label">Net return</div>
            <div
              className="summary-card-value"
              style={{ color: metricsReady ? (netReturn >= 0 ? 'var(--court-700)' : 'var(--status-overdue-fg)') : undefined }}
            >
              {metricsReady ? fmtEur(netReturn) : DASH}
            </div>
            <div className="summary-card-sub">vs {fmtEur(reel.cost)} cost</div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 'var(--sp-6)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
            <div className="roll-pills">
              <span className="roll-pill">{MATERIAL_LABEL[reel.material]}</span>
              <span className="roll-pill">{reel.gauge} mm</span>
              <span className="roll-pill">{reel.reelLengthMeters} m reel</span>
              <span className="roll-pill price">{fmtEur(reel.stringFee)}/job</span>
              <span className="roll-pill">Purchased {fmtDate(reel.purchaseDate)}</span>
            </div>
            <div className="roll-header-right">
              <span className={`reel-state-badge ${meta.cls}`}>{meta.label}</span>
              <div className="reel-state-segment" role="group" aria-label="Reel state">
                {STATE_ORDER.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={reel.state === s ? 'active' : ''}
                    disabled={busyState}
                    onClick={() => handleChangeState(s)}
                  >
                    {STATE_META[s].label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="roll-meter" style={{ padding: 0, border: 'none' }}>
            <div className="roll-meter-bar-wrap">
              <div
                className={`roll-meter-fill${!meterKnown || usage.metersConsumed === 0 ? ' empty' : ''}${over ? ' over' : ''}`}
                style={{ width: meterKnown ? `${fillPct}%` : '0%' }}
              />
            </div>
            <div className="roll-meter-labels">
              <span>
                {meterKnown ? (
                  <>
                    {fmtMeters(usage.metersConsumed)} / {reel.reelLengthMeters} m consumed
                    {over && <span className="roll-meter-over"> · over capacity</span>}
                  </>
                ) : (
                  <>Usage {DASH}</>
                )}
              </span>
              <span className="roll-meter-remaining">~{predictedJobs} jobs predicted</span>
            </div>
          </div>
        </div>

        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--sp-5)' }}>
          Jobs using this reel
        </h2>

        {jobsError ? (
          <div className="card" style={{ color: 'var(--status-overdue-fg)', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-3)' }}>
            {jobsError}
            <button className="btn btn-sm btn-ghost" onClick={loadJobs}>Try again</button>
          </div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer · Racket</th>
                  <th>Side</th>
                  <th>Tension</th>
                  <th>Intake</th>
                  <th>Stage</th>
                  <th className="num-col">Earned</th>
                </tr>
              </thead>
              <tbody>
                {jobsLoading ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--sp-12)', color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>
                      Loading…
                    </td>
                  </tr>
                ) : jobs.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--sp-12)', color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>
                      No jobs have used this reel yet.
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => {
                    const consuming = isConsuming(job)
                    const earned = reelSideUsage(job, reel)?.earned ?? 0
                    return (
                      <tr
                        key={job.id}
                        style={{ cursor: 'pointer', opacity: consuming ? 1 : 0.55 }}
                        onClick={() => navigate(`/jobs/${job.id}`)}
                      >
                        <td>
                          <div className="cell-primary">{customers.get(job.customerId) ?? '…'}</div>
                          <div className="cell-secondary">{rackets.get(job.racketId) ?? '…'}</div>
                        </td>
                        <td><span className="cell-mono">{sideLabel(job, reel)}</span></td>
                        <td>
                          <span className="cell-mono">{job.mainsTension} / {job.crossesTension} kg</span>
                        </td>
                        <td><span className="cell-mono">{fmtDate(job.createdAt)}</span></td>
                        <td>
                          <span className={`badge ${JOB_STAGE_BADGE_CLASS[job.stage]}`}>
                            {JOB_STAGE_LABELS[job.stage]}
                          </span>
                        </td>
                        <td className="num-col" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontVariantNumeric: 'tabular-nums', color: consuming ? undefined : 'var(--fg-muted)' }}>
                          {fmtEur(earned)}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {!jobsLoading && !jobsError && jobs.length > 0 && (
          <div style={{ marginTop: 'var(--sp-4)', fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>
            {usage.jobCount} consuming · {jobs.length} total referencing this reel
          </div>
        )}
      </div>

      {showEdit && (
        <ReelFormModal
          mode="edit"
          initial={reel}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => {
            setReel(updated)
            setShowEdit(false)
          }}
        />
      )}

      {showDelete && (
        <Modal title="Delete Reel" onClose={() => (deleting ? undefined : setShowDelete(false))}>
          <div style={{ padding: 'var(--sp-2) 0 var(--sp-4)', fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
            Delete <strong>{title}</strong>? This cannot be undone.
          </div>
          {deleteError && (
            <p style={{ color: 'var(--status-overdue-fg)', fontSize: 'var(--text-sm)', margin: '0 0 var(--sp-3)' }}>
              {deleteError}
            </p>
          )}
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={() => setShowDelete(false)} disabled={deleting}>
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
