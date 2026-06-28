import { useState, useEffect, type CSSProperties } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { ChevronRight, X, Users, Scissors, Calendar } from 'lucide-react'
import { useKeycloakToken } from '../../lib/KeycloakContext'
import { useToast } from '../../components/Toast'
import {
  listCustomers,
  getCustomer,
  listRackets,
  getRacket,
  listReels,
  getReel,
  getSettings,
  getJob,
  createJob,
  updateJob,
  type CustomerResponse,
  type RacketResponse,
  type ReelResponse,
  type StringSideType,
  type StringSideRequest,
  type StringSideResponse,
} from '../../lib/api'
import './JobFormPage.css'

interface SideState {
  type: StringSideType
  reelId: string
  stringName: string
  /** String fee (REEL only), held as a string so the input can be cleared. */
  fee: string
  /** True once the user manually edits the fee, so auto-fill stops overriding it. */
  feeTouched: boolean
}

const emptySide: SideState = { type: 'REEL', reelId: '', stringName: '', fee: '', feeTouched: false }

/** Round to whole cents and render as a plain string for the number input. */
function formatFee(n: number): string {
  return String(Math.round(n * 100) / 100)
}

/**
 * The fee to bill for a reel on one side. A reel's stringFee covers a whole racket,
 * so a hybrid side (mains OR crosses only) bills half.
 */
function reelFeeForSide(fullFee: number, hybrid: boolean): string {
  return formatFee(hybrid ? fullFee / 2 : fullFee)
}

const sectionLabelStyle: CSSProperties = {
  fontSize: 'var(--text-xs)',
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--fg-muted)',
  fontFamily: 'var(--font-mono)',
  marginBottom: 'var(--sp-3)',
}

function defaultDueDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 3)
  return d.toISOString().split('T')[0]
}

function reelLabel(r: ReelResponse): string {
  return `${r.brand} ${r.model} · ${r.gauge} mm`
}

function sideFromResp(s: StringSideResponse): SideState {
  return {
    type: s.type,
    reelId: s.reelId ?? '',
    stringName: s.stringName ?? '',
    fee: s.stringFee != null ? String(s.stringFee) : '',
    // Preserve the saved fee on edit — don't let mono/hybrid toggles overwrite it.
    feeTouched: true,
  }
}

const money = (n: number) => `€ ${n.toFixed(2)}`

/** Searchable customer picker (create mode only). */
function CustomerPicker({
  token,
  onSelect,
}: {
  token: string
  onSelect: (c: CustomerResponse) => void
}) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [results, setResults] = useState<CustomerResponse[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    listCustomers(token, { size: 8, name: debounced || undefined })
      .then((d) => setResults(d.content))
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, [token, debounced, open])

  return (
    <div className="customer-picker">
      <input
        className="input"
        type="text"
        placeholder="Search customer…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div className="customer-picker-results">
          {loading ? (
            <div className="customer-picker-empty">Searching…</div>
          ) : results.length === 0 ? (
            <div className="customer-picker-empty">No customers found.</div>
          ) : (
            results.map((c) => (
              <button
                key={c.id}
                type="button"
                className="customer-picker-option"
                onMouseDown={() => onSelect(c)}
              >
                {c.firstName} {c.lastName}{' '}
                <span style={{ color: 'var(--fg-muted)' }}>· {c.email}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function JobFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id
  const token = useKeycloakToken()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [searchParams] = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [customerSel, setCustomerSel] = useState<{ id: string; name: string } | null>(null)
  const [racketId, setRacketId] = useState('')
  const [racketName, setRacketName] = useState('') // edit mode display
  const [rackets, setRackets] = useState<RacketResponse[]>([])
  const [racketsLoading, setRacketsLoading] = useState(false)

  const [reels, setReels] = useState<ReelResponse[]>([])

  const [hybrid, setHybrid] = useState(false)
  const [mains, setMains] = useState<SideState>(emptySide)
  const [crosses, setCrosses] = useState<SideState>(emptySide)

  const [mainsTension, setMainsTension] = useState('')
  const [crossesTension, setCrossesTension] = useState('')
  const [crossesTouched, setCrossesTouched] = useState(false)

  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [serviceFee, setServiceFee] = useState('')

  // ── initial load ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function init() {
      setLoading(true)
      setError(null)
      try {
        const [settings, reelsPage] = await Promise.all([
          getSettings(token),
          listReels(token, { size: 200 }),
        ])
        if (cancelled) return
        const activeReels = reelsPage.content.filter((r) => r.state !== 'USED_UP')

        if (isEdit && id) {
          const job = await getJob(token, id)
          const [cust, racket] = await Promise.all([
            getCustomer(token, job.customerId),
            getRacket(token, job.racketId),
          ])
          // Make sure reels referenced by the job are selectable even if used up.
          const reelMap = new Map(activeReels.map((r) => [r.id, r]))
          const refIds = [job.mains.reelId, job.crosses?.reelId].filter(Boolean) as string[]
          const missing = refIds.filter((rid) => !reelMap.has(rid))
          const fetched = (
            await Promise.all(missing.map((rid) => getReel(token, rid).catch(() => null)))
          ).filter(Boolean) as ReelResponse[]
          if (cancelled) return
          setReels([...activeReels, ...fetched])
          setCustomerSel({ id: job.customerId, name: `${cust.firstName} ${cust.lastName}` })
          setRacketId(job.racketId)
          setRacketName(`${racket.brand} ${racket.model}`)
          setHybrid(job.hybrid)
          setMains(sideFromResp(job.mains))
          setCrosses(job.hybrid && job.crosses ? sideFromResp(job.crosses) : emptySide)
          setMainsTension(String(job.mainsTension))
          setCrossesTension(String(job.crossesTension))
          setCrossesTouched(true)
          setDueDate(job.dueDate)
          setNotes(job.notes ?? '')
          setServiceFee(String(job.serviceFee))
        } else {
          setReels(activeReels)
          setServiceFee(String(settings.serviceFee ?? 0))
          setDueDate(defaultDueDate())
          const pCustomer = searchParams.get('customerId')
          const pRacket = searchParams.get('racketId')
          if (pCustomer) {
            const cust = await getCustomer(token, pCustomer).catch(() => null)
            if (cust && !cancelled) {
              setCustomerSel({ id: cust.id, name: `${cust.firstName} ${cust.lastName}` })
              if (pRacket) setRacketId(pRacket)
            }
          }
        }
      } catch {
        if (!cancelled) setError('Failed to load the form.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    init()
    return () => {
      cancelled = true
    }
    // searchParams read once on mount; customer/racket prefill is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id, isEdit])

  // ── rackets for the chosen customer (create mode) ─────────────
  useEffect(() => {
    if (isEdit) return
    if (!customerSel) {
      setRackets([])
      return
    }
    setRacketsLoading(true)
    listRackets(token, customerSel.id)
      .then(setRackets)
      .catch(() => setRackets([]))
      .finally(() => setRacketsLoading(false))
  }, [token, customerSel, isEdit])

  function onMainsTensionChange(v: string) {
    setMainsTension(v)
    if (!crossesTouched) {
      const m = parseFloat(v)
      setCrossesTension(Number.isFinite(m) ? String(m - 1) : '')
    }
  }

  function onPickReel(setSide: React.Dispatch<React.SetStateAction<SideState>>, reelId: string) {
    const reel = reels.find((r) => r.id === reelId)
    setSide((s) => ({
      ...s,
      reelId,
      feeTouched: false,
      fee: reel ? reelFeeForSide(reel.stringFee, hybrid) : s.fee,
    }))
  }

  /** Re-derive a REEL side's auto fee when switching mono/hybrid (unless manually edited). */
  function recomputeSideFee(side: SideState, nextHybrid: boolean): SideState {
    if (side.type !== 'REEL' || side.feeTouched || !side.reelId) return side
    const reel = reels.find((r) => r.id === side.reelId)
    if (!reel) return side
    return { ...side, fee: reelFeeForSide(reel.stringFee, nextHybrid) }
  }

  function setSetup(nextHybrid: boolean) {
    setHybrid(nextHybrid)
    setMains((s) => recomputeSideFee(s, nextHybrid))
    setCrosses((s) => recomputeSideFee(s, nextHybrid))
  }

  // ── pricing ───────────────────────────────────────────────────
  const serviceFeeNum = parseFloat(serviceFee) || 0
  const sideFee = (s: SideState) => (s.type === 'OWN' ? 0 : parseFloat(s.fee) || 0)
  const stringFeeNum = hybrid ? sideFee(mains) + sideFee(crosses) : sideFee(mains)
  const totalNum = serviceFeeNum + stringFeeNum

  function buildSide(s: SideState): StringSideRequest {
    if (s.type === 'OWN') {
      return { type: 'OWN', stringName: s.stringName.trim(), stringFee: 0 }
    }
    return { type: 'REEL', reelId: s.reelId, stringFee: parseFloat(s.fee) || 0 }
  }

  function validate(): string | null {
    if (!customerSel) return 'Select a customer.'
    if (!racketId) return 'Select a racket.'
    const sideValid = (s: SideState, which: string) => {
      if (s.type === 'REEL' && !s.reelId) return `Select a reel for the ${which}.`
      if (s.type === 'OWN' && !s.stringName.trim()) return `Enter the ${which} string name.`
      return null
    }
    const mErr = sideValid(mains, hybrid ? 'mains' : 'string')
    if (mErr) return mErr
    if (hybrid) {
      const cErr = sideValid(crosses, 'crosses')
      if (cErr) return cErr
    }
    const mt = Number(mainsTension)
    const ct = Number(crossesTension)
    if (!mainsTension || mt < 5 || mt > 40) return 'Mains tension must be between 5 and 40 kg.'
    if (!crossesTension || ct < 5 || ct > 40) return 'Crosses tension must be between 5 and 40 kg.'
    if (!dueDate) return 'Pick a due date.'
    if (serviceFee === '' || serviceFeeNum < 0) return 'Enter a valid service fee.'
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const err = validate()
    if (err) {
      setFormError(err)
      return
    }
    setFormError(null)
    setSaving(true)
    const base = {
      dueDate,
      notes: notes.trim() || undefined,
      mainsTension: Number(mainsTension),
      crossesTension: Number(crossesTension),
      hybrid,
      mains: buildSide(mains),
      ...(hybrid ? { crosses: buildSide(crosses) } : {}),
      serviceFee: serviceFeeNum,
    }
    try {
      if (isEdit && id) {
        await updateJob(token, id, base)
        showToast('Job updated')
        navigate(`/jobs/${id}`)
      } else {
        await createJob(token, { customerId: customerSel!.id, racketId, ...base })
        showToast('Job created')
        navigate('/')
      }
    } catch {
      setFormError('Failed to save the job. Please try again.')
      setSaving(false)
    }
  }

  function renderSideFields(
    side: SideState,
    setSide: React.Dispatch<React.SetStateAction<SideState>>,
    idPrefix: string,
  ) {
    return (
      <>
        <div className="field" style={{ marginBottom: 'var(--sp-4)' }}>
          <label>String source</label>
          <div className="toggle-group">
            <input
              type="radio"
              id={`${idPrefix}-reel`}
              name={`${idPrefix}-src`}
              checked={side.type === 'REEL'}
              onChange={() => setSide((s) => ({ ...s, type: 'REEL' }))}
            />
            <label htmlFor={`${idPrefix}-reel`}>From reel</label>
            <input
              type="radio"
              id={`${idPrefix}-own`}
              name={`${idPrefix}-src`}
              checked={side.type === 'OWN'}
              onChange={() => setSide((s) => ({ ...s, type: 'OWN' }))}
            />
            <label htmlFor={`${idPrefix}-own`}>Customer's own</label>
          </div>
        </div>
        {side.type === 'REEL' ? (
          <div className="form-grid form-grid-2">
            <div className="field">
              <label htmlFor={`${idPrefix}-reel-select`}>Reel</label>
              <select
                id={`${idPrefix}-reel-select`}
                className="select"
                value={side.reelId}
                onChange={(e) => onPickReel(setSide, e.target.value)}
              >
                <option value="">Select reel…</option>
                {reels.map((r) => (
                  <option key={r.id} value={r.id}>
                    {reelLabel(r)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${idPrefix}-fee`}>String fee</label>
              <input
                id={`${idPrefix}-fee`}
                type="number"
                className="input input-mono"
                min={0}
                step="0.01"
                value={side.fee}
                onChange={(e) => setSide((s) => ({ ...s, fee: e.target.value, feeTouched: true }))}
              />
              {hybrid && <span className="field-hint">Half the reel's full fee (this side only).</span>}
            </div>
          </div>
        ) : (
          <div className="field">
            <label htmlFor={`${idPrefix}-name`}>String name</label>
            <input
              id={`${idPrefix}-name`}
              type="text"
              className="input"
              placeholder="e.g. Luxilon Alu Power 1.25 mm"
              value={side.stringName}
              onChange={(e) => setSide((s) => ({ ...s, stringName: e.target.value }))}
            />
          </div>
        )}
      </>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: 'var(--sp-8)', color: 'var(--fg-muted)', fontFamily: 'var(--font-body)' }}>
        Loading…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 'var(--sp-8)', color: 'var(--status-overdue-fg)', fontFamily: 'var(--font-body)' }}>
        {error}
      </div>
    )
  }

  const cancelTarget = isEdit ? `/jobs/${id}` : '/'

  return (
    <form onSubmit={handleSubmit}>
      <div className="page-header">
        <div className="page-header-left">
          <div className="breadcrumb">
            <Link to="/">Dashboard</Link>
            <ChevronRight size={12} />
            <span>{isEdit ? 'Edit Job' : 'New Job'}</span>
          </div>
          <h1 className="page-title">{isEdit ? 'Edit Job' : 'Create Job'}</h1>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(cancelTarget)} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Job'}
          </button>
        </div>
      </div>

      <div className="page-body">
        <div className="job-form-layout">
          <div>
            {/* Customer & Racket */}
            <div className="card" style={{ marginBottom: 'var(--sp-5)' }}>
              <div className="form-section-title" style={{ marginBottom: 'var(--sp-5)' }}>
                <Users size={16} />
                Customer &amp; Racket
              </div>
              <div className="form-grid" style={{ gap: 'var(--sp-4)' }}>
                <div className="field">
                  <label>Customer</label>
                  {isEdit ? (
                    <div className="locked-value">
                      <span className="locked-name">{customerSel?.name}</span>
                    </div>
                  ) : customerSel ? (
                    <div className="locked-value">
                      <span className="locked-name">{customerSel.name}</span>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => {
                          setCustomerSel(null)
                          setRacketId('')
                        }}
                        aria-label="Change customer"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <CustomerPicker
                      token={token}
                      onSelect={(c) => {
                        setCustomerSel({ id: c.id, name: `${c.firstName} ${c.lastName}` })
                        setRacketId('')
                      }}
                    />
                  )}
                </div>

                <div className="field">
                  <label htmlFor="racket-select">Racket</label>
                  {isEdit ? (
                    <div className="locked-value">
                      <span className="locked-name">{racketName}</span>
                    </div>
                  ) : !customerSel ? (
                    <select id="racket-select" className="select" disabled>
                      <option>Select a customer first…</option>
                    </select>
                  ) : racketsLoading ? (
                    <select id="racket-select" className="select" disabled>
                      <option>Loading rackets…</option>
                    </select>
                  ) : rackets.length === 0 ? (
                    <div className="field-hint">
                      No rackets yet.{' '}
                      <Link to={`/customers/${customerSel.id}`} style={{ color: 'var(--accent)' }}>
                        Add a racket
                      </Link>{' '}
                      for this customer first.
                    </div>
                  ) : (
                    <select
                      id="racket-select"
                      className="select"
                      value={racketId}
                      onChange={(e) => setRacketId(e.target.value)}
                    >
                      <option value="">Select racket…</option>
                      {rackets.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.brand} {r.model} · {r.stringMains}×{r.stringCrosses}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>

            {/* Stringing */}
            <div className="card" style={{ marginBottom: 'var(--sp-5)' }}>
              <div className="form-section-title" style={{ marginBottom: 'var(--sp-5)' }}>
                <Scissors size={16} />
                Stringing
              </div>

              <div className="field" style={{ marginBottom: 'var(--sp-5)' }}>
                <label>Setup</label>
                <div className="toggle-group">
                  <input
                    type="radio"
                    id="setup-mono"
                    name="setup"
                    checked={!hybrid}
                    onChange={() => setSetup(false)}
                  />
                  <label htmlFor="setup-mono">Mono</label>
                  <input
                    type="radio"
                    id="setup-hybrid"
                    name="setup"
                    checked={hybrid}
                    onChange={() => setSetup(true)}
                  />
                  <label htmlFor="setup-hybrid">Hybrid</label>
                </div>
                <span className="field-hint">
                  {hybrid
                    ? 'Different strings for mains and crosses.'
                    : 'One string for the whole racket.'}
                </span>
              </div>

              {!hybrid ? (
                <div style={{ marginBottom: 'var(--sp-5)' }}>
                  <div style={sectionLabelStyle}>String</div>
                  {renderSideFields(mains, setMains, 'mono')}
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 'var(--sp-5)' }}>
                    <div style={sectionLabelStyle}>Mains</div>
                    {renderSideFields(mains, setMains, 'mains')}
                  </div>
                  <div
                    style={{
                      marginBottom: 'var(--sp-5)',
                      paddingTop: 'var(--sp-5)',
                      borderTop: '1px solid var(--border)',
                    }}
                  >
                    <div style={sectionLabelStyle}>Crosses</div>
                    {renderSideFields(crosses, setCrosses, 'crosses')}
                  </div>
                </>
              )}

              <div className="form-grid form-grid-2">
                <div className="field">
                  <label htmlFor="mains-tension">Mains tension (kg)</label>
                  <input
                    id="mains-tension"
                    type="number"
                    className="input input-mono"
                    min={5}
                    max={40}
                    step="0.5"
                    placeholder="e.g. 24"
                    value={mainsTension}
                    onChange={(e) => onMainsTensionChange(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="crosses-tension">Crosses tension (kg)</label>
                  <input
                    id="crosses-tension"
                    type="number"
                    className="input input-mono"
                    min={5}
                    max={40}
                    step="0.5"
                    placeholder="defaults to mains − 1"
                    value={crossesTension}
                    onChange={(e) => {
                      setCrossesTouched(true)
                      setCrossesTension(e.target.value)
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Job details */}
            <div className="card">
              <div className="form-section-title" style={{ marginBottom: 'var(--sp-5)' }}>
                <Calendar size={16} />
                Job Details
              </div>
              <div className="form-grid" style={{ gap: 'var(--sp-4)' }}>
                <div className="field">
                  <label htmlFor="due-date">Due date</label>
                  <input
                    id="due-date"
                    type="date"
                    className="input"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="notes">Notes</label>
                  <textarea
                    id="notes"
                    className="textarea"
                    placeholder="Any special instructions or notes for this job…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Price summary aside */}
          <div className="job-form-aside">
            <div className="card">
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--fg)', marginBottom: 'var(--sp-4)' }}>
                Price Summary
              </div>
              <div className="price-summary">
                <div className="price-row">
                  <span className="price-key">Service fee</span>
                  <span className="price-val">{money(serviceFeeNum)}</span>
                </div>
                <div className="price-row">
                  <span className="price-key">String fee</span>
                  <span className="price-val">{money(stringFeeNum)}</span>
                </div>
                <div className="price-total">
                  <span className="price-key">Total</span>
                  <span className="price-val">{money(totalNum)}</span>
                </div>
              </div>
              <div className="field" style={{ marginTop: 'var(--sp-5)' }}>
                <label htmlFor="service-fee">Service fee (€)</label>
                <input
                  id="service-fee"
                  type="number"
                  className="input input-mono"
                  min={0}
                  step="0.01"
                  value={serviceFee}
                  onChange={(e) => setServiceFee(e.target.value)}
                />
              </div>
            </div>

            {formError && (
              <p
                style={{
                  color: 'var(--status-overdue-fg)',
                  fontSize: 'var(--text-sm)',
                  marginTop: 'var(--sp-4)',
                }}
              >
                {formError}
              </p>
            )}
          </div>
        </div>
      </div>
    </form>
  )
}
