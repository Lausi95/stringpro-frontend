import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import {
  listJobs,
  listReels,
  getCustomer,
  getRacket,
  JOB_STAGES,
  JOB_STAGE_LABELS,
  JOB_STAGE_BADGE_CLASS,
  type JobResponse,
  type JobStage,
  type StringSideResponse,
} from '../lib/api'
import JobFormModal from '../components/JobFormModal'

const PAGE_SIZE = 20

/** Stages shown as summary cards (Returned is terminal, excluded). */
const CARD_STAGES: JobStage[] = ['ANNOUNCED', 'PICKED_UP', 'IN_PROGRESS', 'DONE']

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const money = (n: number) => `€ ${n.toFixed(2)}`

export default function HomePage() {
  const navigate = useNavigate()

  const [jobs, setJobs] = useState<JobResponse[]>([])
  const [page, setPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [totalElements, setTotalElements] = useState(0)
  const [stageFilter, setStageFilter] = useState<JobStage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [counts, setCounts] = useState<Record<string, number>>({})
  const [showCreate, setShowCreate] = useState(false)

  // Name caches (refs so they persist across pages without re-fetching).
  const customers = useRef<Map<string, string>>(new Map())
  const rackets = useRef<Map<string, string>>(new Map())
  const reels = useRef<Map<string, string>>(new Map())
  const [, setResolveTick] = useState(0)

  // Stage counts feed both the summary cards and the filter-tab badges.
  const loadCounts = useCallback(() => {
    Promise.all(
      CARD_STAGES.map((stage) =>
        listJobs({ stage, size: 1 }).then((p) => [stage, p.totalElements] as const).catch(() => [stage, 0] as const),
      ),
    ).then((entries) => setCounts(Object.fromEntries(entries)))
  }, [])

  // Prefetch reel labels + stage counts once.
  useEffect(() => {
    listReels({ size: 200 })
      .then((page) => {
        page.content.forEach((r) => reels.current.set(r.id, `${r.brand} ${r.model} · ${r.gauge} mm`))
        setResolveTick((t) => t + 1)
      })
      .catch(() => {})

    loadCounts()
  }, [loadCounts])

  const loadJobs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listJobs({
        page,
        size: PAGE_SIZE,
        stage: stageFilter ?? undefined,
      })
      setJobs(data.content)
      setTotalPages(data.totalPages)
      setTotalElements(data.totalElements)

      // Resolve missing customer / racket names.
      const custIds = [...new Set(data.content.map((j) => j.customerId))].filter((id) => !customers.current.has(id))
      const rackIds = [...new Set(data.content.map((j) => j.racketId))].filter((id) => !rackets.current.has(id))
      const [custs, racks] = await Promise.all([
        Promise.all(
          custIds.map((cid) =>
            getCustomer(cid)
              .then((c) => [cid, `${c.firstName} ${c.lastName}`] as const)
              .catch(() => [cid, 'Unknown'] as const),
          ),
        ),
        Promise.all(
          rackIds.map((rid) =>
            getRacket(rid)
              .then((r) => [rid, `${r.brand} ${r.model}`] as const)
              .catch(() => [rid, 'Unknown'] as const),
          ),
        ),
      ])
      custs.forEach(([k, v]) => customers.current.set(k, v))
      racks.forEach(([k, v]) => rackets.current.set(k, v))
      setResolveTick((t) => t + 1)
    } catch {
      setError('Failed to load jobs.')
    } finally {
      setLoading(false)
    }
  }, [page, stageFilter])

  useEffect(() => {
    loadJobs()
  }, [loadJobs])

  function selectStage(stage: JobStage | null) {
    setStageFilter(stage)
    setPage(0)
  }

  function sideText(side?: StringSideResponse): string {
    if (!side) return '—'
    if (side.type === 'OWN') return side.stringName || 'Own string'
    return (side.reelId && reels.current.get(side.reelId)) || 'Reel'
  }

  function stringText(job: JobResponse): string {
    return job.hybrid ? `${sideText(job.mains)} / ${sideText(job.crosses)}` : sideText(job.mains)
  }

  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <span className="page-eyebrow">{today}</span>
          <h1 className="page-title">Dashboard</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} />
          Create Job
        </button>
      </div>

      <div className="page-body">
        <div className="summary-cards">
          {CARD_STAGES.map((stage) => (
            <button
              key={stage}
              className="summary-card"
              style={{ textAlign: 'left', cursor: 'pointer' }}
              onClick={() => selectStage(stage)}
            >
              <div className="summary-card-label">{JOB_STAGE_LABELS[stage]}</div>
              <div className="summary-card-value">{counts[stage] ?? '—'}</div>
            </button>
          ))}
        </div>

        <div className="toolbar">
          <div className="filter-tabs" style={{ marginBottom: 0, borderBottom: 'none' }}>
            <button
              className={`filter-tab${stageFilter === null ? ' active' : ''}`}
              onClick={() => selectStage(null)}
            >
              All
            </button>
            {JOB_STAGES.map((stage) => (
              <button
                key={stage}
                className={`filter-tab${stageFilter === stage ? ' active' : ''}`}
                onClick={() => selectStage(stage)}
              >
                {JOB_STAGE_LABELS[stage]}
                {counts[stage] != null && stage !== 'RETURNED' && (
                  <span className="tab-count">{counts[stage]}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', marginBottom: 'var(--sp-5)' }} />

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
          <table className="data-table jobs-table">
            <thead>
              <tr>
                <th>Customer · Racket</th>
                <th>Strings · Tension</th>
                <th>Due</th>
                <th>Stage</th>
                <th className="num-col">Price</th>
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
                    {stageFilter ? 'No jobs in this stage.' : 'No jobs yet.'}{' '}
                    {!stageFilter && (
                      <button
                        className="btn btn-sm btn-primary"
                        style={{ marginLeft: 'var(--sp-3)' }}
                        onClick={() => setShowCreate(true)}
                      >
                        Create Job
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.id} className="job-row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/jobs/${job.id}`)}>
                    <td>
                      <div className="cell-primary">{customers.current.get(job.customerId) ?? '…'}</div>
                      <div className="cell-secondary">{rackets.current.get(job.racketId) ?? '…'}</div>
                    </td>
                    <td>
                      <div className="cell-mono">{stringText(job)}</div>
                      <div className="cell-mono" style={{ color: 'var(--fg-muted)' }}>
                        {job.mainsTension} / {job.crossesTension} kg
                      </div>
                    </td>
                    <td>
                      <span className="cell-mono">{formatDate(job.dueDate)}</span>
                    </td>
                    <td>
                      <span className={`badge ${JOB_STAGE_BADGE_CLASS[job.stage]}`}>
                        {JOB_STAGE_LABELS[job.stage]}
                      </span>
                    </td>
                    <td className="num-col" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontVariantNumeric: 'tabular-nums' }}>
                      {money(job.total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginTop: 'var(--sp-5)', justifyContent: 'flex-end' }}>
            <button className="btn btn-sm btn-ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              ← Previous
            </button>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>
              {page + 1} / {totalPages}
            </span>
            <button className="btn btn-sm btn-ghost" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
              Next →
            </button>
          </div>
        )}

        {!loading && !error && (
          <div style={{ marginTop: 'var(--sp-4)', fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>
            {totalElements} job{totalElements === 1 ? '' : 's'}
          </div>
        )}
      </div>

      {showCreate && (
        <JobFormModal
          mode="create"
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false)
            loadJobs()
            loadCounts()
          }}
        />
      )}
    </>
  )
}
