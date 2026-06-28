import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronRight, Check, ArrowRight, Scissors, Calendar, Receipt } from 'lucide-react'
import { useKeycloakToken } from '../../lib/KeycloakContext'
import { useToast } from '../../components/Toast'
import {
  getJob,
  getCustomer,
  getRacket,
  getReel,
  changeJobStage,
  changeReelState,
  deleteJob,
  nextStage,
  JOB_STAGES,
  JOB_STAGE_LABELS,
  JOB_STAGE_BADGE_CLASS,
  type JobResponse,
  type CustomerResponse,
  type RacketResponse,
  type ReelResponse,
  type StringSideResponse,
} from '../../lib/api'

const money = (n: number) => `€ ${n.toFixed(2)}`

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * The Reel-backed String Sides of a Job, with the side they sit on. A Mono Job
 * is mains-only (matching ADR 0006); a Hybrid Job adds the crosses side.
 */
function reelSideRefs(job: JobResponse): { reelId: string; label: string }[] {
  const refs: { reelId: string; label: string }[] = []
  if (job.mains.type === 'REEL' && job.mains.reelId) {
    refs.push({ reelId: job.mains.reelId, label: 'mains' })
  }
  if (job.hybrid && job.crosses?.type === 'REEL' && job.crosses.reelId) {
    refs.push({ reelId: job.crosses.reelId, label: 'crosses' })
  }
  return refs
}

/** Distinct Reel ids a Job draws from (deduped across sides). */
function referencedReelIds(job: JobResponse): string[] {
  return [...new Set(reelSideRefs(job).map((r) => r.reelId))]
}

/**
 * The Reels a Job draws from that are still `NEW` — the ones that must be
 * committed to `IN_USE` before the Job can start. See ADR 0008. Deduped by
 * Reel, collecting the side label(s) each Reel sits on. A Reel that failed to
 * load (absent from the map) is skipped — its state is unknown.
 */
function newReelCommitments(
  job: JobResponse,
  reels: Map<string, ReelResponse>,
): { reel: ReelResponse; labels: string[] }[] {
  const byId = new Map<string, string[]>()
  for (const ref of reelSideRefs(job)) {
    byId.set(ref.reelId, [...(byId.get(ref.reelId) ?? []), ref.label])
  }
  const result: { reel: ReelResponse; labels: string[] }[] = []
  for (const [reelId, labels] of byId) {
    const reel = reels.get(reelId)
    if (reel && reel.state === 'NEW') result.push({ reel, labels })
  }
  return result
}

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const token = useKeycloakToken()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [job, setJob] = useState<JobResponse | null>(null)
  const [customer, setCustomer] = useState<CustomerResponse | null>(null)
  const [racket, setRacket] = useState<RacketResponse | null>(null)
  const [reelNames, setReelNames] = useState<Map<string, string>>(new Map())
  const [reels, setReels] = useState<Map<string, ReelResponse>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [advancing, setAdvancing] = useState(false)
  const [showCommit, setShowCommit] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const j = await getJob(token, id)
      setJob(j)
      const [cust, rack] = await Promise.all([
        getCustomer(token, j.customerId).catch(() => null),
        getRacket(token, j.racketId).catch(() => null),
      ])
      setCustomer(cust)
      setRacket(rack)
      const reelIds = referencedReelIds(j)
      const entries = await Promise.all(
        reelIds.map((rid) =>
          getReel(token, rid)
            .then((r) => [rid, r] as const)
            .catch(() => [rid, null] as const),
        ),
      )
      const reelMap = new Map<string, ReelResponse>()
      const nameMap = new Map<string, string>()
      for (const [rid, r] of entries) {
        if (r) {
          reelMap.set(rid, r)
          nameMap.set(rid, `${r.brand} ${r.model} · ${r.gauge} mm`)
        } else {
          nameMap.set(rid, 'Reel')
        }
      }
      setReels(reelMap)
      setReelNames(nameMap)
    } catch {
      setError('Job not found.')
    } finally {
      setLoading(false)
    }
  }, [token, id])

  useEffect(() => {
    load()
  }, [load])

  async function advanceOnly(next: JobResponse['stage']) {
    if (!id) return
    setAdvancing(true)
    try {
      const updated = await changeJobStage(token, id, next)
      setJob(updated)
      showToast(`Advanced to ${JOB_STAGE_LABELS[next]}`)
    } catch {
      showToast('Failed to advance the job.', 'error')
    } finally {
      setAdvancing(false)
    }
  }

  async function handleAdvance() {
    if (!job || !id) return
    const next = nextStage(job.stage)
    if (!next) return
    // Starting a Job (entering In Progress) commits its New Reels to In Use —
    // gate the advance behind a confirmation. See ADR 0008. Any other
    // transition advances directly.
    if (next === 'IN_PROGRESS' && newReelCommitments(job, reels).length > 0) {
      setShowCommit(true)
      return
    }
    await advanceOnly(next)
  }

  /** Refresh the cached state of the given Reels from the server (no spinner). */
  async function syncReels(reelIds: string[]) {
    const entries = await Promise.all(
      reelIds.map((rid) =>
        getReel(token, rid)
          .then((r) => [rid, r] as const)
          .catch(() => null),
      ),
    )
    setReels((prev) => {
      const next = new Map(prev)
      for (const e of entries) if (e) next.set(e[0], e[1])
      return next
    })
  }

  /**
   * Commit the Job's New Reels and start it, as one all-or-nothing act:
   * flip every New Reel to In Use, then advance the stage. Any failure reverts
   * the Reels already flipped, so nothing changes. See ADR 0008.
   */
  async function handleConfirmCommit() {
    if (!job || !id) return
    const commitments = newReelCommitments(job, reels)
    const reelIds = referencedReelIds(job)
    setCommitting(true)
    const flipped: ReelResponse[] = []
    try {
      for (const { reel } of commitments) {
        await changeReelState(token, reel.id, 'IN_USE')
        flipped.push(reel)
      }
      const updated = await changeJobStage(token, id, 'IN_PROGRESS')
      setJob(updated)
      setShowCommit(false)
      const n = flipped.length
      showToast(`Started · ${n} reel${n > 1 ? 's' : ''} marked In Use`)
    } catch {
      // Compensate: roll back every Reel we flipped so nothing changed.
      const revertFailed: ReelResponse[] = []
      for (const reel of flipped) {
        try {
          await changeReelState(token, reel.id, 'NEW')
        } catch {
          revertFailed.push(reel)
        }
      }
      setShowCommit(false)
      if (revertFailed.length > 0) {
        showToast(
          `Couldn't start the job, and ${revertFailed.length} reel${revertFailed.length > 1 ? 's are' : ' is'} still In Use — check the Strings page.`,
          'error',
        )
      } else {
        showToast("Couldn't start the job — no reels were changed. Please try again.", 'error')
      }
    } finally {
      setCommitting(false)
      // Re-sync Reel state regardless of outcome so the cache matches reality.
      await syncReels(reelIds)
    }
  }

  async function handleDelete() {
    if (!id) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteJob(token, id)
      showToast('Job deleted')
      navigate('/')
    } catch {
      setDeleting(false)
      setDeleteError('Failed to delete the job. Please try again.')
    }
  }

  function sideText(side?: StringSideResponse): string {
    if (!side) return '—'
    if (side.type === 'OWN') return side.stringName || 'Own string'
    return (side.reelId && reelNames.get(side.reelId)) || 'Reel'
  }

  function sideSource(side?: StringSideResponse): string {
    if (!side) return ''
    return side.type === 'OWN' ? "Customer's own" : 'From reel'
  }

  if (loading) {
    return (
      <div style={{ padding: 'var(--sp-8)', color: 'var(--fg-muted)', fontFamily: 'var(--font-body)' }}>
        Loading…
      </div>
    )
  }

  if (error || !job) {
    return (
      <div style={{ padding: 'var(--sp-8)', color: 'var(--status-overdue-fg)', fontFamily: 'var(--font-body)' }}>
        {error ?? 'Job not found.'}
      </div>
    )
  }

  const customerName = customer ? `${customer.firstName} ${customer.lastName}` : '…'
  const racketName = racket ? `${racket.brand} ${racket.model}` : '…'
  const currentIndex = JOB_STAGES.indexOf(job.stage)
  const next = nextStage(job.stage)
  const commitReels = newReelCommitments(job, reels)

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <div className="breadcrumb">
            <Link to="/">Dashboard</Link>
            <ChevronRight size={12} />
            <span>{customerName}</span>
          </div>
          <h1 className="page-title">{customerName}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginTop: 'var(--sp-2)' }}>
            <span style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>{racketName}</span>
            <span className={`badge ${JOB_STAGE_BADGE_CLASS[job.stage]}`}>{JOB_STAGE_LABELS[job.stage]}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
          {next && (
            <button className="btn btn-primary" onClick={handleAdvance} disabled={advancing || committing}>
              {advancing ? 'Advancing…' : `Advance to ${JOB_STAGE_LABELS[next]}`}
              {!advancing && <ArrowRight size={16} />}
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => navigate(`/jobs/${id}/edit`)}>
            Edit
          </button>
          <button className="btn btn-danger" onClick={() => setShowDelete(true)}>
            Delete
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* Stage bar */}
        <div className="card" style={{ marginBottom: 'var(--sp-6)', padding: 'var(--sp-6) var(--sp-8)' }}>
          <div
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 500,
              color: 'var(--fg-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontFamily: 'var(--font-mono)',
              marginBottom: 'var(--sp-5)',
            }}
          >
            Job Progress
          </div>
          <div className="stage-bar">
            {JOB_STAGES.map((stage, i) => {
              const cls = i < currentIndex ? 'done' : i === currentIndex ? 'active' : ''
              return (
                <div key={stage} className={`stage-step ${cls}`}>
                  <div className="stage-dot">{i < currentIndex && <Check size={13} strokeWidth={2.5} />}</div>
                  <div className="stage-label">{JOB_STAGE_LABELS[stage]}</div>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 'var(--sp-6)', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
            {/* Stringing */}
            <div className="detail-section">
              <div className="detail-section-header">
                <Scissors size={14} />
                <span className="detail-section-title">Stringing — {job.hybrid ? 'Hybrid' : 'Mono'}</span>
              </div>
              <div className="detail-section-body">
                {job.hybrid ? (
                  <>
                    <div className="detail-row">
                      <span className="detail-key">Mains string</span>
                      <span className="detail-val">{sideText(job.mains)} <span style={{ color: 'var(--fg-muted)' }}>· {sideSource(job.mains)}</span></span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-key">Crosses string</span>
                      <span className="detail-val">{sideText(job.crosses)} <span style={{ color: 'var(--fg-muted)' }}>· {sideSource(job.crosses)}</span></span>
                    </div>
                  </>
                ) : (
                  <div className="detail-row">
                    <span className="detail-key">String</span>
                    <span className="detail-val">{sideText(job.mains)} <span style={{ color: 'var(--fg-muted)' }}>· {sideSource(job.mains)}</span></span>
                  </div>
                )}
                <div className="detail-row">
                  <span className="detail-key">Mains tension</span>
                  <span className="detail-val mono">{job.mainsTension} kg</span>
                </div>
                <div className="detail-row">
                  <span className="detail-key">Crosses tension</span>
                  <span className="detail-val mono">{job.crossesTension} kg</span>
                </div>
              </div>
            </div>

            {/* Job details */}
            <div className="detail-section">
              <div className="detail-section-header">
                <Calendar size={14} />
                <span className="detail-section-title">Job Details</span>
              </div>
              <div className="detail-section-body">
                <div className="detail-row">
                  <span className="detail-key">Customer</span>
                  <span className="detail-val">
                    <Link to={`/customers/${job.customerId}`} style={{ color: 'var(--accent)' }}>
                      {customerName}
                    </Link>
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-key">Racket</span>
                  <span className="detail-val">{racketName}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-key">Due date</span>
                  <span className="detail-val mono">{formatDate(job.dueDate)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-key">Created</span>
                  <span className="detail-val mono">{formatDate(job.createdAt)}</span>
                </div>
                {job.notes && (
                  <div className="detail-row">
                    <span className="detail-key">Notes</span>
                    <span className="detail-val" style={{ maxWidth: '60%' }}>{job.notes}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Price */}
          <div className="detail-section">
            <div className="detail-section-header">
              <Receipt size={14} />
              <span className="detail-section-title">Price</span>
            </div>
            <div className="detail-section-body">
              <div className="price-summary">
                <div className="price-row">
                  <span className="price-key">Service fee</span>
                  <span className="price-val">{money(job.serviceFee)}</span>
                </div>
                <div className="price-row">
                  <span className="price-key">String fee</span>
                  <span className="price-val">{money(job.totalStringFee)}</span>
                </div>
                <div className="price-total">
                  <span className="price-key">Total</span>
                  <span className="price-val">{money(job.total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showCommit && (
        <div className="modal-overlay open">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Mark {commitReels.length > 1 ? 'reels' : 'reel'} as In Use?</span>
            </div>
            <div style={{ padding: 'var(--sp-2) 0 var(--sp-4)', fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
              Starting this job draws from {commitReels.length > 1 ? 'these new reels' : 'this new reel'}:
              <ul
                style={{
                  margin: 'var(--sp-3) 0 0',
                  paddingInlineStart: 'var(--sp-5)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--sp-1)',
                }}
              >
                {commitReels.map(({ reel, labels }) => (
                  <li key={reel.id}>
                    <strong>{reel.brand} {reel.model}</strong>
                    <span style={{ color: 'var(--fg-muted)' }}> · {reel.gauge} mm · {labels.join(' & ')}</span>
                  </li>
                ))}
              </ul>
              <p style={{ margin: 'var(--sp-4) 0 0', color: 'var(--fg-muted)' }}>
                {commitReels.length > 1 ? "They'll" : "It'll"} move from New to In Use, and the job will advance to In
                Progress.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowCommit(false)} disabled={committing}>
                Not now
              </button>
              <button className="btn btn-primary" onClick={handleConfirmCommit} disabled={committing}>
                {committing ? 'Starting…' : 'Mark In Use & start'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDelete && (
        <div className="modal-overlay open">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Delete Job</span>
            </div>
            <div style={{ padding: 'var(--sp-2) 0 var(--sp-4)', fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
              Are you sure you want to delete this job for <strong>{customerName}</strong>? This cannot be undone.
            </div>
            {deleteError && (
              <p style={{ color: 'var(--status-overdue-fg)', fontSize: 'var(--text-sm)', margin: '0 0 var(--sp-3)' }}>
                {deleteError}
              </p>
            )}
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowDelete(false)} disabled={deleting}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete Job'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
