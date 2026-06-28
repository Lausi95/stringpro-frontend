import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useKeycloakToken } from '../../lib/KeycloakContext'
import RecordPaymentModal from '../../components/RecordPaymentModal'
import {
  fetchAllJobs,
  getCustomer,
  getRacket,
  JOB_STAGE_LABELS,
  JOB_STAGE_BADGE_CLASS,
  type JobResponse,
} from '../../lib/api'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const money = (n: number) => `€ ${n.toFixed(2)}`

const balanceOf = (j: JobResponse) => Math.max(0, j.total - j.amountPaid)

export default function PaymentsPage() {
  const token = useKeycloakToken()
  const navigate = useNavigate()

  const [jobs, setJobs] = useState<JobResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payingJob, setPayingJob] = useState<JobResponse | null>(null)

  // Name caches (refs so they persist without re-fetching); tick to force re-render.
  const customers = useRef<Map<string, string>>(new Map())
  const rackets = useRef<Map<string, string>>(new Map())
  const [, setResolveTick] = useState(0)

  const loadJobs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const all = await fetchAllJobs(token, { fullyPaid: false })
      // Soonest / most overdue first.
      all.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      setJobs(all)

      // Resolve missing customer / racket names.
      const custIds = [...new Set(all.map((j) => j.customerId))].filter((id) => !customers.current.has(id))
      const rackIds = [...new Set(all.map((j) => j.racketId))].filter((id) => !rackets.current.has(id))
      const [custs, racks] = await Promise.all([
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
      custs.forEach(([k, v]) => customers.current.set(k, v))
      racks.forEach(([k, v]) => rackets.current.set(k, v))
      setResolveTick((t) => t + 1)
    } catch {
      setError('Failed to load payments.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadJobs()
  }, [loadJobs])

  const outstanding = jobs.reduce((sum, j) => sum + balanceOf(j), 0)
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  function handleSaved() {
    setPayingJob(null)
    loadJobs()
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <span className="page-eyebrow">{today}</span>
          <h1 className="page-title">Payments</h1>
        </div>
      </div>

      <div className="page-body">
        <div className="summary-cards" style={{ gridTemplateColumns: 'minmax(220px, 320px)' }}>
          <div className="summary-card warn">
            <div className="summary-card-label">Outstanding</div>
            <div className="summary-card-value warn" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {money(outstanding)}
            </div>
            <div className="summary-card-sub">
              {jobs.length} unpaid job{jobs.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>

        {error && (
          <div
            className="card"
            style={{
              color: 'var(--status-overdue-fg)',
              fontSize: 'var(--text-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--sp-3)',
            }}
          >
            {error}
            <button className="btn btn-sm btn-ghost" onClick={loadJobs}>
              Try again
            </button>
          </div>
        )}

        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer · Racket</th>
                <th>Stage</th>
                <th>Due</th>
                <th className="num-col">Balance</th>
                <th className="actions-col"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 'var(--sp-12)', color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>
                    Loading…
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 'var(--sp-12)', color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>
                    All caught up — every Job is fully paid.
                  </td>
                </tr>
              ) : (
                jobs.map((job) => {
                  const balance = balanceOf(job)
                  return (
                    <tr key={job.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/jobs/${job.id}`)}>
                      <td>
                        <div className="cell-primary">{customers.current.get(job.customerId) ?? '…'}</div>
                        <div className="cell-secondary">{rackets.current.get(job.racketId) ?? '…'}</div>
                      </td>
                      <td>
                        <span className={`badge ${JOB_STAGE_BADGE_CLASS[job.stage]}`}>
                          {JOB_STAGE_LABELS[job.stage]}
                        </span>
                      </td>
                      <td>
                        <span className="cell-mono">{formatDate(job.dueDate)}</span>
                      </td>
                      <td
                        className="num-col"
                        style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontVariantNumeric: 'tabular-nums' }}
                      >
                        {money(balance)}
                        {job.amountPaid > 0 && (
                          <div style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-xs)', marginTop: 'var(--sp-1)' }}>
                            paid {money(job.amountPaid)} of {money(job.total)}
                          </div>
                        )}
                      </td>
                      <td className="actions-col" onClick={(e) => e.stopPropagation()}>
                        <button className="btn btn-sm btn-secondary" onClick={() => setPayingJob(job)}>
                          Record Payment
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && !error && jobs.length > 0 && (
          <div style={{ marginTop: 'var(--sp-4)', fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>
            {jobs.length} unpaid job{jobs.length === 1 ? '' : 's'} · {money(outstanding)} outstanding
          </div>
        )}
      </div>

      {payingJob && (
        <RecordPaymentModal
          job={payingJob}
          customerName={customers.current.get(payingJob.customerId)}
          onClose={() => setPayingJob(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  )
}
